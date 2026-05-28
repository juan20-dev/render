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

  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
    body,
  });

  const raw = await res.text();
  let json: ApiEnvelope<T> = {};
  try {
    json = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : {};
  } catch {
    json = { message: raw || res.statusText };
  }

  if (!res.ok) {
    const msg = typeof json.message === 'string' ? json.message : res.statusText;
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
