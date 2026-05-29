const { z } = require('zod');
const { moneyNumber, stockInt, MONEY_MAX_COP } = require('./common.schema');

const ventaEstados = z.enum(['Pendiente', 'Completada', 'Cancelada']);

const ventaLineaBody = z
  .object({
    productoId: z.coerce.number().int().positive().optional(),
    producto_id: z.coerce.number().int().positive().optional(),
    cantidad: stockInt.refine((n) => n > 0, 'La cantidad debe ser mayor a 0').optional(),
    precioUnitario: moneyNumber.optional(),
    precio: moneyNumber.optional(),
  })
  .passthrough();

const refineVentaMontos = (data, ctx) => {
  const lineas = Array.isArray(data.items) ? data.items : Array.isArray(data.productos) ? data.productos : [];
  let suma = 0;
  for (let i = 0; i < lineas.length; i += 1) {
    const row = lineas[i] || {};
    const precio = Number(row.precioUnitario ?? row.precio ?? 0);
    const cantidad = Number(row.cantidad ?? 0);
    if (Number.isFinite(precio) && precio > MONEY_MAX_COP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El precio unitario no puede superar $100.000.000 COP',
        path: ['items', i, 'precioUnitario'],
      });
    }
    if (Number.isFinite(precio) && Number.isFinite(cantidad) && cantidad > 0) {
      suma += precio * cantidad;
    }
  }
  const totalDeclarado = data.total != null ? Number(data.total) : NaN;
  const totalEfectivo = Number.isFinite(totalDeclarado) && totalDeclarado > 0 ? totalDeclarado : suma;
  if (totalEfectivo > MONEY_MAX_COP) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El total de la venta no puede superar $100.000.000 COP',
      path: ['total'],
    });
  }
};

const ventaBodyBase = z
  .object({
    numero_venta: z.string().trim().optional(),
    tipo: z.string().trim().optional(),
    cliente_id: z.coerce.number().int().positive().nullish(),
    pedido_id: z.coerce.number().int().positive().nullable().optional(),
    fecha: z.string().trim().optional(),
    metodopago: z.string().trim().optional(),
    total: moneyNumber.optional(),
    estado: ventaEstados.optional(),
    productos: z.array(ventaLineaBody).optional(),
    items: z.array(ventaLineaBody).optional(),
  })
  .passthrough();

const createVentaBody = ventaBodyBase.superRefine(refineVentaMontos);

const updateVentaBody = ventaBodyBase.partial().passthrough();

const updateVentaEstadoBody = z.object({
  estado: ventaEstados,
  motivo: z.string().trim().optional(),
});

const addProductoVentaBody = z.object({
  ventaId: z.coerce.number().int().positive().optional(),
  venta_id: z.coerce.number().int().positive().optional(),
  productoId: z.coerce.number().int().positive().optional(),
  producto_id: z.coerce.number().int().positive().optional(),
  cantidad: stockInt.refine((n) => n > 0, 'La cantidad debe ser mayor a 0'),
  precioUnitario: moneyNumber.optional(),
});

module.exports = {
  createVentaBody,
  updateVentaBody,
  updateVentaEstadoBody,
  addProductoVentaBody,
};
