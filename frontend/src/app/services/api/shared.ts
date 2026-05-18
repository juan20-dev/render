import { apiFetch, apiFetchData } from '../http';
import type { Usuario } from '../types';

export const q = (p?: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams();
  if (!p) return '';
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
};

let rolesCache: { id: number; nombre: string }[] | null = null;
export async function rolIdByNombre(nombre: string): Promise<number> {
  if (!rolesCache) {
    const rows = await apiFetchData<Array<{ id: number; nombre: string }>>('/api/roles');
    rolesCache = rows.map((r) => ({ id: Number(r.id), nombre: String(r.nombre) }));
  }
  const f = rolesCache.find((r) => r.nombre === nombre);
  if (!f) throw new Error(`Rol no encontrado: ${nombre}`);
  return f.id;
}
export function clearRolesCache() {
  rolesCache = null;
}
