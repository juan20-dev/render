const { z } = require('zod');

const ventaEstados = z.enum(['Pendiente', 'Completada', 'Cancelada']);

const createVentaBody = z
  .object({
    numero_venta: z.string().trim().optional(),
    tipo: z.string().trim().optional(),
    cliente_id: z.coerce.number().int().positive().optional(),
    pedido_id: z.coerce.number().int().positive().nullable().optional(),
    fecha: z.string().trim().optional(),
    metodopago: z.string().trim().optional(),
    total: z.coerce.number().nonnegative().optional(),
    estado: ventaEstados.optional(),
    productos: z.array(z.record(z.unknown())).optional(),
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
  cantidad: z.coerce.number().positive(),
  precioUnitario: z.coerce.number().nonnegative().optional(),
});

module.exports = {
  createVentaBody,
  updateVentaBody,
  updateVentaEstadoBody,
  addProductoVentaBody,
};
