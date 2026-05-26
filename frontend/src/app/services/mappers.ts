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

export const uiAct = (s?: string | null) => (String(s || '').trim().toLowerCase() === 'activo' ? 'activo' : 'inactivo');
export const dbAct = (s: 'activo' | 'inactivo') => (s === 'activo' ? 'Activo' : 'Inactivo');
export const formatEntityCode = (prefix: string, value: number | string | null | undefined) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return `${prefix}000`;
  }
  return `${prefix}${String(Math.trunc(numericValue)).padStart(3, '0')}`;
};

export const pedidoEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 'pendiente';
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('complet')) return 'completado';
  if (t.includes('proceso')) return 'en proceso';
  if (t.includes('pendiente')) return 'pendiente';
  return 'pendiente';
};
export const pedidoEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'Pendiente';
  if (t === 'en proceso') return 'En Proceso';
  if (t === 'completado') return 'Completado';
  if (t === 'cancelado') return 'Cancelado';
  return String(s || '').trim();
};

export const domicilioEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 'pendiente';
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('entreg')) return 'completado';
  if (t.includes('camino') || t.replace(/\s/g, '') === 'enruta') return 'en ruta';
  if (t.includes('pendiente')) return 'pendiente';
  return 'pendiente';
};
export const domicilioEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'Pendiente';
  if (t === 'en ruta') return 'En Camino';
  if (t === 'completado') return 'Entregado';
  if (t === 'cancelado') return 'Cancelado';
  return String(s || '').trim();
};

export const prodEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'activo') return 'activo';
  return 'inactivo';
};

export const compraEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'pendiente';
  if (t === 'recibida') return 'recibida';
  if (t === 'cancelada') return 'cancelada';
  return t;
};

export const ventaEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 'pendiente';
  if (t.includes('cancel')) return 'cancelada';
  if (t.includes('complet')) return 'completada';
  if (t.includes('pendiente')) return 'pendiente';
  return 'pendiente';
};

export const ventaEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'pendiente') return 'Pendiente';
  if (t === 'cancelada') return 'Cancelada';
  return 'Completada';
};

export const abonoEstadoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('finaliz')) return 'finalizado';
  if (t.includes('aplic')) return 'aplicado';
  if (t.includes('verific')) return 'verificado';
  return 'registrado';
};

export const abonoEstadoDb = (s: string) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'cancelado') return 'Cancelado';
  if (t === 'finalizado' || t.includes('finaliz')) return 'Finalizado';
  if (t === 'verificado') return 'Verificado';
  if (t === 'aplicado' || t.includes('aplic')) return 'Aplicado';
  return 'Registrado';
};

export const metodoPagoUi = (s?: string | null) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'transferencia') return 'transferencia';
  return 'efectivo';
};
export const metodoPagoDb = (s: string) => {
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

export function mapUsuario(r: any): Usuario {
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

export function mapCategoria(r: any): Categoria {
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

export function mapProducto(r: any): Producto {
  const tipoRaw = String(r.tipo_producto || r.tipoProducto || '').toLowerCase();
  const typo: Producto['typo'] =
    tipoRaw === 'insumo'
      ? 'insumo'
      : tipoRaw === 'preparacion' || tipoRaw.includes('prepar')
        ? 'de preparacion'
        : 'terminado';
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
    insumoUnidadMedida: r.insumo_unidad_medida != null && r.insumo_unidad_medida !== '' ? String(r.insumo_unidad_medida) : null,
    insumoCantidadMedida:
      r.insumo_cantidad_medida != null && r.insumo_cantidad_medida !== ''
        ? Number(r.insumo_cantidad_medida)
        : null,
  } as Producto;
}

export function mapProveedor(r: any): Proveedor {
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

export function mapCompra(r: any): Compra {
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

export function mapCliente(r: any): Cliente {
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

export function mapPedidoListRow(r: any): Pedido {
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

export function mapPedidoDetail(r: any): Pedido {
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
    domicilio: r.domicilio
      ? {
          estado: r.domicilio.estado ? String(r.domicilio.estado) : undefined,
          fecha: r.domicilio.fecha ? String(r.domicilio.fecha) : undefined,
        }
      : undefined,
  } as Pedido & { domicilio?: { estado?: string; fecha?: string } };
}

export function mapVenta(r: any): Venta {
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

export function mapAbono(r: any): Abono {
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

export function mapDomicilio(r: any): Domicilio {
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

  const totalBase = Number(r.total_pedido ?? r.total ?? 0);
  const esquemaAbonoPedido = String(r.esquema_abono_pedido ?? r.esquema_abono ?? '').trim();

  const clienteNombreRaw = r.cliente != null ? String(r.cliente).trim() : '';
  const pedidoLabelRaw = r.pedido != null ? String(r.pedido).trim() : '';

  return {
    id: Number(r.id),
    pedidoId: Number(r.pedido_id),
    clienteId: Number(r.cliente_id),
    repartidorId: Number(r.repartidor_id || 0),
    ...(clienteNombreRaw ? { clienteNombre: clienteNombreRaw } : {}),
    ...(pedidoLabelRaw ? { pedidoNumero: pedidoLabelRaw } : {}),
    productos,
    total: Math.round(totalBase),
    totalPedidoBase: Math.round(totalBase),
    esquemaAbonoPedido,
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

export function mapProduccion(r: any): OrdenProduccion {
  const st = String(r.estado || '').trim();
  let estado: OrdenProduccion['estado'] = 'pendiente';
  if (/orden en preparacion|en preparacion/i.test(st)) estado = 'en proceso';
  else if (/orden lista|completada/i.test(st)) estado = 'completada';
  else if (/cancelada/i.test(st)) estado = 'cancelada';
  else estado = 'pendiente';

  let detallePreparacion: OrdenProduccion['detallePreparacion'];
  const rawDet = r.detalle_preparacion;
  let arr: any[] | null = null;
  if (Array.isArray(rawDet)) arr = rawDet;
  else if (typeof rawDet === 'string' && rawDet.trim()) {
    try {
      arr = JSON.parse(rawDet);
    } catch {
      arr = null;
    }
  }
  if (Array.isArray(arr)) {
    detallePreparacion = arr.map((x) => ({
      productoId: Number(x.producto_id ?? x.productoId),
      cantidad: Number(x.cantidad),
      productoNombre: x.producto_nombre != null ? String(x.producto_nombre) : x.productoNombre,
    }));
  }

  return {
    id: Number(r.id),
    idOrden: Number(r.id),
    productoId: Number(r.producto_id),
    pedidoId: r.pedido_id != null ? Number(r.pedido_id) : undefined,
    pedidoNumero: r.pedido_numero ? String(r.pedido_numero) : undefined,
    cantidad: Number(r.cantidad),
    productorId: Number(r.productor_id ?? 0),
    fechaInicio: String(r.fecha || '').split('T')[0],
    tiempoPreparacion: Number(r.tiempo_preparacion_minutos ?? 0),
    estado,
    motivoCancelacion: r.motivo_cancelacion,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    ...(detallePreparacion ? { detallePreparacion } : {}),
    ...(r.producto_nombre ? { productoNombre: r.producto_nombre } : {}),
    ...(r.productor_nombre ? { productorNombre: r.productor_nombre } : r.responsable ? { productorNombre: r.responsable } : {}),
  } as OrdenProduccion;
}

