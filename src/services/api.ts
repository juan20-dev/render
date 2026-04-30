/**
 * API Service - Conexión con Backend PostgreSQL
 * Archivo: src/services/api.ts
 * 
 * Este archivo contiene todas las funciones para comunicarse con el backend
 * y realizar operaciones CRUD en la base de datos PostgreSQL.
 */

const API_BASE_URLS = [
  (import.meta as any).env?.VITE_API_URL,
  'http://localhost:3002',
].filter(Boolean);

type LoadingListener = (isLoading: boolean) => void;
type UnauthorizedListener = () => void;

let activeApiRequests = 0;
const loadingListeners = new Set<LoadingListener>();
const unauthorizedListeners = new Set<UnauthorizedListener>();

const notifyLoadingListeners = () => {
  const isLoading = activeApiRequests > 0;
  loadingListeners.forEach((listener) => listener(isLoading));
};

const notifyUnauthorizedListeners = () => {
  unauthorizedListeners.forEach((listener) => listener());
};

const beginApiRequest = () => {
  activeApiRequests += 1;
  notifyLoadingListeners();
};

const endApiRequest = () => {
  activeApiRequests = Math.max(0, activeApiRequests - 1);
  notifyLoadingListeners();
};

export const subscribeApiLoading = (listener: LoadingListener) => {
  loadingListeners.add(listener);
  listener(activeApiRequests > 0);

  return () => {
    loadingListeners.delete(listener);
  };
};

export const subscribeApiUnauthorized = (listener: UnauthorizedListener) => {
  unauthorizedListeners.add(listener);

  return () => {
    unauthorizedListeners.delete(listener);
  };
};

/**
 * Función genérica para hacer peticiones HTTP
 */
export const apiCall = async (
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: any
) => {
  beginApiRequest();

  const options: RequestInit = {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  let lastError: unknown;

  try {
    for (const baseUrl of API_BASE_URLS) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, options);

        if (!response.ok) {
          let errorMessage = `API Error: ${response.status} ${response.statusText}`;

          try {
            const errorBody = await response.json();
            if (errorBody?.message) {
              errorMessage = errorBody.message;
            }
          } catch {
            // Si el backend no devuelve JSON, conservamos el mensaje HTTP por defecto.
          }

          const httpError: any = new Error(errorMessage);
          httpError.isHttpError = true;
          httpError.status = response.status;
          httpError.statusText = response.statusText;
          httpError.message = errorMessage;

          // Any protected endpoint returning 401 means auth cookie is invalid or expired.
          if (response.status === 401) {
            notifyUnauthorizedListeners();
          }

          throw httpError;
        }

        const result = await response.json();

        // Algún servidor responde 200 con body { success: false } (debemos tratarlo como error)
        if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
          if ('success' in result && result.success === false) {
            let errorMessage = 'La solicitud no se completó correctamente.';
            if (typeof (result as any).message === 'string' && (result as any).message.trim()) {
              errorMessage = (result as any).message.trim();
            }
            const logicalError: any = new Error(errorMessage);
            logicalError.isHttpError = true;
            logicalError.status = response.status;
            logicalError.message = errorMessage;
            if (response.status === 401) {
              notifyUnauthorizedListeners();
            }
            throw logicalError;
          }

          /**
           * Listados típicos: { success: true, data: [...] } → devolver solo la lista.
           * Alta con id raíz { success: true, id: n }: no hacer unwrap sobre `data` o el cliente pierde id.
           */
          const hasExplicitId =
            Object.prototype.hasOwnProperty.call(result, 'id') && (result as { id?: unknown }).id != null;
          if (result.success === true && result.data !== undefined && !hasExplicitId) {
            return result.data;
          }
        }

        return result;
      } catch (error) {
        if ((error as any)?.isHttpError) {
          throw error;
        }
        lastError = error;
      }
    }

    console.error(`Error en petición a ${endpoint}:`, lastError);
    throw lastError;
  } finally {
    endApiRequest();
  }
};

const apiUpload = async (endpoint: string, fileFieldName: string, file: File) => {
  beginApiRequest();
  let lastError: unknown;

  try {
    const formData = new FormData();
    formData.append(fileFieldName, file);

    for (const baseUrl of API_BASE_URLS) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          body: formData,
        });

        if (!response.ok) {
          let errorMessage = `API Error: ${response.status} ${response.statusText}`;
          try {
            const errorBody = await response.json();
            if (errorBody?.message) errorMessage = errorBody.message;
          } catch {
            // Conserva mensaje por defecto cuando no viene JSON.
          }

          const httpError: any = new Error(errorMessage);
          httpError.isHttpError = true;
          httpError.status = response.status;
          httpError.statusText = response.statusText;
          throw httpError;
        }

        const result = await response.json();
        if (result.success && result.data !== undefined) return result.data;
        return result;
      } catch (error) {
        if ((error as any)?.isHttpError) throw error;
        lastError = error;
      }
    }

    throw lastError;
  } finally {
    endApiRequest();
  }
};

const toNumberOrUndefined = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toNumberOrZero = (value: any): number => {
  const parsed = toNumberOrUndefined(value);
  return parsed ?? 0;
};

const normalizeTipoDocumento = (value: any): any => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pp' || normalized === 'pasaporte') return 'Pasaporte';
  return value;
};

const normalizeVentaEstado = (value: any): any => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'anulada' || normalized === 'anulado') return 'Cancelada';
  return value;
};

const normalizeAbonoEstado = (value: any): any => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'activo') return 'Registrado';
  if (normalized === 'anulado' || normalized === 'anulada') return 'Cancelado';
  return value;
};

const normalizeClientePayload = (data: any) => ({
  ...data,
  tipoDocumento: normalizeTipoDocumento(data?.tipoDocumento ?? data?.tipo_documento),
  documento: data?.documento ?? data?.numeroDocumento,
  estado: data?.estado ?? 'Activo',
});

const normalizeAuthRegisterPayload = (data: any) => ({
  ...normalizeClientePayload(data),
  password: data?.password,
});

const normalizeProveedorPayload = (data: any) => ({
  ...data,
  tipoPersona: data?.tipoPersona ?? data?.tipo_persona,
  nombreEmpresa: data?.nombreEmpresa ?? data?.nombre_empresa,
  tipoDocumento: data?.tipoDocumento ?? data?.tipo_documento,
  numeroDocumento: data?.numeroDocumento ?? data?.numero_documento,
  estado: data?.estado ?? 'Activo',
  preferente: data?.preferente ?? false,
  rating: data?.rating,
  observaciones: data?.observaciones,
});

const normalizePedidoPayload = (data: any) => ({
  ...data,
  numero_pedido: data?.numero_pedido ?? `PED-${Date.now()}`,
  cliente_id: toNumberOrZero(data?.cliente_id ?? data?.clienteId),
  fecha: data?.fecha ?? new Date().toISOString().split('T')[0],
  fecha_entrega: data?.fecha_entrega ?? data?.fechaEntrega ?? null,
  detalles: data?.detalles ?? null,
  total: toNumberOrZero(data?.total),
  estado: data?.estado ?? 'Pendiente',
});

const normalizeVentaPayload = (data: any) => ({
  ...data,
  numero_venta: data?.numero_venta ?? `VEN-${Date.now()}`,
  tipo: data?.tipo ?? 'Directa',
  cliente_id: toNumberOrUndefined(data?.cliente_id ?? data?.clienteId) ?? null,
  pedido_id: toNumberOrUndefined(data?.pedido_id ?? data?.pedidoId) ?? null,
  fecha: data?.fecha ?? new Date().toISOString().split('T')[0],
  metodopago: data?.metodopago ?? data?.metodoPago ?? data?.metodo_pago,
  total: toNumberOrZero(data?.total),
  estado: normalizeVentaEstado(data?.estado ?? 'Completada'),
});

const normalizeAbonoPayload = (data: any) => ({
  ...data,
  numero_abono: data?.numero_abono ?? `ABO-${Date.now()}`,
  pedido_id: toNumberOrZero(data?.pedido_id ?? data?.pedidoId),
  cliente_id: toNumberOrZero(data?.cliente_id ?? data?.clienteId),
  monto: toNumberOrZero(data?.monto),
  fecha: data?.fecha ?? new Date().toISOString().split('T')[0],
  metodo_pago: data?.metodo_pago ?? data?.metodoPago ?? data?.metodopago,
  estado: normalizeAbonoEstado(data?.estado ?? 'Registrado'),
});

const normalizeDomicilioPayload = async (data: any) => {
  const payload: any = {
    ...data,
    numero_domicilio: data?.numero_domicilio ?? `DOM-${Date.now()}`,
    pedido_id: toNumberOrZero(data?.pedido_id ?? data?.pedidoId),
    cliente_id: toNumberOrUndefined(data?.cliente_id ?? data?.clienteId),
    fecha: data?.fecha ?? new Date().toISOString().split('T')[0],
    estado: data?.estado ?? 'Pendiente',
    detalle: data?.detalle ?? data?.detalles ?? null,
  };

  if (!payload.cliente_id && payload.pedido_id) {
    try {
      const pedido = await apiCall(`/api/pedidos/${payload.pedido_id}`);
      payload.cliente_id = toNumberOrZero((pedido as any)?.cliente_id);
    } catch {
      // If lookup fails, backend validation will return a precise error.
    }
  }

  return payload;
};

const normalizeCompraPayload = async (data: any) => {
  const total = toNumberOrZero(data?.total);
  const requiereAprobacion = total >= 10000;
  const payload: any = {
    ...data,
    numero_compra: data?.numero_compra ?? `COM-${Date.now()}`,
    proveedor_id: toNumberOrUndefined(data?.proveedor_id ?? data?.proveedor),
    fecha: data?.fecha ?? new Date().toISOString().split('T')[0],
    subtotal: toNumberOrZero(data?.subtotal),
    iva: toNumberOrZero(data?.iva),
    total,
    estado: data?.estado ?? 'Pendiente',
    requiere_aprobacion: data?.requiere_aprobacion ?? requiereAprobacion,
    aprobacion_extraordinaria: data?.aprobacion_extraordinaria ?? requiereAprobacion,
    motivo_aprobacion: data?.motivo_aprobacion ?? null,
  };

  if (!payload.proveedor_id && typeof data?.proveedor === 'string' && data.proveedor.trim()) {
    try {
      const proveedoresList = await apiCall('/api/proveedores');
      const matched = Array.isArray(proveedoresList)
        ? proveedoresList.find((p: any) => {
            const natural = `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim();
            return p?.nombre_empresa === data.proveedor || natural === data.proveedor;
          })
        : null;
      payload.proveedor_id = toNumberOrUndefined(matched?.id) ?? null;
    } catch {
      // Backend response will guide if proveedor_id is still missing.
    }
  }

  if (payload.proveedor_id === undefined) payload.proveedor_id = null;
  return payload;
};

const normalizeEntregaInsumoPayload = async (data: any) => {
  const payload: any = {
    ...data,
    numero_entrega: data?.numero_entrega ?? `ENT-${Date.now()}`,
    insumo_id: toNumberOrUndefined(data?.insumo_id),
    cantidad: toNumberOrZero(data?.cantidad),
    fecha: data?.fecha ?? new Date().toISOString().split('T')[0],
  };

  const insumoNombre = data?.insumo;
  if (!payload.insumo_id && typeof insumoNombre === 'string' && insumoNombre.trim()) {
    try {
      const insumosList = await apiCall('/api/insumos');
      const matched = Array.isArray(insumosList)
        ? insumosList.find((i: any) => i?.nombre === insumoNombre)
        : null;
      payload.insumo_id = toNumberOrUndefined(matched?.id);
    } catch {
      // Backend response will guide if insumo_id is still missing.
    }
  }

  return payload;
};

const normalizeProduccionPayload = async (data: any) => {
  const payload: any = {
    ...data,
    numero_produccion: data?.numero_produccion ?? `PROD-${Date.now()}`,
    producto_id: toNumberOrUndefined(data?.producto_id),
    pedido_id: toNumberOrUndefined(data?.pedido_id),
    cantidad: toNumberOrZero(data?.cantidad),
    fecha: data?.fecha ?? data?.fechaInicio ?? new Date().toISOString().split('T')[0],
    responsable: data?.responsable ?? data?.operario,
    tiempo_preparacion_minutos: toNumberOrZero(data?.tiempo_preparacion_minutos),
    estado: data?.estado ?? 'Orden Recibida',
    notes: data?.notes ?? data?.detalle ?? data?.lote ?? null,
  };

  const productoNombre = data?.producto;
  if (!payload.producto_id && typeof productoNombre === 'string' && productoNombre.trim()) {
    try {
      const productosList = await apiCall('/api/productos');
      const matched = Array.isArray(productosList)
        ? productosList.find((p: any) => p?.nombre === productoNombre)
        : null;
      payload.producto_id = toNumberOrUndefined(matched?.id);
    } catch {
      // Backend response will guide if producto_id is still missing.
    }
  }

  return payload;
};

const mergeWithCurrent = async (endpoint: string, patch: any) => {
  try {
    const current = await apiCall(endpoint);
    return { ...(current as any), ...(patch as any) };
  } catch {
    return patch;
  }
};

// ==================== CATÁLOGO PÚBLICO (sin JWT) ====================
export type PublicCatalogProducto = {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen_url: string;
  categoria: string;
};

export type PublicCatalogCategoria = {
  id: number;
  nombre: string;
};

export type PublicCatalogoResponse = {
  productos: PublicCatalogProducto[];
  categorias: PublicCatalogCategoria[];
};

export const publicCatalog = {
  getCatalogo: (): Promise<PublicCatalogoResponse> => apiCall('/api/public/catalogo'),
};

// ==================== CATEGORÍAS ====================
export const categorias = {
  getAll: () => apiCall('/api/categorias'),
  getById: (id: number) => apiCall(`/api/categorias/${id}`),
  create: (data: { nombre: string; descripcion?: string }) =>
    apiCall('/api/categorias', 'POST', data),
  update: (id: number, data: { nombre: string; descripcion?: string }) =>
    apiCall(`/api/categorias/${id}`, 'PUT', data),
  updateStatus: (id: number, data: { estado: 'Activo' | 'Inactivo'; motivo: string }) =>
    apiCall(`/api/categorias/${id}/estado`, 'PUT', data),
  delete: (id: number) => apiCall(`/api/categorias/${id}`, 'DELETE'),
};

// ==================== PRODUCTOS ====================
export const productos = {
  getAll: () => apiCall('/api/productos'),
  getById: (id: number) => apiCall(`/api/productos/${id}`),
  getByCategory: (categoryId: number) => 
    apiCall(`/api/productos/categoria/${categoryId}`),
  create: (data: {
    nombre: string;
    categoria_id: number;
    descripcion?: string;
    precio: number;
    stock?: number;
    stock_minimo?: number;
    imagen_url?: string;
  }) => apiCall('/api/productos', 'POST', data),
  update: (id: number, data: any) =>
    apiCall(`/api/productos/${id}`, 'PUT', data),
  updateStatus: (id: number, data: { estado: 'Activo' | 'Inactivo'; motivo: string }) =>
    apiCall(`/api/productos/${id}/estado`, 'PUT', data),
  delete: (id: number) => apiCall(`/api/productos/${id}`, 'DELETE'),
};

// ==================== CLIENTES ====================
export const clientes = {
  getAll: () => apiCall('/api/clientes'),
  getById: (id: number) => apiCall(`/api/clientes/${id}`),
  getByEmail: (email: string) => apiCall(`/api/clientes/email/${encodeURIComponent(email)}`),
  getByUsuarioId: (usuarioId: number) => apiCall(`/api/clientes/usuario/${usuarioId}`),
  getByDocumento: (documento: string) =>
    apiCall(`/api/clientes/documento/${documento}`),
  create: (data: {
    nombre: string;
    apellido: string;
    tipoDocumento?: string;
    documento?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    foto_url?: string;
    estado?: string;
  }) => apiCall('/api/clientes', 'POST', normalizeClientePayload(data)),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/clientes/${id}`, data);
    return apiCall(`/api/clientes/${id}`, 'PUT', normalizeClientePayload(merged));
  },
  uploadProfilePhoto: (file: File) => apiUpload('/api/clientes/perfil/foto', 'foto', file),
  delete: (id: number) => apiCall(`/api/clientes/${id}`, 'DELETE'),
};

// ==================== PROVEEDORES ====================
export const proveedores = {
  getAll: () => apiCall('/api/proveedores'),
  getById: (id: number) => apiCall(`/api/proveedores/${id}`),
  getByNit: (nit: string) => apiCall(`/api/proveedores/nit/${encodeURIComponent(nit)}`),
  getByEmail: (email: string) => apiCall(`/api/proveedores/email/${encodeURIComponent(email)}`),
  getByTelefono: (telefono: string) => apiCall(`/api/proveedores/telefono/${encodeURIComponent(telefono)}`),
  getHistory: (id: number) => apiCall(`/api/proveedores/${id}/historial`),
  getPendingPurchases: (id: number) => apiCall(`/api/proveedores/${id}/pendientes`),
  create: (data: {
    tipoPersona: string;
    nombreEmpresa?: string;
    nit?: string;
    nombre: string;
    apellido?: string;
    tipoDocumento?: string;
    numeroDocumento?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    estado?: string;
    preferente?: boolean;
    rating?: number;
    observaciones?: string;
  }) => apiCall('/api/proveedores', 'POST', normalizeProveedorPayload(data)),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/proveedores/${id}`, data);
    return apiCall(`/api/proveedores/${id}`, 'PUT', normalizeProveedorPayload(merged));
  },
  updateStatus: (id: number, data: { estado: string; motivo: string }) =>
    apiCall(`/api/proveedores/${id}/estado`, 'PUT', data),
  delete: (id: number, data?: { motivo?: string }) => apiCall(`/api/proveedores/${id}`, 'DELETE', data),
};

// ==================== PEDIDOS ====================
export const pedidos = {
  getAll: () => apiCall('/api/pedidos'),
  getByCliente: (clienteId: number) => apiCall(`/api/pedidos/cliente/${clienteId}`),
  getById: (id: number) => apiCall(`/api/pedidos/${id}`),
  getDetalles: async (id: number) => {
    const pedido = await apiCall(`/api/pedidos/${id}`);
    return Array.isArray((pedido as any)?.detalles)
      ? (pedido as any).detalles
      : [];
  },
  create: (data: {
    numero_pedido?: string;
    cliente_id: number;
    fecha?: string;
    fecha_entrega?: string;
    detalles?: string;
    total?: number;
    estado?: string;
  }) => apiCall('/api/pedidos', 'POST', normalizePedidoPayload(data)),
  addProducto: (data: {
    pedidoId: number;
    productoId: number;
    cantidad: number;
    precioUnitario: number;
  }) => apiCall('/api/pedidos/producto', 'POST', data),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/pedidos/${id}`, data);
    return apiCall(`/api/pedidos/${id}`, 'PUT', normalizePedidoPayload(merged));
  },
  updateStatus: (id: number, data: { estado: string; motivo?: string }) =>
    apiCall(`/api/pedidos/${id}/estado`, 'PUT', data),
  delete: (id: number) => apiCall(`/api/pedidos/${id}`, 'DELETE'),
};

// ==================== VENTAS ====================
export const ventas = {
  getAll: () => apiCall('/api/ventas'),
  getByCliente: (
    clienteId: number,
    params?: { numero_venta?: string; fecha_desde?: string; fecha_hasta?: string }
  ) => {
    const search = new URLSearchParams();
    if (params?.numero_venta) search.set('numero_venta', params.numero_venta);
    if (params?.fecha_desde) search.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) search.set('fecha_hasta', params.fecha_hasta);
    const qs = search.toString();
    return apiCall(`/api/ventas/cliente/${clienteId}${qs ? `?${qs}` : ''}`);
  },
  getById: (id: number) => apiCall(`/api/ventas/${id}`),
  getDetalles: async (id: number) => {
    const venta = await apiCall(`/api/ventas/${id}`);
    if (Array.isArray((venta as any)?.detalles)) return (venta as any).detalles;
    return Array.isArray((venta as any)?.items) ? (venta as any).items : [];
  },
  create: (data: {
    numero_venta: string;
    tipo: string;
    cliente_id?: number;
    pedido_id?: number;
    fecha: string;
    metodoPago?: string;
    total?: number;
    estado?: string;
  }) => apiCall('/api/ventas', 'POST', normalizeVentaPayload(data)),
  createCompleta: (data: {
    numero_venta: string;
    tipo: string;
    cliente_id: number;
    pedido_id?: number | null;
    fecha: string;
    metodopago: string;
    total?: number;
    estado?: string;
    items: Array<{ productoId: number; cantidad: number; precioUnitario: number }>;
  }) => {
    const { items, ...venta } = data;
    return apiCall('/api/ventas', 'POST', { ...normalizeVentaPayload(venta), items });
  },
  addProducto: (data: {
    ventaId: number;
    productoId: number;
    cantidad: number;
    precioUnitario: number;
  }) => apiCall('/api/ventas/producto', 'POST', data),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/ventas/${id}`, data);
    return apiCall(`/api/ventas/${id}`, 'PUT', normalizeVentaPayload(merged));
  },
  delete: (id: number) => apiCall(`/api/ventas/${id}`, 'DELETE'),
};

// ==================== ABONOS ====================
export const abonos = {
  getAll: () => apiCall('/api/abonos'),
  getById: (id: number) => apiCall(`/api/abonos/${id}`),
  getByPedido: (pedidoId: number) =>
    apiCall(`/api/abonos/pedido/${pedidoId}`),
  create: (data: {
    numero_abono: string;
    pedido_id: number;
    cliente_id: number;
    monto: number;
    fecha: string;
    metodo_pago?: string;
    estado?: string;
  }) => apiCall('/api/abonos', 'POST', normalizeAbonoPayload(data)),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/abonos/${id}`, data);
    return apiCall(`/api/abonos/${id}`, 'PUT', normalizeAbonoPayload(merged));
  },
  updateStatus: (id: number, data: { estado: string; motivo?: string }) =>
    apiCall(`/api/abonos/${id}/estado`, 'PUT', data),
  delete: (id: number) => apiCall(`/api/abonos/${id}`, 'DELETE'),
};

// ==================== DOMICILIOS ====================
export const domicilios = {
  getAll: () => apiCall('/api/domicilios'),
  getByCliente: (clienteId: number) => apiCall(`/api/domicilios/cliente/${clienteId}`),
  getById: (id: number) => apiCall(`/api/domicilios/${id}`),
  getByPedido: (pedidoId: number) =>
    apiCall(`/api/domicilios/pedido/${pedidoId}`),
  create: (data: {
    numero_domicilio: string;
    pedido_id: number;
    cliente_id: number;
    direccion: string;
    repartidor?: string;
    fecha: string;
    hora?: string;
    estado?: string;
    detalle?: string;
  }) => normalizeDomicilioPayload(data).then((payload) => apiCall('/api/domicilios', 'POST', payload)),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/domicilios/${id}`, data);
    const payload = await normalizeDomicilioPayload(merged);
    return apiCall(`/api/domicilios/${id}`, 'PUT', payload);
  },
  delete: (id: number) => apiCall(`/api/domicilios/${id}`, 'DELETE'),
};

// ==================== COMPRAS ====================
export const compras = {
  getAll: () => apiCall('/api/compras'),
  getById: (id: number) => apiCall(`/api/compras/${id}`),
  getDetalles: async (id: number) => {
    const compra = await apiCall(`/api/compras/${id}`);
    return Array.isArray((compra as any)?.detalles)
      ? (compra as any).detalles
      : [];
  },
  create: (data: {
    numero_compra: string;
    proveedor_id: number;
    fecha: string;
    fecha_creacion?: string;
    subtotal?: number;
    iva?: number;
    total?: number;
    estado?: string;
    observaciones?: string;
    aprobacion_extraordinaria?: boolean;
    motivo_aprobacion?: string;
  }) => normalizeCompraPayload(data).then((payload) => apiCall('/api/compras', 'POST', payload)),
  addProducto: (data: {
    compraId: number;
    productoId: number;
    cantidad: number;
    precioUnitario: number;
    porcentajeGanancia?: number;
    permisoExtraordinario?: boolean;
    motivoPermiso?: string;
  }) => apiCall('/api/compras/producto', 'POST', data),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/compras/${id}`, data);
    const payload = await normalizeCompraPayload(merged);
    return apiCall(`/api/compras/${id}`, 'PUT', payload);
  },
  updateStatus: (
    id: number,
    data: {
      estado: 'Pendiente' | 'Recibida' | 'Cancelada';
      confirmacion_recibido?: boolean;
      motivo_cancelacion?: string;
    }
  ) => apiCall(`/api/compras/${id}/estado`, 'PUT', data),
  delete: (id: number) => apiCall(`/api/compras/${id}`, 'DELETE'),
};

// ==================== INSUMOS ====================
export const insumos = {
  getAll: () => apiCall('/api/insumos'),
  getById: (id: number) => apiCall(`/api/insumos/${id}`),
  create: (data: {
    nombre: string;
    descripcion?: string;
    cantidad?: number;
    unidad?: string;
    stock_minimo?: number;
    estado?: string;
  }) => apiCall('/api/insumos', 'POST', data),
  update: (id: number, data: any) =>
    apiCall(`/api/insumos/${id}`, 'PUT', data),
  delete: (id: number) => apiCall(`/api/insumos/${id}`, 'DELETE'),
};

// ==================== ENTREGAS INSUMOS ====================
export const entregas_insumos = {
  getAll: () => apiCall('/api/entregas-insumos'),
  getById: (id: number) => apiCall(`/api/entregas-insumos/${id}`),
  create: (data: {
    numero_entrega: string;
    insumo_id: number;
    cantidad: number;
    unidad?: string;
    operario?: string;
    fecha: string;
    hora?: string;
  }) => normalizeEntregaInsumoPayload(data).then((payload) => apiCall('/api/entregas-insumos', 'POST', payload)),
  update: (id: number, data: any) =>
    normalizeEntregaInsumoPayload(data).then((payload) => apiCall(`/api/entregas-insumos/${id}`, 'PUT', payload)),
  delete: (id: number) => apiCall(`/api/entregas-insumos/${id}`, 'DELETE'),
};

// ==================== PRODUCCIÓN ====================
export const produccion = {
  getAll: () => apiCall('/api/produccion'),
  getById: (id: number) => apiCall(`/api/produccion/${id}`),
  create: (data: {
    numero_produccion: string;
    producto_id: number;
    pedido_id?: number | null;
    cantidad: number;
    fecha: string;
    responsable?: string;
    tiempo_preparacion_minutos?: number;
    estado?: string;
    notes?: string;
    insumos_gastados?: Array<any>;
  }) => normalizeProduccionPayload(data).then((payload) => apiCall('/api/produccion', 'POST', payload)),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/produccion/${id}`, data);
    const payload = await normalizeProduccionPayload(merged);
    return apiCall(`/api/produccion/${id}`, 'PUT', payload);
  },
  updateStatus: (
    id: number,
    data: {
      estado: 'Orden Recibida' | 'Orden en preparacion' | 'Orden Lista' | 'Cancelada';
      motivo_cancelacion?: string;
    }
  ) => apiCall(`/api/produccion/${id}/estado`, 'PUT', data),
  delete: (id: number) => apiCall(`/api/produccion/${id}`, 'DELETE'),
};

// ==================== ROLES ====================
export const roles = {
  getAll: () => apiCall('/api/roles'),
  getById: (id: number) => apiCall(`/api/roles/${id}`),
  getAuditById: (id: number) => apiCall(`/api/roles/${id}/auditoria`),
  create: (data: {
    nombre: string;
    descripcion?: string;
    permisos?: string[];
    estado?: string;
  }) => apiCall('/api/roles', 'POST', data),
  update: async (id: number, data: any) => {
    const merged = await mergeWithCurrent(`/api/roles/${id}`, data);
    return apiCall(`/api/roles/${id}`, 'PUT', merged);
  },
  updatePermissions: (id: number, data: { permisos: string[]; motivo?: string }) =>
    apiCall(`/api/roles/${id}/permisos`, 'PUT', data),
  delete: (id: number, data?: { motivo?: string }) => apiCall(`/api/roles/${id}`, 'DELETE', data),
};

// ==================== USUARIOS ====================
export const usuarios = {
  getAll: (params?: {
    q?: string;
    estados?: string[];
    rol_id?: number;
    tipos_documento?: string[];
    fecha_desde?: string;
    fecha_hasta?: string;
    include_deleted?: boolean;
    limit?: number;
  }) => {
    if (!params) return apiCall('/api/usuarios');

    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (Array.isArray(params.estados) && params.estados.length > 0) query.set('estados', params.estados.join(','));
    if (params.rol_id) query.set('rol_id', String(params.rol_id));
    if (Array.isArray(params.tipos_documento) && params.tipos_documento.length > 0) {
      query.set('tipos_documento', params.tipos_documento.join(','));
    }
    if (params.fecha_desde) query.set('fecha_desde', params.fecha_desde);
    if (params.fecha_hasta) query.set('fecha_hasta', params.fecha_hasta);
    if (typeof params.include_deleted === 'boolean') query.set('include_deleted', String(params.include_deleted));
    if (params.limit) query.set('limit', String(params.limit));

    const queryString = query.toString();
    return apiCall(`/api/usuarios${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id: number) => apiCall(`/api/usuarios/${id}`),
  getFullDetail: (id: number, limit = 120) => apiCall(`/api/usuarios/${id}/detalle-completo?limit=${limit}`),
  getActivity: (id: number, limit = 80) => apiCall(`/api/usuarios/${id}/historial?limit=${limit}`),
  getDeleteImpact: (id: number) => apiCall(`/api/usuarios/${id}/impacto-eliminacion`),
  getByEmail: (email: string) => apiCall(`/api/usuarios/email/${encodeURIComponent(email)}`),
  getByDocumento: (documento: string) => apiCall(`/api/usuarios/documento/${documento}`),
  getByTelefono: (telefono: string) => apiCall(`/api/usuarios/telefono/${encodeURIComponent(telefono)}`),
  create: (data: {
    nombre: string;
    apellido: string;
    tipo_documento: string;
    documento: string;
    direccion?: string;
    email: string;
    telefono?: string;
    password_hash?: string;
    rol_id?: number;
    estado?: string;
  }) => apiCall('/api/usuarios', 'POST', data),
  update: (id: number, data: any) => apiCall(`/api/usuarios/${id}`, 'PUT', data),
  updateStatus: (
    id: number,
    data: {
      estado: 'Activo' | 'Inactivo';
      force?: boolean;
      motivo?: string;
      notificar: boolean;
      verificacion?: boolean;
    }
  ) => apiCall(`/api/usuarios/${id}/estado`, 'PUT', data),
  assignRole: (id: number, rol_id: number) => apiCall(`/api/usuarios/${id}/rol`, 'PUT', { rol_id }),
  forceResetPassword: (id: number, data?: { motivo?: string }) =>
    apiCall(`/api/usuarios/${id}/reset-password-forzado`, 'POST', data),
  delete: (
    id: number,
    data?: { motivo?: string }
  ) => apiCall(`/api/usuarios/${id}`, 'DELETE', data),
};

// ==================== AUTH ====================
export const auth = {
  login: (email: string, password: string, rememberMe = false) =>
    apiCall('/api/auth/login', 'POST', { email, password, rememberMe }),
  me: () => apiCall('/api/auth/me'),
  logout: () => apiCall('/api/auth/logout', 'POST', {}),
  logoutAll: () => apiCall('/api/auth/logout-all', 'POST', {}),
  changePassword: (data: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    apiCall('/api/auth/change-password', 'POST', data),
  requestPasswordReset: (email: string) => apiCall('/api/auth/password-reset-request', 'POST', { email }),
  confirmPasswordReset: (data: { email: string; token: string; newPassword: string }) =>
    apiCall('/api/auth/password-reset-confirm', 'POST', data),
  registerCliente: (data: {
    tipoDocumento: 'CC' | 'CE' | 'TI' | 'Pasaporte';
    documento?: string;
    numeroDocumento?: string;
    nombre: string;
    apellido: string;
    telefono: string;
    direccion: string;
    email: string;
    estado?: 'Activo' | 'Inactivo';
    password: string;
  }) => apiCall('/api/auth/register-cliente', 'POST', normalizeAuthRegisterPayload(data)),
};
