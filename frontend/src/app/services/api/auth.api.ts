import { apiFetch, apiFetchData } from '../http';
import type { Usuario, Categoria, Producto, Proveedor, Compra, OrdenProduccion, EntregaInsumo, Cliente, Pedido, Venta, Abono, Domicilio } from '../types';
import {
  pedidoEstadoUi, pedidoEstadoDb, domicilioEstadoUi, domicilioEstadoDb, prodEstadoUi, compraEstadoUi,
  ventaEstadoUi, ventaEstadoDb, abonoEstadoUi, abonoEstadoDb, metodoPagoUi, metodoPagoDb,
  uiAct, dbAct, mapUsuario, mapCategoria, mapProducto, mapProveedor, mapCompra, mapCliente,
  mapPedidoListRow, mapPedidoDetail, mapVenta, mapAbono, mapDomicilio, mapProduccion,
} from '../mappers';
import { clearRolesCache } from './shared';


export const authApi = {
  auth: {
    login: async (email: string, password: string, rememberMe = false) => {
      const env = await apiFetch<{
        id: number;
        email: string;
        nombre: string;
        apellido: string;
        tipo_documento?: string | null;
        documento?: string | null;
        telefono?: string | null;
        direccion?: string | null;
        rol: string;
        permisos: string[];
        cliente_id?: number | null;
        idle_timeout_ms?: number;
        estado?: string;
      }>('/api/auth/login', {
        method: 'POST',
        json: { email, password, rememberMe },
      });
      const d = env.data!;
      return {
        id: d.id,
        email: d.email,
        nombre: d.nombre,
        apellido: d.apellido,
        tipoDocumento: d.tipo_documento ?? undefined,
        numeroDocumento: d.documento ?? undefined,
        telefono: d.telefono ?? undefined,
        direccion: d.direccion ?? undefined,
        rol: d.rol as Usuario['rol'],
        permisos: Array.isArray(d.permisos) ? d.permisos : [],
        clienteId: d.cliente_id ?? undefined,
        idleTimeoutMs: d.idle_timeout_ms,
        estado: uiAct(d.estado) as Usuario['estado'],
      };
    },
    register: async (data: Record<string, unknown>) => {
      await apiFetch('/api/auth/register-cliente', {
        method: 'POST',
        json: data,
      });
      return authApi.auth.login(String(data.email), String(data.password), false).catch(() => null);
    },
    checkRegisterAvailability: async (params: { documento?: string; email?: string }) => {
      const search = new URLSearchParams();
      if (params.documento) search.set('documento', String(params.documento).replace(/\D/g, ''));
      if (params.email) search.set('email', String(params.email).trim().toLowerCase());
      return apiFetchData<{ documentoExists: boolean; emailExists: boolean }>(
        `/api/auth/register-cliente/disponibilidad?${search.toString()}`
      );
    },
    me: async () => {
      const d = await apiFetchData<{
        id: number;
        email: string;
        nombre: string;
        apellido: string;
        tipo_documento?: string | null;
        documento?: string | null;
        telefono?: string | null;
        direccion?: string | null;
        rol: string;
        permisos: string[];
        cliente_id?: number | null;
        idle_timeout_ms?: number;
        estado?: string;
      }>('/api/auth/me');
      return {
        id: d.id,
        email: d.email,
        nombre: d.nombre,
        apellido: d.apellido,
        tipoDocumento: d.tipo_documento ?? undefined,
        numeroDocumento: d.documento ?? undefined,
        telefono: d.telefono ?? undefined,
        direccion: d.direccion ?? undefined,
        rol: d.rol as Usuario['rol'],
        permisos: Array.isArray(d.permisos) ? d.permisos : [],
        clienteId: d.cliente_id ?? undefined,
        idleTimeoutMs: d.idle_timeout_ms,
        estado: uiAct(d.estado) as Usuario['estado'],
      };
    },
    logout: async () => {
      await apiFetch('/api/auth/logout', { method: 'POST', json: {} });
      clearRolesCache();
    },
    verifyCurrentPassword: async (currentPassword: string): Promise<boolean> => {
      const d = await apiFetchData<{ valid: boolean }>('/api/auth/verify-current-password', {
        method: 'POST',
        json: { currentPassword },
      });
      return !!d?.valid;
    },
    changePassword: async (currentPassword: string, newPassword: string, confirmPassword?: string) => {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        json: {
          currentPassword,
          newPassword,
          confirmPassword: confirmPassword ?? newPassword,
        },
      });
    },
    requestPasswordReset: async (email: string) => {
      await apiFetch('/api/auth/password-reset-request', {
        method: 'POST',
        json: { email },
      });
    },
  },
  public: {
    getCatalogo: async () => apiFetchData<{ productos: unknown[]; categorias: unknown[] }>('/api/public/catalogo'),
  },
};
