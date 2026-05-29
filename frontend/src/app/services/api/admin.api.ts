import { apiFetch, apiFetchData } from '../http';
import type { Usuario, Categoria, Producto, Proveedor, Compra, OrdenProduccion, EntregaInsumo, Cliente, Pedido, Venta, Abono, Domicilio } from '../types';
import {
  pedidoEstadoUi, pedidoEstadoDb, domicilioEstadoUi, domicilioEstadoDb, prodEstadoUi, compraEstadoUi,
  ventaEstadoUi, ventaEstadoDb, abonoEstadoUi, abonoEstadoDb, metodoPagoUi, metodoPagoDb,
  uiAct, dbAct, mapUsuario, mapCategoria, mapProducto, mapProveedor, mapCompra, mapCliente,
  mapPedidoListRow, mapPedidoDetail, mapVenta, mapAbono, mapDomicilio, mapProduccion,
} from '../mappers';
import { q, rolIdByNombre, clearRolesCache } from './shared';


export const adminApi = {
  dashboard: {
    getMetricas: async () => {
      const d = await apiFetchData<{
        ventasMes: number;
        ventasHoy: number;
        pedidosActivos: number;
        clientesActivos: number;
        ventasMensuales: { month: string; ventas: number }[];
        categoriaDistribucion: { name: string; value: number }[];
        productosMasVendidos: { name: string; quantity: number }[];
        pedidosRecientes: { id: string; client: string; total: number; status: string; date: string }[];
      }>('/api/dashboard/resumen');

      return {
        ventasMes: d.ventasMes,
        ventasHoy: d.ventasHoy,
        pedidosActivos: d.pedidosActivos,
        clientesActivos: d.clientesActivos,
        ventasMensuales: (d.ventasMensuales || []).map((x) => ({ mes: x.month, total: x.ventas })),
        distribucionCategoria: (d.categoriaDistribucion || []).map((x) => ({
          nombre: x.name,
          valor: x.value,
        })),
        productosMasVendidos: (d.productosMasVendidos || []).map((x) => ({
          nombre: x.name,
          cantidad: x.quantity,
        })),
        pedidosRecientes: (d.pedidosRecientes || []).map((o) => ({
          id: Number(o.id),
          numeroPedido:
            o.numero_pedido != null && String(o.numero_pedido).trim()
              ? String(o.numero_pedido).trim()
              : undefined,
          cliente: o.client || (o as { cliente?: string }).cliente || '—',
          fecha: o.date || (o as { fecha?: string }).fecha || '',
          total: o.total,
          estado: pedidoEstadoUi(o.status),
        })),
      };
    },
    getAvailableModules: async () => {
      const d = await apiFetchData<{
        rol: string;
        permisos: string[];
        modulos: Record<string, boolean>;
      }>('/api/dashboard/modules');
      return d;
    },
  },
  roles: {
    getAll: async () => apiFetchData('/api/roles'),
    getById: async (id: number) => apiFetchData(`/api/roles/${id}`),
    create: async (body: Record<string, unknown>) => {
      const env = await apiFetch<{ id: number }>('/api/roles', { method: 'POST', json: body });
      return { id: env.id };
    },
    update: async (id: number, body: Record<string, unknown>) => {
      await apiFetch(`/api/roles/${id}`, { method: 'PUT', json: body });
    },
    updatePermisos: async (id: number, permisos: string[], motivo?: string) => {
      await apiFetch(`/api/roles/${id}/permisos`, { method: 'PUT', json: { permisos, motivo } });
    },
    delete: async (id: number, motivo: string) => {
      await apiFetch(`/api/roles/${id}`, { method: 'DELETE', json: { motivo } });
    },
    clearCache: () => {
      clearRolesCache();
    },
  },
  usuarios: {
    getAll: async (filters?: Record<string, string>) => {
      const rows = await apiFetchData<any[]>(`/api/usuarios${q(filters)}`);
      return rows.map(mapUsuario);
    },
    getById: async (id: number) => mapUsuario(await apiFetchData(`/api/usuarios/${id}`)),
    getFullDetail: async (id: number) => {
      const raw = await apiFetchData<{
        usuario: any;
        logs?: any[];
        sesiones?: Array<{ created_at?: string | null }>;
        activeSessions?: number;
      }>(`/api/usuarios/${id}/detalle-completo`);

      const usuario = mapUsuario(raw?.usuario || {});
      const historialCambios = Array.isArray(raw?.logs)
        ? raw.logs.map((log) => ({
            fecha: String(log.created_at || ''),
            usuario:
              [String(log.actor_nombre || '').trim(), String(log.actor_apellido || '').trim()]
                .filter(Boolean)
                .join(' ') || String(log.actor_email || '').trim() || 'Sistema',
            accion: String(log.accion || 'Actualización'),
            motivo:
              typeof log?.cambios?.reason === 'string' && log.cambios.reason.trim()
                ? log.cambios.reason.trim()
                : undefined,
            detalles:
              Array.isArray(log?.cambios?.changedFields) && log.cambios.changedFields.length > 0
                ? `Campos modificados: ${log.cambios.changedFields.join(', ')}`
                : undefined,
          }))
        : [];

      return {
        ...usuario,
        historialCambios,
        ultimoInicioSesion: raw?.sesiones?.[0]?.created_at
          ? String(raw.sesiones[0].created_at)
          : undefined,
        sesionesActivas: Number(raw?.activeSessions || 0),
      };
    },
    create: async (data: Partial<Usuario> & { password?: string; rol: string }) => {
      const rid = await rolIdByNombre(data.rol as string);
      await apiFetch('/api/usuarios', {
        method: 'POST',
        json: {
          nombre: data.nombre,
          apellido: data.apellido,
          tipo_documento: data.tipoDocumento,
          documento: data.numeroDocumento,
          direccion: data.direccion,
          email: data.email,
          telefono: data.telefono?.replace(/\D/g, ''),
          password: data.password,
          rol_id: rid,
          estado: dbAct((data.estado as 'activo' | 'inactivo') || 'activo'),
        },
      });
      clearRolesCache();
    },
    update: async (id: number, updates: Partial<Usuario>, _motivo?: string) => {
      const body: Record<string, unknown> = {
        nombre: updates.nombre,
        apellido: updates.apellido,
        tipo_documento: updates.tipoDocumento,
        documento: updates.numeroDocumento,
        direccion: updates.direccion,
        email: updates.email,
        telefono: updates.telefono?.replace(/\D/g, ''),
      };
      if (updates.rol) body.rol_id = await rolIdByNombre(updates.rol);
      if (updates.password) body.password = updates.password;
      if (updates.estado) body.estado = dbAct(updates.estado);
      await apiFetch(`/api/usuarios/${id}`, { method: 'PUT', json: body });
    },
    delete: async (id: number, motivo: string) => {
      await apiFetch(`/api/usuarios/${id}`, { method: 'DELETE', json: { motivo } });
    },
    changeEstado: async (id: number, estado: 'activo' | 'inactivo', motivo: string) => {
      await apiFetch(`/api/usuarios/${id}/estado`, {
        method: 'PATCH',
        json: { estado: dbAct(estado), motivo: String(motivo || '').trim(), notificar: true },
      });
    },
  },
};
