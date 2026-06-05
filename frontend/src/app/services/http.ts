import { formatOutgoingTextPayload } from './mappers';

export type ApiEnvelope<T = unknown> = {
  success?: boolean;
  message?: string;
  data?: T;
  id?: number;
  details?: unknown;
};

const AUTH_EVENT_NAME = 'grandmas:session-invalidated';
const AUTH_EVENT_EXCLUDED_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/logout-all',
  '/api/auth/register-cliente',
  '/api/auth/password-reset-request',
]);

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  let body: BodyInit | undefined = init?.body as BodyInit | undefined;
  if (init && 'json' in init && init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(formatOutgoingTextPayload(init.json));
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers,
      body,
    });
  } catch (networkError: unknown) {
    const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
    const hint =
      path.startsWith('/api/') && isDev
        ? ' Verifique que Elastic Beanstalk tenga desplegada la última versión del backend, que CORS_ORIGINS incluya http://localhost:3000 y reinicie el frontend (proxy VITE_API_PROXY_TARGET).'
        : '';
    const base =
      networkError instanceof Error && networkError.message
        ? networkError.message
        : 'No se pudo conectar con el servidor.';
    if (isDev) {
      console.error('[apiFetch] Error de red', path, networkError);
    }
    throw Object.assign(new Error(`${base}${hint}`), { status: 0, code: 'NETWORK_ERROR' });
  }

  const raw = await res.text();
  let json: ApiEnvelope<T> = {};
  try {
    json = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : {};
  } catch {
    json = { message: raw || res.statusText };
  }

  if (!res.ok) {
    let msg = typeof json.message === 'string' ? json.message : res.statusText;
    if (/<html|gateway time-out|504/i.test(msg)) {
      msg =
        res.status === 504
          ? 'El servidor tardó demasiado en responder. Intente de nuevo en unos segundos.'
          : 'Error de comunicación con el servidor. Intente de nuevo.';
    }
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !AUTH_EVENT_EXCLUDED_PATHS.has(path)
    ) {
      window.dispatchEvent(
        new CustomEvent(AUTH_EVENT_NAME, {
          detail: {
            message: msg || 'Tu sesión fue cerrada porque la cuenta ya no está activa.',
          },
        })
      );
    }
    throw Object.assign(new Error(msg), {
      status: res.status,
      details: json.details,
      code: (json as { code?: string }).code,
    });
  }
  if (json.success === false) {
    const msg = typeof json.message === 'string' ? json.message : 'Error en la solicitud';
    throw Object.assign(new Error(msg), {
      details: json.details,
      code: (json as { code?: string }).code,
    });
  }
  return json;
}

export async function apiFetchData<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const env = await apiFetch<T>(path, init);
  return env.data as T;
}
