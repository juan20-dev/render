export interface HistorialCambio {
  fecha: string;
  usuario: string;
  accion: string;
  motivo?: string;
  detalles?: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  tipoDocumento: string;
  numeroDocumento: string;
  email: string;
  telefono: string;
  direccion: string;
  /** Nombre del rol tal como está en la tabla `roles` (catálogo dinámico). */
  rol: string;
  estado: 'activo' | 'inactivo';
  password: string;
  foto?: string;
  createdAt: string;
  updatedAt: string;
  historialCambios: HistorialCambio[];
  ultimoInicioSesion?: string;
  sesionesActivas?: number;
}

export interface Categoria {
  id: number;
  nombre: string;
  descripcion: string;
  estado: 'activo' | 'inactivo';
  /** Cantidad de productos en la categoría (desde el API). */
  productos?: number;
  createdAt: string;
  updatedAt: string;
  historialCambios: HistorialCambio[];
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string;
  categoriaId: number;
  typo: 'terminado' | 'de preparacion' | 'insumo';
  precioCompra: number;
  precioVenta: number;
  ganancia: number;
  stock: number;
  stockMinimo: number;
  estado: 'activo' | 'inactivo';
  createdAt: string;
  updatedAt: string;
  historialCambios: HistorialCambio[];
  /** Solo tipo insumo: unidad de la presentación (Gramos, Kilogramos, etc.). */
  insumoUnidadMedida?: string | null;
  /** Solo tipo insumo: cantidad/volumen de la presentación. */
  insumoCantidadMedida?: number | null;
  imagenUrl?: string | null;
}

export interface Proveedor {
  id: number;
  tipo: 'Natural' | 'Juridica';
  nombreRazonSocial: string;
  /** Persona natural: nombres propios desde BD */
  nombre?: string;
  apellido?: string;
  nit: string;
  telefono: string;
  email: string;
  direccion: string;
  preferente: boolean;
  estado: 'activo' | 'inactivo';
  createdAt: string;
  updatedAt: string;
  historialCambios: HistorialCambio[];
}

export interface CompraProducto {
  productoId: number;
  cantidad: number;
  precioCompra: number;
  ganancia: number;
  subtotal: number;
}

export interface Compra {
  id: number;
  proveedorId: number;
  fecha: string;
  productos: CompraProducto[];
  subtotal: number;
  iva: number;
  total: number;
  estado: 'pendiente' | 'recibida' | 'cancelada';
  motivoCancelacion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProduccionDetallePreparacionLine {
  productoId: number;
  cantidad: number;
  productoNombre?: string;
}

export interface OrdenProduccion {
  id: number;
  idOrden: number;
  productoId: number;
  pedidoId?: number;
  pedidoNumero?: string;
  cantidad: number;
  productorId: number;
  fechaInicio: string;
  tiempoPreparacion: number;
  estado: 'pendiente' | 'en proceso' | 'completada' | 'cancelada';
  motivoCancelacion?: string;
  createdAt: string;
  updatedAt: string;
  detallePreparacion?: ProduccionDetallePreparacionLine[];
  insumosGastados?: Array<{
    insumo_nombre?: string;
    cantidad?: number;
    cantidad_descontada?: number;
    unidad?: string;
  }>;
}

export interface EntregaInsumo {
  id: number;
  insumo: string;
  cantidad: number;
  unidad?: string;
  /** Producto catálogo tipo insumo (entregas_insumos.producto_catalogo_id). */
  productoCatalogoId?: number;
  /** ID del usuario con rol productor (columna operario_id en BD). */
  operarioId: number;
  fecha: string;
  hora: string;
  createdAt: string;
  anulada?: boolean;
  motivoAnulacion?: string | null;
}

/** Unidades válidas en POST/PUT de insumos (backend). */
export const INSUMO_UNIDADES_API = ['Unidades', 'Mililitros'] as const;

export type InsumoUnidadApi = (typeof INSUMO_UNIDADES_API)[number];

export interface Insumo {
  id: number;
  nombre: string;
  cantidad: number;
  unidad?: string;
  descripcion?: string;
  stockMinimo?: number;
  estado?: 'activo' | 'inactivo';
  /** Resumen gestión: texto del último operario (entrega). */
  operario?: string;
  fechaUltimaModificacion?: string;
  /** No viene del resumen; uso legado en algunas vistas. */
  operarioId?: number;
  fecha?: string;
  productoRelacionadoId?: number;
  /** `catalogo` = tabla insumos; `producto_insumo` = producto tipo insumo. */
  origenInventario?: string;
  categoriaNombre?: string;
  presentacionCantidad?: number | null;
  presentacionUnidad?: string | null;
}

/** Línea de receta desde GET /api/producto-insumos/producto/:id */
export interface ProductoInsumoRecetaLine {
  id: number;
  producto_id: number;
  insumo_id: number;
  cantidad_requerida: number;
  unidad: string;
  notas?: string | null;
  insumo_nombre?: string;
  stock_actual?: number;
  stock_minimo?: number;
}

export interface Cliente {
  id: number;
  nombre: string;
  apellido: string;
  tipoDocumento: string;
  numeroDocumento: string;
  email: string;
  telefono: string;
  direccion: string;
  foto?: string;
  estado: 'activo' | 'inactivo';
  comprasRealizadas: number;
  ultimaCompra?: string;
  createdAt: string;
  updatedAt: string;
  historialCambios: HistorialCambio[];
}

export interface PedidoProducto {
  productoId: number;
  cantidad: number;
  precio: number;
  subtotal: number;
  /** Nombre del producto al momento del pedido. Útil cuando el producto fue desactivado o eliminado. */
  nombre?: string;
}

export interface Pedido {
  id: number;
  clienteId: number;
  productos: PedidoProducto[];
  total: number;
  metodoPago: 'efectivo' | 'transferencia';
  porcentajeAbono: number;
  montoAbonado: number;
  fechaPedido: string;
  fechaEntrega: string;
  direccion?: string;
  telefono?: string;
  estado: 'pendiente' | 'en proceso' | 'completado' | 'cancelado';
  createdAt: string;
  updatedAt: string;
}

export interface Venta {
  id: number;
  tipo: 'directa' | 'por pedido';
  clienteId: number;
  pedidoId?: number;
  productos: PedidoProducto[];
  total: number;
  metodoPago: 'efectivo' | 'transferencia';
  fecha: string;
  estado: 'pendiente' | 'completada' | 'cancelada';
  createdAt: string;
  updatedAt: string;
}

export interface Abono {
  id: number;
  pedidoId: number;
  montoAbonado: number;
  porcentajeAbonado: number;
  valorTotal: number;
  fecha: string;
  metodoPago: 'efectivo' | 'transferencia';
  /**
   * `finalizado` es un estado de cierre automatico que asigna el backend cuando
   * el domicilio del pedido se entrega (consolida abono inicial y saldo).
   */
  estado: 'registrado' | 'verificado' | 'cancelado' | 'aplicado' | 'finalizado';
  /** Texto consolidado con la informacion de las partes del abono cuando se liquida al 100%. */
  detalle?: string;
  /** Captura de transferencia subida al confirmar pedido desde la tienda. */
  comprobanteUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Domicilio {
  id: number;
  pedidoId: number;
  clienteId: number;
  repartidorId: number;
  productos: PedidoProducto[];
  total: number;
  /** Total del pedido (siempre monto completo); el listado puede mostrar monto distinto al repartidor según esquema. */
  totalPedidoBase?: number;
  /** Ej. 50% o 100% — viene del pedido asociado. */
  esquemaAbonoPedido?: string;
  fechaPedido: string;
  fechaEntrega: string;
  estado: 'pendiente' | 'en ruta' | 'completado' | 'cancelado';
  motivoCancelacion?: string;
  /** Dirección de entrega tomada del pedido (o del cliente si el pedido no tenía). */
  direccion?: string;
  /** Teléfono de contacto tomado del pedido (o del cliente si el pedido no tenía). */
  telefono?: string;
  createdAt: string;
  updatedAt: string;
}
