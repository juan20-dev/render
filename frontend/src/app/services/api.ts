import { apiFetch, apiFetchData } from './http';
import type {
  Usuario,
  Categoria,
  Producto,
  Proveedor,
  Compra,
  OrdenProduccion,
  EntregaInsumo,
  Cliente,
  Pedido,
  Venta,
  Abono,
  Domicilio,
} from './types';

const q = (p?: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams();
  if (!p) return '';
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
};

const uiAct = (s?: string | null) => (String(s || '').trim().toLowerCase() === 'activo' ? 'activo' : 'inactivo');
const dbAct = (s: 'activo' | 'inactivo') => (s === 'activo' ? 'Activo' : 'Inactivo');

const pedidoEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 'pendiente';
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('complet')) return 'completado';
  if (t.includes('proceso')) return 'en proceso';
  if (t.includes('pendiente')) return 'pendiente';
  return 'pendiente';
};
const pedidoEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'Pendiente';
  if (t === 'en proceso') return 'En Proceso';
  if (t === 'completado') return 'Completado';
  if (t === 'cancelado') return 'Cancelado';
  return String(s || '').trim();
};

const domicilioEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 'pendiente';
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('entreg')) return 'completado';
  if (t.includes('camino') || t.replace(/\s/g, '') === 'enruta') return 'en ruta';
  if (t.includes('pendiente')) return 'pendiente';
  return 'pendiente';
};
const domicilioEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'Pendiente';
  if (t === 'en ruta') return 'En Camino';
  if (t === 'completado') return 'Entregado';
  if (t === 'cancelado') return 'Cancelado';
  return String(s || '').trim();
};

const prodEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'activo') return 'activo';
  return 'inactivo';
};

const compraEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'pendiente';
  if (t === 'recibida') return 'recibida';
  if (t === 'cancelada') return 'cancelada';
  return t;
};

const ventaEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 'pendiente';
  if (t.includes('cancel')) return 'cancelada';
  if (t.includes('complet')) return 'completada';
  if (t.includes('pendiente')) return 'pendiente';
  return 'pendiente';
};

const ventaEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'Pendiente';
  if (t === 'cancelada') return 'Cancelada';
  return 'Completada';
};

const abonoEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('finaliz')) return 'finalizado';
  if (t.includes('aplic')) return 'aplicado';
  if (t.includes('verific')) return 'verificado';
  return 'registrado';
};

const abonoEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'cancelado') return 'Cancelado';
  if (t === 'finalizado' || t.includes('finaliz')) return 'Finalizado';
  if (t === 'verificado') return 'Verificado';
  if (t === 'aplicado' || t.includes('aplic')) return 'Aplicado';
  return 'Registrado';
};

const metodoPagoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'transferencia') return 'transferencia';
  return 'efectivo';
};
const metodoPagoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'transferencia') return 'Transferencia';
  return 'Efectivo';
};

/** Alineado con el backend (`isStrongPassword`): mensaje de error o null si cumple. */
export function newPasswordPolicyMessage(password: string): string | null {
  const value = String(password ?? '').trim();
  if (!value) return null;
  if (value.length < 8) return 'Mínimo 8 caracteres.';
  if (!/[A-Z]/.test(value)) return 'Debe incluir al menos una mayúscula.';
  if (!/[a-z]/.test(value)) return 'Debe incluir al menos una minúscula.';
  if (!/\d/.test(value)) return 'Debe incluir al menos un número.';
  return null;
}

let rolesCache: { id: number; nombre: string }[] | null = null;
async function rolIdByNombre(nombre: string): Promise<number> {
  if (!rolesCache) {
    const rows = await apiFetchData<Array<{ id: number; nombre: string }>>('/api/roles');
    rolesCache = rows.map((r) => ({ id: Number(r.id), nombre: String(r.nombre) }));
  }
  const f = rolesCache.find((r) => r.nombre === nombre);
  if (!f) throw new Error(`Rol no encontrado: ${nombre}`);
  return f.id;
}

function mapUsuario(r: any): Usuario {
  return {
    id: Number(r.id),
    nombre: r.nombre || '',
    apellido: r.apellido || '',
    tipoDocumento: r.tipo_documento || 'CC',
    numeroDocumento: r.documento || '',
    email: r.email || '',
    telefono: r.telefono || '',
    direccion: r.direccion || '',
    rol: String(r.rol ?? ''),
    estado: uiAct(r.estado),
    password: '',
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    historialCambios: [],
  };
}

function mapCategoria(r: any): Categoria {
  return {
    id: Number(r.id),
    nombre: r.nombre || '',
    descripcion: r.descripcion || '',
    estado: prodEstadoUi(r.estado) as Categoria['estado'],
    productos: Number(r.productos ?? r.cantidad_productos ?? 0),
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    historialCambios: [],
  };
}

function mapProducto(r: any): Producto {
  const tipoRaw = String(r.tipo_producto || r.tipoProducto || '').toLowerCase();
  const typo =
    tipoRaw === 'preparacion' || tipoRaw.includes('prepar')
      ? ('de preparacion' as Producto['typo'])
      : ('terminado' as Producto['typo']);
  const precioVenta = Number(r.precio ?? r.precio_venta ?? 0);
  const precioCompra = Number(r.precio_compra ?? r.precioCompra ?? precioVenta);
  const ganancia = Number(r.ganancia ?? (precioCompra > 0 ? ((precioVenta - precioCompra) / precioCompra) * 100 : 0));
  return {
    id: Number(r.id),
    nombre: r.nombre || '',
    descripcion: r.descripcion || '',
    categoriaId: Number(r.categoria_id ?? r.categoriaId ?? 0),
    typo,
    precioCompra,
    precioVenta,
    ganancia,
    stock: Number(r.stock ?? 0),
    stockMinimo: Number(r.stock_minimo ?? r.stockMinimo ?? 0),
    estado: prodEstadoUi(r.estado) as Producto['estado'],
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    historialCambios: [],
  } as Producto;
}

function mapProveedor(r: any): Proveedor {
  const tipoPersona = String(r.tipo_persona || r.tipoPersona || '');
  const tipo: Proveedor['tipo'] = tipoPersona.toLowerCase().includes('jur') ? 'Juridica' : 'Natural';
  const nombre = String(r.nombre || '').trim();
  const apellido = String(r.apellido || '').trim();
  return {
    id: Number(r.id),
    tipo,
    nombreRazonSocial:
      tipo === 'Juridica'
        ? String(r.nombre_empresa || '').trim()
        : [nombre, apellido].filter(Boolean).join(' ').trim(),
    nombre: tipo === 'Natural' ? nombre : undefined,
    apellido: tipo === 'Natural' ? apellido : undefined,
    nit: r.nit || r.numero_documento || '',
    telefono: r.telefono || '',
    email: r.email || '',
    direccion: r.direccion || '',
    preferente: Boolean(r.preferente),
    estado: prodEstadoUi(r.estado) as Proveedor['estado'],
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    historialCambios: [],
  } as Proveedor;
}

function mapCompra(r: any): Compra {
  const items = Array.isArray(r.items) ? r.items : [];
  const productos = items.map((it: any) => ({
    productoId: Number(it.producto_id),
    cantidad: Number(it.cantidad),
    precioCompra: Number(it.precio_unitario),
    ganancia: Number(it.porcentaje_ganancia ?? 0),
    subtotal: Number(it.subtotal ?? Number(it.cantidad) * Number(it.precio_unitario)),
  }));
  return {
    id: Number(r.id),
    proveedorId: Number(r.proveedor_id),
    fecha: String(r.fecha || '').split('T')[0],
    productos,
    subtotal: Number(r.subtotal ?? r.total ?? 0),
    iva: Number(r.iva ?? 0),
    total: Number(r.total ?? 0),
    estado: compraEstadoUi(r.estado) as Compra['estado'],
    motivoCancelacion: r.motivo_cancelacion,
    createdAt: r.fecha_creacion || r.created_at || '',
    updatedAt: r.updated_at || '',
  } as Compra;
}

function mapCliente(r: any): Cliente {
  const ultima = r.ultima_compra ?? r.ultimaCompra ?? null;
  return {
    id: Number(r.id),
    tipoDocumento: r.tipo_documento || 'CC',
    nombre: r.nombre || '',
    apellido: r.apellido || '',
    numeroDocumento: r.documento || '',
    telefono: r.telefono || '',
    email: r.email || '',
    direccion: r.direccion || '',
    comprasRealizadas: Number(r.compras ?? r.compras_realizadas ?? 0),
    ultimaCompra: ultima ? String(ultima).split('T')[0] : undefined,
    estado: uiAct(r.estado) as Cliente['estado'],
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    historialCambios: [],
  } as Cliente;
}

function mapPedidoListRow(r: any): Pedido {
  const n = Number(r.productos) || 0;
  const placeholder = Array.from({ length: n }, () => ({
    productoId: 0,
    cantidad: 0,
    precio: 0,
    subtotal: 0,
    nombre: undefined,
  }));
  return {
    id: Number(r.id),
    clienteId: Number(r.cliente_id),
    productos: placeholder as unknown as Pedido['productos'],
    total: Number(r.total ?? 0),
    metodoPago: metodoPagoUi(r.metodo_pago) as Pedido['metodoPago'],
    porcentajeAbono: String(r.esquema_abono || '').includes('50') ? 50 : 100,
    montoAbonado: Number(r.monto_abonado ?? 0),
    fechaPedido: String(r.fecha || '').split('T')[0],
    fechaEntrega: String(r.fecha_entrega || '').split('T')[0],
    direccion: r.direccion || undefined,
    telefono: r.telefono || undefined,
    estado: pedidoEstadoUi(r.estado) as Pedido['estado'],
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  };
}

function mapPedidoDetail(r: any): Pedido {
  const dets = Array.isArray(r.detalles) ? r.detalles : [];
  const productos = dets.map((d: any) => ({
    productoId: Number(d.producto_id),
    cantidad: Number(d.cantidad),
    precio: Number(d.precio_unitario),
    subtotal: Number(d.subtotal ?? Number(d.cantidad) * Number(d.precio_unitario)),
    nombre: d.producto_nombre ? String(d.producto_nombre) : undefined,
  }));
  return {
    id: Number(r.id),
    clienteId: Number(r.cliente_id),
    productos,
    total: Number(r.total ?? 0),
    metodoPago: metodoPagoUi(r.metodo_pago) as Pedido['metodoPago'],
    porcentajeAbono: String(r.esquema_abono || '').includes('50') ? 50 : 100,
    montoAbonado: Number(r.monto_abonado ?? 0),
    fechaPedido: String(r.fecha || '').split('T')[0],
    fechaEntrega: String(r.fecha_entrega || '').split('T')[0],
    direccion: r.direccion || undefined,
    telefono: r.telefono || undefined,
    estado: pedidoEstadoUi(r.estado) as Pedido['estado'],
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  };
}

function mapVenta(r: any): Venta {
  const items = Array.isArray(r.items) ? r.items : [];
  const productos = items.map((d: any) => ({
    productoId: Number(d.producto_id),
    cantidad: Number(d.cantidad),
    precio: Number(d.precio_unitario),
    subtotal: Number(d.subtotal ?? 0),
  }));
  const tipoRaw = String(r.tipo || '').toLowerCase();
  return {
    id: Number(r.id),
    tipo: tipoRaw.includes('pedido') ? 'por pedido' : 'directa',
    clienteId: Number(r.cliente_id),
    pedidoId: r.pedido_id ? Number(r.pedido_id) : undefined,
    productos,
    total: Number(r.total ?? 0),
    metodoPago: metodoPagoUi(r.metodopago || r.metodo_pago) as Venta['metodoPago'],
    fecha: String(r.fecha || '').split('T')[0],
    estado: ventaEstadoUi(r.estado) as Venta['estado'],
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  };
}

function mapAbono(r: any): Abono {
  const estadoUi = abonoEstadoUi(r.estado) as Abono['estado'];
  const monto = Number(r.monto ?? r.monto_abonado ?? 0);
  const valorTotal = Number(r.valor_total ?? r.total_pedido ?? 0);
  const pctRaw = Number(r.porcentaje ?? r.porcentaje_abonado ?? NaN);
  let porcentajeAbonado = Number.isFinite(pctRaw) && pctRaw > 0 ? Math.round(pctRaw) : 0;
  if (!porcentajeAbonado && valorTotal > 0 && monto >= 0) {
    porcentajeAbonado = Math.round((monto / valorTotal) * 100);
  }
  return {
    id: Number(r.id),
    pedidoId: Number(r.pedido_id),
    montoAbonado: monto,
    porcentajeAbonado,
    valorTotal,
    fecha: String(r.fecha || '').split('T')[0],
    metodoPago: metodoPagoUi(r.metodo_pago) as Abono['metodoPago'],
    estado: estadoUi,
    detalle: r.detalle ? String(r.detalle) : undefined,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  } as Abono;
}

function mapDomicilio(r: any): Domicilio {
  let prodArr: any[] = [];
  if (Array.isArray(r.productos)) {
    prodArr = r.productos;
  } else if (typeof r.productos === 'string') {
    try {
      const parsed = JSON.parse(r.productos);
      if (Array.isArray(parsed)) prodArr = parsed;
    } catch {
      /* ignore */
    }
  }
  const productos = prodArr
    .filter((d: any) => d && (d.producto_id !== null && d.producto_id !== undefined))
    .map((d: any) => ({
      productoId: Number(d.producto_id),
      cantidad: Number(d.cantidad ?? 0),
      precio: Number(d.precio_unitario ?? 0),
      subtotal: Number(
        d.subtotal ?? Number(d.cantidad ?? 0) * Number(d.precio_unitario ?? 0)
      ),
      nombre: d.producto_nombre ? String(d.producto_nombre) : undefined,
    }));

  const direccion = String(r.direccion_pedido || r.direccion || r.cliente_direccion || '').trim();
  const telefono = String(r.telefono_pedido || r.cliente_telefono || '').trim();
  const fechaEntregaRaw = r.fecha_entrega_pedido || r.fecha_entrega || r.fecha || '';

  return {
    id: Number(r.id),
    pedidoId: Number(r.pedido_id),
    clienteId: Number(r.cliente_id),
    repartidorId: Number(r.repartidor_id || 0),
    productos,
    total: Number(r.total_pedido ?? r.total ?? 0),
    fechaPedido: String(r.fecha_pedido || r.fecha || '').split('T')[0],
    fechaEntrega: String(fechaEntregaRaw || '').split('T')[0],
    motivoCancelacion: r.motivo_cancelacion ? String(r.motivo_cancelacion) : undefined,
    direccion: direccion || undefined,
    telefono: telefono || undefined,
    estado: domicilioEstadoUi(r.estado) as Domicilio['estado'],
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
  } as Domicilio;
}

function mapProduccion(r: any): OrdenProduccion {
  const st = String(r.estado || '').trim();
  let estado: OrdenProduccion['estado'] = 'pendiente';
  if (/orden en preparacion|en preparacion/i.test(st)) estado = 'en proceso';
  else if (/orden lista|completada/i.test(st)) estado = 'completada';
  else if (/cancelada/i.test(st)) estado = 'cancelada';
  else estado = 'pendiente';

  return {
    id: Number(r.id),
    idOrden: Number(r.id),
    productoId: Number(r.producto_id),
    cantidad: Number(r.cantidad),
    productorId: 0,
    fechaInicio: String(r.fecha || '').split('T')[0],
    tiempoPreparacion: Number(r.tiempo_preparacion_minutos ?? 0),
    estado,
    motivoCancelacion: r.motivo_cancelacion,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    ...(r.producto_nombre ? { productoNombre: r.producto_nombre } : {}),
    ...(r.responsable ? { productorNombre: r.responsable } : {}),
  } as OrdenProduccion;
}

export const api = {
  auth: {
    login: async (email: string, password: string, rememberMe = false) => {
      const env = await apiFetch<{
        id: number;
        email: string;
        nombre: string;
        apellido: string;
        rol: string;
        permisos: string[];
        cliente_id?: number | null;
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
        rol: d.rol as Usuario['rol'],
        permisos: Array.isArray(d.permisos) ? d.permisos : [],
        clienteId: d.cliente_id ?? undefined,
      };
    },
    register: async (data: Record<string, unknown>) => {
      await apiFetch('/api/auth/register-cliente', {
        method: 'POST',
        json: data,
      });
      return api.auth.login(String(data.email), String(data.password), false).catch(() => null);
    },
    me: async () => {
      const d = await apiFetchData<{
        id: number;
        email: string;
        nombre: string;
        apellido: string;
        rol: string;
        permisos: string[];
        cliente_id?: number | null;
      }>('/api/auth/me');
      return {
        id: d.id,
        email: d.email,
        nombre: d.nombre,
        apellido: d.apellido,
        rol: d.rol as Usuario['rol'],
        permisos: Array.isArray(d.permisos) ? d.permisos : [],
        clienteId: d.cliente_id ?? undefined,
      };
    },
    logout: async () => {
      await apiFetch('/api/auth/logout', { method: 'POST', json: {} });
      rolesCache = null;
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
          cliente: o.client,
          fecha: o.date,
          total: o.total,
          estado: pedidoEstadoUi(o.status),
        })),
      };
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
      rolesCache = null;
    },
  },

  usuarios: {
    getAll: async (filters?: Record<string, string>) => {
      const rows = await apiFetchData<any[]>(`/api/usuarios${q(filters)}`);
      return rows.map(mapUsuario);
    },
    getById: async (id: number) => mapUsuario(await apiFetchData(`/api/usuarios/${id}`)),
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
      rolesCache = null;
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
        json: { estado: dbAct(estado), motivo, notificar: true },
      });
    },
  },

  categorias: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/categorias');
      return rows.map(mapCategoria);
    },
    getById: async (id: number) => mapCategoria(await apiFetchData(`/api/categorias/${id}`)),
    create: async (data: Partial<Categoria>) => {
      // Validación defensiva: asegurar que nombre y descripción sean válidos
      const nombre = String(data?.nombre || '').trim();
      const descripcion = String(data?.descripcion || '').trim();

      if (!nombre) {
        throw new Error('El nombre de la categoría es obligatorio');
      }

      if (nombre.length < 3) {
        throw new Error('El nombre debe tener al menos 3 caracteres');
      }

      if (descripcion.length < 10) {
        throw new Error('La descripción debe tener al menos 10 caracteres');
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
      // Validación defensiva
      const nombre = String(updates?.nombre || '').trim();
      const descripcion = String(updates?.descripcion || '').trim();

      if (!nombre) {
        throw new Error('El nombre de la categoría es obligatorio');
      }

      if (nombre.length < 3) {
        throw new Error('El nombre debe tener al menos 3 caracteres');
      }

      if (descripcion.length < 10) {
        throw new Error('La descripción debe tener al menos 10 caracteres');
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
      await apiFetch('/api/productos', {
        method: 'POST',
        json: {
          nombre: data.nombre,
          categoria_id: data.categoriaId,
          descripcion: data.descripcion,
          precio,
          stock_minimo: data.stockMinimo,
          tipo_producto: data.typo === 'de preparacion' ? 'preparacion' : 'terminado',
          estado: 'Activo',
        },
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
          tipo_producto:
            updates.typo === 'de preparacion' ? 'preparacion' : updates.typo === 'terminado' ? 'terminado' : undefined,
          estado: updates.estado ? dbAct(updates.estado as 'activo' | 'inactivo') : undefined,
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
      await apiFetch('/api/proveedores', { method: 'POST', json: data });
    },
    update: async (id: number, updates: Partial<Proveedor>, _motivo?: string) => {
      await apiFetch(`/api/proveedores/${id}`, { method: 'PUT', json: updates });
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
      const numero = data.numeroCompra || `CMP-${Date.now()}`;
      const fechaRaw = data.fecha != null ? String(data.fecha) : '';
      const fecha =
        fechaRaw.includes('T') ? fechaRaw.split('T')[0] : fechaRaw.slice(0, 10) || fechaRaw;
      const env = await apiFetch<{ id: number }>('/api/compras', {
        method: 'POST',
        json: {
          numero_compra: numero,
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
        throw new Error('La compra se creó pero no se recibió el identificador. Vuelva a cargar la lista.');
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
      await apiFetch(`/api/compras/${id}/estado`, {
        method: 'PATCH',
        json: { estado: mapDb[estado], motivo_cancelacion: motivo },
      });
    },
  },

  produccion: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/produccion');
      return rows.map(mapProduccion);
    },
    create: async (data: Partial<OrdenProduccion>) => {
      const u = await apiFetchData<any>(`/api/usuarios/${data.productorId}`);
      const responsable = `${u.nombre || ''} ${u.apellido || ''}`.trim();
      const env = await apiFetch<{ id: number }>('/api/produccion', {
        method: 'POST',
        json: {
          producto_id: data.productoId,
          cantidad: data.cantidad,
          fecha: data.fechaInicio,
          responsable,
          tiempo_preparacion_minutos: data.tiempoPreparacion,
          estado: 'pendiente',
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
            operarioId: Number(r.operario_id),
            fecha: String(r.fecha || '').split('T')[0],
            hora: r.hora || '',
            createdAt: r.created_at || '',
          }) as EntregaInsumo
      );
    },
    create: async (data: Partial<EntregaInsumo> & { insumoId?: number; unidad?: string; numeroEntrega?: string }) => {
      await apiFetch('/api/entregas-insumos', {
        method: 'POST',
        json: {
          numero_entrega: data.numeroEntrega || `ENT-${Date.now()}`,
          insumo_id: data.insumoId,
          cantidad: data.cantidad,
          unidad: data.unidad || 'Unidades',
          operario_id: data.operarioId,
          fecha: data.fecha,
          hora: data.hora,
        },
      });
    },
    delete: async (id: number, _motivo?: string) => {
      await apiFetch(`/api/entregas-insumos/${id}`, { method: 'DELETE' });
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

  clientes: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/clientes');
      return rows.map(mapCliente);
    },
    getById: async (id: number) => mapCliente(await apiFetchData(`/api/clientes/${id}`)),
    create: async (data: Partial<Cliente> & { estado?: string }) => {
      await apiFetch('/api/clientes', {
        method: 'POST',
        json: {
          nombre: data.nombre,
          apellido: data.apellido,
          tipoDocumento: data.tipoDocumento,
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
          tipoDocumento: updates.tipoDocumento,
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
        json: { estado: dbAct(estado), motivo },
      });
    },
  },

  pedidos: {
    getAll: async () => {
      const rows = await apiFetchData<any[]>('/api/pedidos');
      return rows.map(mapPedidoListRow);
    },
    getById: async (id: number) => mapPedidoDetail(await apiFetchData(`/api/pedidos/${id}`)),
    create: async (data: Partial<Pedido>) => {
      const numero = `PED-${Date.now()}`;
      const env = await apiFetch<{ id: number }>('/api/pedidos', {
        method: 'POST',
        json: {
          numero_pedido: numero,
          cliente_id: data.clienteId,
          fecha: data.fechaPedido,
          fecha_entrega: data.fechaEntrega,
          detalles: '',
          direccion: data.direccion || null,
          telefono: data.telefono || null,
          total: data.total,
          estado: 'Pendiente',
          metodo_pago: metodoPagoDb(String(data.metodoPago || 'efectivo')),
          esquema_abono: data.porcentajeAbono === 50 ? '50%' : '100%',
        },
      });
      const pid = env.id!;
      for (const p of data.productos || []) {
        await apiFetch('/api/pedidos/producto', {
          method: 'POST',
          json: { pedidoId: pid, productoId: p.productoId, cantidad: p.cantidad, precioUnitario: p.precio },
        });
      }
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
        throw new Error('Revise los productos: cantidad, precio e ID deben ser válidos.');
      }

      const env = await apiFetch<{ id: number }>('/api/ventas', {
        method: 'POST',
        json: {
          tipo: data.tipo === 'por pedido' ? 'Por Pedido' : 'Directa',
          cliente_id: cid,
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
        throw new Error('No se recibió el id de la venta. Intente de nuevo o revise la sesión.');
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
        throw new Error('Seleccione un pedido válido');
      }
      if (!Number.isFinite(repartidorId) || repartidorId <= 0) {
        throw new Error('Seleccione un repartidor válido');
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
        numero_domicilio: `DOM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
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

