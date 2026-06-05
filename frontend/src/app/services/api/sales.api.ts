import { apiFetch, apiFetchData } from '../http';
import type { Usuario, Categoria, Producto, Proveedor, Compra, OrdenProduccion, EntregaInsumo, Cliente, Pedido, Venta, Abono, Domicilio } from '../types';
import {
  pedidoEstadoUi, pedidoEstadoDb, domicilioEstadoUi, domicilioEstadoDb, prodEstadoUi, compraEstadoUi,
  ventaEstadoUi, ventaEstadoDb, abonoEstadoUi, abonoEstadoDb, metodoPagoUi, metodoPagoDb,
  uiAct, dbAct, mapUsuario, mapCategoria, mapProducto, mapProveedor, mapCompra, mapCliente,
  mapPedidoListRow, mapPedidoDetail, mapVenta, mapAbono, mapDomicilio, mapProduccion,
} from '../mappers';
import { q, rolIdByNombre, clearRolesCache } from './shared';


export const salesApi = {
  clientes: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/clientes');
      return rows.map(mapCliente);
    },
    getById: async (id: number) => mapCliente(await apiFetchData(`/api/clientes/${id}`)),
    getByUsuarioId: async (usuarioId: number) =>
      mapCliente(await apiFetchData(`/api/clientes/usuario/${usuarioId}`)),
    uploadProfilePhoto: async (file: File) => {
      const fd = new FormData();
      fd.append('foto', file);
      const env = await apiFetch<{ foto_url?: string }>('/api/clientes/perfil/foto', {
        method: 'POST',
        body: fd,
      });
      const fotoUrl = env.data?.foto_url;
      if (!fotoUrl) {
        throw new Error('No se recibió la URL de la foto de perfil.');
      }
      return String(fotoUrl);
    },
    create: async (data: Partial<Cliente> & { estado?: string }) => {
      await apiFetch('/api/clientes', {
        method: 'POST',
        json: {
          nombre: data.nombre,
          apellido: data.apellido,
          tipo_documento: data.tipoDocumento,
          documento: data.numeroDocumento,
          telefono: data.telefono?.replace(/\D/g, ''),
          email: data.email,
          direccion: data.direccion,
          estado: data.estado ? dbAct(data.estado as 'activo' | 'inactivo') : 'Activo',
        },
      });
    },
    update: async (id: number, updates: Partial<Cliente>, _motivo?: string) => {
      await apiFetch(`/api/clientes/${id}`, {
        method: 'PUT',
        json: {
          nombre: updates.nombre,
          apellido: updates.apellido,
          tipo_documento: updates.tipoDocumento,
          documento: updates.numeroDocumento,
          telefono: updates.telefono?.replace(/\D/g, ''),
          email: updates.email,
          direccion: updates.direccion,
        },
      });
    },
    delete: async (id: number, motivo: string) => {
      await apiFetch(`/api/clientes/${id}`, { method: 'DELETE', json: { motivo } });
    },
    changeEstado: async (id: number, estado: 'activo' | 'inactivo', motivo: string) => {
      await apiFetch(`/api/clientes/${id}/estado`, {
        method: 'PATCH',
        json: { estado: dbAct(estado), motivo: String(motivo || '').trim() },
      });
    },
  },

  pedidos: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/pedidos');
      return rows.map(mapPedidoListRow);
    },
    getById: async (id: number) => mapPedidoDetail(await apiFetchData(`/api/pedidos/${id}`)),
    uploadComprobante: async (file: File) => {
      const fd = new FormData();
      fd.append('comprobante', file);
      const env = await apiFetch<{ comprobante_url?: string }>('/api/pedidos/comprobante', {
        method: 'POST',
        body: fd,
      });
      const url = env.data?.comprobante_url;
      if (!url) {
        throw new Error('No se recibió la URL del comprobante.');
      }
      return String(url);
    },
    create: async (data: Partial<Pedido>) => {
      const observaciones = String((data as Partial<Pedido> & { observaciones?: string }).observaciones || '').trim();
      const comprobanteUrl = String(
        (data as Partial<Pedido> & { comprobanteUrl?: string }).comprobanteUrl || ''
      ).trim();
      const productos = (data.productos || []).map((p) => ({
        productoId: p.productoId,
        cantidad: p.cantidad,
        precio: p.precio,
        precioUnitario: p.precio,
      }));
      const direccion = String(data.direccion || '').trim();
      const telefono = String(data.telefono || '').trim();
      const payload: Record<string, unknown> = {
        cliente_id: data.clienteId,
        fecha: data.fechaPedido,
        fecha_entrega: data.fechaEntrega,
        total: data.total,
        estado: 'Pendiente',
        metodo_pago: metodoPagoDb(String(data.metodoPago || 'transferencia')),
        esquema_abono: data.porcentajeAbono === 50 ? '50%' : '100%',
        productos,
      };
      if (observaciones.length >= 5) payload.detalles = observaciones;
      if (direccion.length >= 5) payload.direccion = direccion;
      if (telefono.length > 0) payload.telefono = telefono;
      if (comprobanteUrl) payload.comprobante_url = comprobanteUrl;
      await apiFetch('/api/pedidos', {
        method: 'POST',
        json: payload,
      });
    },
    /** Lista pedidos del cliente autenticado con líneas de detalle (nombres y cantidades). */
    getAllWithDetails: async () => {
      const rows = await apiFetchData<any[]>('/api/pedidos');
      const list = Array.isArray(rows) ? rows : [];
      return Promise.all(
        list.map(async (row) => {
          const detail = await apiFetchData(`/api/pedidos/${row.id}`);
          return mapPedidoDetail(detail);
        })
      );
    },
    update: async (id: number, updates: Partial<Pedido>) => {
      await apiFetch(`/api/pedidos/${id}`, {
        method: 'PUT',
        json: {
          numero_pedido: updates.id ? undefined : undefined,
          fecha: updates.fechaPedido,
          fecha_entrega: updates.fechaEntrega,
          direccion: updates.direccion,
          telefono: updates.telefono,
          total: updates.total,
          metodo_pago: updates.metodoPago ? metodoPagoDb(updates.metodoPago) : undefined,
          esquema_abono: updates.porcentajeAbono === 50 ? '50%' : updates.porcentajeAbono === 100 ? '100%' : undefined,
          estado: updates.estado ? pedidoEstadoDb(updates.estado) : undefined,
        },
      });
    },
    changeEstado: async (id: number, estado: Pedido['estado'], motivo?: string) => {
      await apiFetch(`/api/pedidos/${id}/estado`, {
        method: 'PATCH',
        json: { estado: pedidoEstadoDb(estado), motivo },
      });
    },
    delete: async (_id: number) => {
      /* opcional */
    },
  },

  ventas: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/ventas');
      return rows.map(mapVenta);
    },
    create: async (data: Partial<Venta>) => {
      const cid = data.clienteId != null && Number.isFinite(Number(data.clienteId)) && Number(data.clienteId) > 0 ? Number(data.clienteId) : null;

      const coerceMoney = (v: unknown): number => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (v === null || v === undefined) return 0;
        let s = String(v).trim().replace(/\s/g, '');
        if (!s) return 0;
        if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/\./g, '');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };
      const items = (data.productos || [])
        .map((p) => ({
          productoId: Number(p.productoId),
          cantidad: Math.trunc(Number(p.cantidad)),
          precioUnitario: coerceMoney(p.precio),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.productoId) &&
            row.productoId > 0 &&
            Number.isFinite(row.cantidad) &&
            row.cantidad > 0 &&
            Number.isFinite(row.precioUnitario) &&
            row.precioUnitario >= 0,
        );

      if ((data.productos?.length ?? 0) > 0 && items.length === 0) {
        throw new Error('Revise los productos: cantidad, precio e ID deben ser v├ílidos.');
      }

      const env = await apiFetch<{ id: number }>('/api/ventas', {
        method: 'POST',
        json: {
          tipo: data.tipo === 'por pedido' ? 'Por Pedido' : 'Directa',
          ...(cid != null ? { cliente_id: cid } : {}),
          pedido_id: data.pedidoId ?? null,
          fecha:
            typeof data.fecha === 'string' && data.fecha.trim() !== ''
              ? data.fecha.trim().split('T')[0]
              : new Date().toISOString().split('T')[0],
          metodopago: metodoPagoDb(String(data.metodoPago || 'efectivo')),
          total: coerceMoney(data.total),
          estado: ventaEstadoDb(String(data.estado || 'pendiente')),
          ...(items.length > 0 ? { items } : {}),
        },
      });
      const rawId = (env as { id?: number; data?: { id?: number } }).id ?? (env as { data?: { id?: number } }).data?.id;
      const vid = Number(rawId);
      if (!Number.isFinite(vid)) {
        throw new Error('No se recibi├│ el id de la venta. Intente de nuevo o revise la sesi├│n.');
      }
      return { id: vid, ...data } as Venta;
    },
    changeEstado: async (id: number, estado: Venta['estado']) => {
      await apiFetch(`/api/ventas/${id}/estado`, {
        method: 'PATCH',
        json: { estado: ventaEstadoDb(estado) },
      });
    },
  },

  abonos: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/abonos');
      return rows.map(mapAbono);
    },
    create: async (data: Partial<Abono>) => {
      await apiFetch('/api/abonos', {
        method: 'POST',
        json: {
          pedido_id: data.pedidoId,
          monto: data.montoAbonado,
          porcentaje: data.porcentajeAbonado,
          fecha: data.fecha,
          metodo_pago: metodoPagoDb(String(data.metodoPago || 'efectivo')),
        },
      });
    },
    changeEstado: async (id: number, estado: Abono['estado']) => {
      await apiFetch(`/api/abonos/${id}/estado`, {
        method: 'PATCH',
        json: { estado: abonoEstadoDb(estado) },
      });
    },
  },

  domicilios: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/domicilios');
      return rows.map(mapDomicilio);
    },
    getById: async (id: number): Promise<Domicilio> => {
      const row = await apiFetchData<any>(`/api/domicilios/${id}`);
      return mapDomicilio(row);
    },
    create: async (
      data: Partial<Domicilio> & {
        fechaEntrega?: string;
        fechaPedido?: string;
        repartidorNombre?: string;
        direccionFallback?: string;
      }
    ) => {
      const pedidoId = Number(data.pedidoId);
      const repartidorId = Number(data.repartidorId);
      if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
        throw new Error('Seleccione un pedido v├ílido');
      }
      if (!Number.isFinite(repartidorId) || repartidorId <= 0) {
        throw new Error('Seleccione un repartidor v├ílido');
      }

      let nombreRep = String(data.repartidorNombre || '').trim();
      if (nombreRep) {
        nombreRep = nombreRep.slice(0, 100);
      }

      const fechaHint =
        (data.fechaEntrega && String(data.fechaEntrega).trim()
          ? String(data.fechaEntrega).split('T')[0]
          : '') ||
        (data.fechaPedido && String(data.fechaPedido).trim()
          ? String(data.fechaPedido).split('T')[0]
          : '');

      const jsonBody: Record<string, unknown> = {
        pedido_id: pedidoId,
        repartidor_id: repartidorId,
        estado: 'Pendiente',
        hora: null,
        detalle: null,
      };

      if (nombreRep) {
        jsonBody.repartidor = nombreRep;
      }

      const fallback = String(data.direccionFallback || '').trim();
      if (fallback) {
        jsonBody.direccion = fallback.slice(0, 2000);
      }
      if (fechaHint) {
        jsonBody.fecha = fechaHint;
      }

      await apiFetch('/api/domicilios', {
        method: 'POST',
        json: jsonBody,
      });
    },
    changeEstado: async (id: number, estado: Domicilio['estado'], motivo?: string) => {
      await apiFetch(`/api/domicilios/${id}/estado`, {
        method: 'PATCH',
        json: {
          estado: domicilioEstadoDb(estado),
          motivo_cancelacion: motivo,
        },
      });
    },
    update: async (
      id: number,
      data: { repartidorId?: number; repartidorNombre?: string }
    ) => {
      const body: Record<string, unknown> = {};
      if (data.repartidorId !== undefined && data.repartidorId !== null) {
        const rid = Number(data.repartidorId);
        if (Number.isFinite(rid) && rid > 0) {
          body.repartidor_id = rid;
        }
      }
      if (data.repartidorNombre !== undefined) {
        const n = String(data.repartidorNombre || '').trim().slice(0, 100);
        if (n) body.repartidor = n;
      }
      if (Object.keys(body).length === 0) {
        throw new Error('No hay cambios para actualizar el domicilio');
      }
      await apiFetch(`/api/domicilios/${id}`, {
        method: 'PUT',
        json: body,
      });
    },
  },
};
