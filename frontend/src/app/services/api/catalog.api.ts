import { apiFetch, apiFetchData } from '../http';
import type { Usuario, Categoria, Producto, Proveedor, Compra, OrdenProduccion, EntregaInsumo, Cliente, Pedido, Venta, Abono, Domicilio } from '../types';
import {
  pedidoEstadoUi, pedidoEstadoDb, domicilioEstadoUi, domicilioEstadoDb, prodEstadoUi, compraEstadoUi,
  ventaEstadoUi, ventaEstadoDb, abonoEstadoUi, abonoEstadoDb, metodoPagoUi, metodoPagoDb,
  uiAct, dbAct, mapUsuario, mapCategoria, mapProducto, mapProveedor, mapCompra, mapCliente,
  mapPedidoListRow, mapPedidoDetail, mapVenta, mapAbono, mapDomicilio, mapProduccion,
} from '../mappers';
import { q, rolIdByNombre, clearRolesCache } from './shared';

const sanitizeProveedorPayload = (data: Partial<Proveedor>) => {
  const trimOrUndefined = (value: unknown) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  };

  const payload: Record<string, unknown> = {
    ...data,
    nit: trimOrUndefined(data.nit),
    telefono: trimOrUndefined(data.telefono),
    email: trimOrUndefined(data.email),
    direccion: trimOrUndefined(data.direccion),
    estado: data.estado ? dbAct(data.estado) : undefined,
  };

  if (data.tipo === 'Juridica') {
    payload.nombreRazonSocial = trimOrUndefined(data.nombreRazonSocial);
    delete payload.nombre;
    delete payload.apellido;
  } else if (data.tipo === 'Natural') {
    payload.nombre = trimOrUndefined(data.nombre);
    payload.apellido = trimOrUndefined(data.apellido);
    delete payload.nombreRazonSocial;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
};


export const catalogApi = {
  categorias: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/categorias');
      return rows.map(mapCategoria);
    },
    getById: async (id: number) => mapCategoria(await apiFetchData(`/api/categorias/${id}`)),
    create: async (data: Partial<Categoria>) => {
      // Validaci├│n defensiva: asegurar que nombre y descripci├│n sean v├ílidos
      const nombre = String(data?.nombre || '').trim();
      const descripcion = String(data?.descripcion || '').trim();

      if (!nombre) {
        throw new Error('El nombre de la categor├¡a es obligatorio');
      }

      if (nombre.length < 3) {
        throw new Error('El nombre debe tener al menos 3 caracteres');
      }

      if (descripcion.length < 10) {
        throw new Error('La descripci├│n debe tener al menos 10 caracteres');
      }

      await apiFetch('/api/categorias', {
        method: 'POST',
        json: {
          nombre,
          descripcion,
          estado: dbAct((data.estado as any) || 'activo'),
        },
      });
    },
    update: async (id: number, updates: Partial<Categoria>, _motivo?: string) => {
      // Validaci├│n defensiva
      const nombre = String(updates?.nombre || '').trim();
      const descripcion = String(updates?.descripcion || '').trim();

      if (!nombre) {
        throw new Error('El nombre de la categor├¡a es obligatorio');
      }

      if (nombre.length < 3) {
        throw new Error('El nombre debe tener al menos 3 caracteres');
      }

      if (descripcion.length < 10) {
        throw new Error('La descripci├│n debe tener al menos 10 caracteres');
      }

      await apiFetch(`/api/categorias/${id}`, {
        method: 'PUT',
        json: {
          nombre,
          descripcion,
          estado: updates.estado ? dbAct(updates.estado as 'activo' | 'inactivo') : undefined,
        },
      });
    },
    delete: async (id: number, motivo: string, reubicarEnCategoriaId?: number) => {
      const json: Record<string, unknown> = { motivo };
      if (reubicarEnCategoriaId !== undefined && reubicarEnCategoriaId !== null) {
        json.reubicarEnCategoriaId = reubicarEnCategoriaId;
      }
      await apiFetch(`/api/categorias/${id}`, { method: 'DELETE', json });
    },
    changeEstado: async (id: number, estado: 'activo' | 'inactivo', motivo: string) => {
      await apiFetch(`/api/categorias/${id}/estado`, {
        method: 'PATCH',
        json: { estado: dbAct(estado), motivo },
      });
    },
  },

  productos: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/productos');
      return rows.map(mapProducto);
    },
    getById: async (id: number) => mapProducto(await apiFetchData(`/api/productos/${id}`)),
    create: async (data: Partial<Producto>) => {
      const precio = Number(data.precioVenta ?? (data as { precio?: number }).precio ?? 0);
      const env = await apiFetch<{ id?: number }>('/api/productos', {
        method: 'POST',
        json: {
          nombre: data.nombre,
          categoria_id: data.categoriaId,
          descripcion: data.descripcion,
          precio,
          stock_minimo: data.stockMinimo,
          typo: data.typo,
          tipo_producto: data.typo === 'de preparacion' ? 'preparacion' : data.typo === 'insumo' ? 'insumo' : 'terminado',
          estado: 'Activo',
          ...(data.typo === 'insumo'
            ? {
                insumo_unidad_medida: data.insumoUnidadMedida,
                insumo_cantidad_medida: data.insumoCantidadMedida,
              }
            : {}),
        },
      });
      const id = Number(env.id);
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error('No se recibió el id del producto creado');
      }
      return id;
    },
    uploadImagen: async (productoId: number, file: File) => {
      const fd = new FormData();
      fd.append('imagen', file);
      await apiFetch(`/api/productos/${productoId}/imagen`, {
        method: 'POST',
        body: fd,
      });
    },
    update: async (id: number, updates: Partial<Producto>, _motivo?: string) => {
      const precio =
        updates.precioVenta !== undefined
          ? Number(updates.precioVenta)
          : (updates as { precio?: number }).precio !== undefined
            ? Number((updates as { precio?: number }).precio)
            : undefined;
      await apiFetch(`/api/productos/${id}`, {
        method: 'PUT',
        json: {
          nombre: updates.nombre,
          categoria_id: updates.categoriaId,
          descripcion: updates.descripcion,
          ...(precio !== undefined ? { precio } : {}),
          stock_minimo: updates.stockMinimo,
          estado: updates.estado ? dbAct(updates.estado as 'activo' | 'inactivo') : undefined,
          ...(updates.typo === 'insumo'
            ? {
                insumo_unidad_medida: updates.insumoUnidadMedida,
                insumo_cantidad_medida: updates.insumoCantidadMedida,
              }
            : {}),
        },
      });
    },
    delete: async (id: number, motivo: string) => {
      await apiFetch(`/api/productos/${id}`, { method: 'DELETE', json: { motivo } });
    },
    changeEstado: async (id: number, estado: 'activo' | 'inactivo', motivo: string) => {
      await apiFetch(`/api/productos/${id}/estado`, { method: 'PATCH', json: { estado: dbAct(estado), motivo } });
    },
    incrementStock: async (_id: number, _cantidad: number) => {
      /* stock lo gestiona el backend al recibir compras */
    },
  },

  proveedores: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/proveedores');
      return rows.map(mapProveedor);
    },
    getById: async (id: number) => mapProveedor(await apiFetchData(`/api/proveedores/${id}`)),
    create: async (data: Partial<Proveedor>) => {
      await apiFetch('/api/proveedores', {
        method: 'POST',
        json: sanitizeProveedorPayload(data),
      });
    },
    update: async (id: number, updates: Partial<Proveedor>, _motivo?: string) => {
      await apiFetch(`/api/proveedores/${id}`, {
        method: 'PUT',
        json: sanitizeProveedorPayload(updates),
      });
    },
    delete: async (id: number, motivo: string) => {
      await apiFetch(`/api/proveedores/${id}`, { method: 'DELETE', json: { motivo } });
    },
    changeEstado: async (id: number, estado: 'activo' | 'inactivo', motivo: string) => {
      await apiFetch(`/api/proveedores/${id}/estado`, {
        method: 'PATCH',
        json: { estado: dbAct(estado), motivo },
      });
    },
    togglePreferente: async (id: number) => {
      const cur = await apiFetchData<any>(`/api/proveedores/${id}`);
      await apiFetch(`/api/proveedores/${id}`, { method: 'PUT', json: { preferente: !Boolean(cur.preferente) } });
    },
  },

  compras: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/compras');
      return rows.map(mapCompra);
    },
    getById: async (id: number) => {
      const raw = await apiFetchData<any>(`/api/compras/${id}`);
      return mapCompra({ ...raw, items: raw.detalles || raw.items || [] });
    },
    create: async (data: Partial<Compra> & { numeroCompra?: string }) => {
      const fechaRaw = data.fecha != null ? String(data.fecha) : '';
      const fecha =
        fechaRaw.includes('T') ? fechaRaw.split('T')[0] : fechaRaw.slice(0, 10) || fechaRaw;
      const env = await apiFetch<{ id: number }>('/api/compras', {
        method: 'POST',
        json: {
          proveedor_id: data.proveedorId,
          fecha,
          subtotal: data.subtotal ?? 0,
          iva: data.iva ?? 0,
          total: data.total ?? 0,
          observaciones: null,
        },
      });
      const cid = Number(env.id);
      if (!Number.isFinite(cid)) {
        throw new Error('La compra se cre├│ pero no se recibi├│ el identificador. Vuelva a cargar la lista.');
      }
      for (const p of data.productos || []) {
        await apiFetch('/api/compras/producto', {
          method: 'POST',
          json: {
            compraId: cid,
            productoId: p.productoId,
            cantidad: p.cantidad,
            precioUnitario: p.precioCompra,
            porcentajeGanancia: p.ganancia,
          },
        });
      }
    },
    changeEstado: async (id: number, estado: 'pendiente' | 'recibida' | 'cancelada', motivo?: string) => {
      const mapDb: Record<string, string> = { pendiente: 'Pendiente', recibida: 'Recibida', cancelada: 'Cancelada' };
      const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
      await apiFetch(`/api/compras/${id}/estado`, {
        method: 'PATCH',
        json: {
          estado: mapDb[estado],
          motivo: motivoLimpio || undefined,
          motivo_cancelacion: motivoLimpio || undefined,
        },
      });
    },
  },

  produccion: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/produccion');
      return rows.map(mapProduccion);
    },
    getById: async (id: number) => mapProduccion(await apiFetchData(`/api/produccion/${id}`)),
    getPedidosDisponibles: async () => apiFetchData<any[]>('/api/produccion/pedidos-disponibles'),
    getPedidoParaOrden: async (pedidoId: number) =>
      mapPedidoDetail(await apiFetchData(`/api/produccion/pedido/${pedidoId}`)),
    create: async (
      data: Partial<OrdenProduccion> & {
        consumoInsumos?: Array<{
          clave: string;
          insumo_nombre?: string;
          cantidad: number;
          unidad?: string;
          producto_catalogo_id?: number;
        }>;
      }
    ) => {
      const consumoRaw = data.consumoInsumos ?? [];
      const consumo_insumos = consumoRaw
        .map((item) => {
          let clave = String(item.clave || '').trim();
          const m = clave.match(/^c:(\d+)$/i);
          let producto_catalogo_id = m ? Number(m[1]) : item.producto_catalogo_id;
          if ((!clave || clave.length === 0) && producto_catalogo_id) {
            clave = `c:${producto_catalogo_id}`;
          }
          return {
            clave,
            insumo_nombre: item.insumo_nombre,
            cantidad: Number(item.cantidad),
            unidad: item.unidad || 'Unidades',
            ...(producto_catalogo_id ? { producto_catalogo_id } : {}),
          };
        })
        .filter(
          (item) =>
            item.clave &&
            item.clave.length > 0 &&
            Number.isFinite(item.cantidad) &&
            item.cantidad > 0
        );

      const env = await apiFetch<{ id: number }>('/api/produccion', {
        method: 'POST',
        json: {
          pedido_id: data.pedidoId,
          fecha: data.fechaInicio,
          productor_id: data.productorId,
          tiempo_preparacion_minutos: data.tiempoPreparacion,
          estado: data.estado || 'pendiente',
          consumo_insumos,
        },
      });
      return { id: env.id, idOrden: env.id } as OrdenProduccion;
    },
    changeEstado: async (id: number, estado: OrdenProduccion['estado'], motivo?: string) => {
      await apiFetch(`/api/produccion/${id}/estado`, {
        method: 'PATCH',
        json: { estado, motivo_cancelacion: motivo },
      });
    },
    getInsumosByProductor: async (productorId: number) => {
      return apiFetchData<any[]>(`/api/produccion/insumos-disponibles/${productorId}`);
    },
    getInsumosResumenProductor: async (productorId: number) => {
      return apiFetchData<any[]>(`/api/produccion/insumos-resumen/${productorId}`);
    },
    sugerirConsumo: async (pedidoId: number, productorId: number) => {
      return apiFetchData<{
        sugerido: Array<{ clave: string; insumo_nombre?: string; cantidad: number; unidad?: string }>;
        faltantes?: Array<{ insumo_nombre?: string; falta: number; unidad?: string }>;
      }>('/api/produccion/sugerir-consumo', {
        method: 'POST',
        json: { pedido_id: pedidoId, productor_id: productorId },
      });
    },
  },

  productoInsumos: {
    getAll: async () => apiFetchData<any[]>('/api/producto-insumos'),
    getByProducto: async (productoId: number) =>
      apiFetchData<any[]>(`/api/producto-insumos/producto/${productoId}`),
    getById: async (id: number) => apiFetchData<any>(`/api/producto-insumos/${id}`),
    create: async (data: {
      producto_id: number;
      insumo_id: number;
      cantidad_requerida: number;
      unidad: string;
      notas?: string | null;
    }) => {
      await apiFetch('/api/producto-insumos', { method: 'POST', json: data });
    },
    update: async (
      id: number,
      data: Partial<{ cantidad_requerida: number; unidad: string; notas: string | null }>
    ) => {
      await apiFetch(`/api/producto-insumos/${id}`, { method: 'PUT', json: data });
    },
    delete: async (id: number) => {
      await apiFetch(`/api/producto-insumos/${id}`, { method: 'DELETE' });
    },
  },

  entregasInsumos: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/entregas-insumos');
      return rows.map(
        (r) =>
          ({
            id: Number(r.id),
            insumo: r.insumo_nombre || String(r.insumo_id),
            cantidad: Number(r.cantidad),
            unidad: r.unidad != null ? String(r.unidad) : undefined,
            productoCatalogoId:
              r.producto_catalogo_id != null && r.producto_catalogo_id !== ''
                ? Number(r.producto_catalogo_id)
                : undefined,
            operarioId: Number(r.operario_id),
            fecha: String(r.fecha || '').split('T')[0],
            hora: r.hora || '',
            createdAt: r.created_at || '',
            anulada:
              r.anulada === true ||
              r.anulada === 't' ||
              r.anulada === 1 ||
              r.anulada === '1' ||
              r.anulada === 'true',
            motivoAnulacion:
              r.motivo_anulacion != null && r.motivo_anulacion !== ''
                ? String(r.motivo_anulacion)
                : null,
            productorNombre:
              r.operario_nombre != null && String(r.operario_nombre).trim()
                ? String(r.operario_nombre).trim()
                : undefined,
          }) as EntregaInsumo & { productorNombre?: string }
      );
    },
    create: async (
      data: Partial<EntregaInsumo> & {
        insumoId?: number;
        productoCatalogoId?: number;
        unidad?: string;
        numeroEntrega?: string;
      }
    ) => {
      const json: Record<string, unknown> = {
        cantidad: data.cantidad,
        unidad: data.unidad || 'Unidades',
        operario_id: data.operarioId,
        fecha: data.fecha,
        hora: data.hora,
      };
      if (data.numeroEntrega) json.numero_entrega = data.numeroEntrega;
      if (data.productoCatalogoId != null && data.productoCatalogoId > 0) {
        json.producto_catalogo_id = data.productoCatalogoId;
      } else if (data.insumoId != null && data.insumoId > 0) {
        json.insumo_id = data.insumoId;
      }
      await apiFetch('/api/entregas-insumos', { method: 'POST', json });
    },
    anular: async (id: number, motivo: string) => {
      await apiFetch(`/api/entregas-insumos/${id}`, { method: 'DELETE', json: { motivo } });
    },
  },

  insumos: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/insumos/resumen-gestion').catch(() =>
        apiFetchData<any[]>('/api/insumos')
      );
      return rows.map((r) => ({
        id: Number(r.id),
        nombre: String(r.nombre || ''),
        cantidad: Number(r.cantidad ?? 0),
        unidad: r.unidad,
        operario: r.operario != null ? String(r.operario) : undefined,
        fechaUltimaModificacion: r.fecha ? String(r.fecha).split('T')[0] : '',
        productoRelacionadoId:
          r.producto_catalogo_id != null && r.producto_catalogo_id !== ''
            ? Number(r.producto_catalogo_id)
            : undefined,
        origenInventario: r.origen_inventario != null ? String(r.origen_inventario) : undefined,
        categoriaNombre: r.categoria_nombre != null ? String(r.categoria_nombre) : undefined,
        presentacionCantidad:
          r.presentacion_cantidad != null && r.presentacion_cantidad !== ''
            ? Number(r.presentacion_cantidad)
            : null,
        presentacionUnidad:
          r.presentacion_unidad != null && r.presentacion_unidad !== '' ? String(r.presentacion_unidad) : null,
        stockMinimo: r.stock_minimo != null && r.stock_minimo !== '' ? Number(r.stock_minimo) : undefined,
      }));
    },
    listCatalogo: async () => {
      const rows = await apiFetchData<any[]>('/api/insumos');
      return rows.map((r) => ({
        id: Number(r.id),
        nombre: String(r.nombre || ''),
        descripcion: r.descripcion != null ? String(r.descripcion) : '',
        cantidad: Number(r.cantidad ?? 0),
        unidad: String(r.unidad || ''),
        stockMinimo: Number(r.stock_minimo ?? 0),
        estado: prodEstadoUi(r.estado) as 'activo' | 'inactivo',
      }));
    },
    create: async (data: {
      nombre: string;
      descripcion?: string;
      unidad: string;
      cantidad?: number;
      stock_minimo?: number;
      estado?: 'Activo' | 'Inactivo';
    }) => {
      await apiFetch('/api/insumos', {
        method: 'POST',
        json: {
          nombre: data.nombre,
          descripcion: data.descripcion || null,
          unidad: data.unidad,
          cantidad: data.cantidad ?? 0,
          stock_minimo: data.stock_minimo ?? 10,
          estado: data.estado || 'Activo',
        },
      });
    },
  },
};
