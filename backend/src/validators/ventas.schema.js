const { z } = require('zod');
const { moneyNumber, stockInt } = require('./common.schema');

const ventaEstados = z.enum(['Pendiente', 'Completada', 'Cancelada']);

const createVentaBody = z
  .object({
    numero_venta: z.string().trim().optional(),
    tipo: z.string().trim().optional(),
    cliente_id: z.coerce.number().int().positive().nullish(),
    pedido_id: z.coerce.number().int().positive().nullable().optional(),
    fecha: z.string().trim().optional(),
    metodopago: z.string().trim().optional(),
    total: moneyNumber.optional(),
    estado: ventaEstados.optional(),
    productos: z.array(z.record(z.unknown())).optional(),
    items: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

const updateVentaBody = createVentaBody.partial().passthrough();

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
