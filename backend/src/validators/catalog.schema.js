const { z } = require('zod');
const { motivoEstadoBody } = require('./common.schema');

const proveedorEstadoInput = z.enum(['Activo', 'Inactivo', 'activo', 'inactivo']);
const emptyStringToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalTrimmedString = () =>
  z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());
const optionalEmailString = () =>
  z.preprocess(emptyStringToUndefined, z.string().trim().email().optional());

const createCategoriaBody = z
  .object({
    nombre: z.string().trim().min(1),
    descripcion: z.string().optional(),
    estado: z.enum(['Activo', 'Inactivo']).optional(),
  })
  .passthrough();

const updateCategoriaBody = createCategoriaBody.partial().passthrough();

const createProductoBody = z
  .object({
    nombre: z.string().trim().min(1),
    categoria_id: z.coerce.number().int().positive().optional(),
    precio: z.coerce.number().nonnegative().optional(),
    stock: z.coerce.number().int().nonnegative().optional(),
    estado: z.enum(['Activo', 'Inactivo']).optional(),
  })
  .passthrough();

const updateProductoBody = createProductoBody.partial().passthrough();

const proveedorBodyBase = z
  .object({
    nombre: optionalTrimmedString(),
    apellido: optionalTrimmedString(),
    nombreRazonSocial: optionalTrimmedString(),
    nombreEmpresa: optionalTrimmedString(),
    tipo: z.enum(['Natural', 'Juridica']).optional(),
    tipoPersona: z.enum(['Natural', 'Juridica']).optional(),
    nit: optionalTrimmedString(),
    telefono: optionalTrimmedString(),
    email: optionalEmailString(),
    direccion: optionalTrimmedString(),
    estado: proveedorEstadoInput.optional(),
  })
  .passthrough();

const createProveedorBody = proveedorBodyBase
  .superRefine((data, ctx) => {
    const tipo = String(data.tipoPersona || data.tipo || '').trim();
    const nombre = String(data.nombre || '').trim();
    const razonSocial = String(data.nombreRazonSocial || data.nombreEmpresa || '').trim();

    if (tipo === 'Juridica' && !razonSocial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nombreRazonSocial'],
        message: 'La razón social es obligatoria para proveedores jurídicos',
      });
    }

    if (tipo === 'Natural' && !nombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nombre'],
        message: 'El nombre es obligatorio para proveedores naturales',
      });
    }
  });

const updateProveedorBody = proveedorBodyBase.partial().passthrough();

const createCompraBody = z
  .object({
    proveedor_id: z.coerce.number().int().positive().optional(),
    fecha: z.string().trim().optional(),
    total: z.coerce.number().nonnegative().optional(),
    estado: z.string().trim().optional(),
    productos: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

const updateCompraBody = createCompraBody.partial().passthrough();

const updateCompraEstadoBody = z.object({
  estado: z.string().trim().min(1),
  motivo: z.string().trim().optional(),
  motivo_cancelacion: z.string().trim().optional(),
});

const addProductoCompraBody = z.object({
  compraId: z.coerce.number().int().positive().optional(),
  compra_id: z.coerce.number().int().positive().optional(),
  productoId: z.coerce.number().int().positive().optional(),
  producto_id: z.coerce.number().int().positive().optional(),
  cantidad: z.coerce.number().positive(),
  precioUnitario: z.coerce.number().nonnegative().optional(),
});

const createInsumoBody = z
  .object({
    nombre: z.string().trim().min(1),
    unidad: z.string().trim().optional(),
    stock: z.coerce.number().nonnegative().optional(),
    estado: z.enum(['Activo', 'Inactivo']).optional(),
  })
  .passthrough();

const updateInsumoBody = createInsumoBody.partial().passthrough();

const productoInsumoBodyBase = z
  .object({
    producto_id: z.coerce.number().int().positive().optional(),
    insumo_id: z.coerce.number().int().positive().optional(),
    cantidad_requerida: z.coerce.number().positive().optional(),
    unidad: z.string().trim().min(1).optional(),
    notas: z.string().nullable().optional(),
  })
  .passthrough();

const createProductoInsumoBody = productoInsumoBodyBase.superRefine((data, ctx) => {
  if (!data.producto_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['producto_id'],
      message: 'producto_id es obligatorio',
    });
  }
  if (!data.insumo_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['insumo_id'],
      message: 'insumo_id es obligatorio',
    });
  }
  if (!data.cantidad_requerida) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cantidad_requerida'],
      message: 'cantidad_requerida es obligatoria',
    });
  }
  if (!data.unidad || !String(data.unidad).trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unidad'],
      message: 'unidad es obligatoria',
    });
  }
});

const updateProductoInsumoBody = productoInsumoBodyBase;

const entregaInsumoBaseBody = z
  .object({
    numero_entrega: z.string().trim().min(1).optional(),
    cantidad: z.coerce.number().positive().optional(),
    unidad: z.enum(['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros']).optional(),
    operario_id: z.coerce.number().int().positive().optional(),
    fecha: z.string().trim().min(1).optional(),
    hora: z.string().trim().optional(),
    insumo_id: z.coerce.number().int().positive().optional(),
    producto_catalogo_id: z.coerce.number().int().positive().optional(),
  })
  .passthrough();

const createEntregaInsumoBody = z
  .object({
    numero_entrega: z.string().trim().min(1),
    cantidad: z.coerce.number().positive(),
    unidad: z.enum(['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros']),
    operario_id: z.coerce.number().int().positive(),
    fecha: z.string().trim().min(1),
    hora: z.string().trim().optional(),
    insumo_id: z.coerce.number().int().positive().optional(),
    producto_catalogo_id: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (data) => data.insumo_id || data.producto_catalogo_id,
    { message: 'Debe especificar insumo_id o producto_catalogo_id' }
  )
  .passthrough();

const updateEntregaInsumoBody = entregaInsumoBaseBody;

module.exports = {
  createCategoriaBody,
  updateCategoriaBody,
  updateCategoriaEstadoBody: motivoEstadoBody,
  createProductoBody,
  updateProductoBody,
  updateProductoEstadoBody: motivoEstadoBody,
  createProveedorBody,
  updateProveedorBody,
  updateProveedorEstadoBody: motivoEstadoBody,
  createCompraBody,
  updateCompraBody,
  updateCompraEstadoBody,
  addProductoCompraBody,
  createInsumoBody,
  updateInsumoBody,
  updateInsumoEstadoBody: motivoEstadoBody,
  createProductoInsumoBody,
  updateProductoInsumoBody,
  createEntregaInsumoBody,
  updateEntregaInsumoBody,
};
