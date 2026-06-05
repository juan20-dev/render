const { z } = require('zod');
const { moneyNumber, stockInt, telefonoString, longTextString } = require('./common.schema');

const pedidoEstados = z.enum(['Pendiente', 'En Proceso', 'Completado', 'Cancelado']);

const createPedidoBody = z
  .object({
    numero_pedido: z.string().trim().optional(),
    cliente_id: z.coerce.number().int().positive().optional(),
    fecha: z.string().trim().optional(),
    fecha_entrega: z.string().trim().optional(),
    detalles: longTextString.optional(),
    direccion: longTextString.nullable().optional(),
    telefono: telefonoString.nullable().optional(),
    total: moneyNumber.optional(),
    estado: pedidoEstados.optional(),
    metodo_pago: z.string().trim().optional(),
    esquema_abono: z.enum(['50%', '100%']).optional(),
    comprobante_url: z
      .string()
      .trim()
      .max(500)
      .regex(/^\/uploads\/comprobantes\/[a-zA-Z0-9._-]+$/, 'URL de comprobante inválida')
      .optional(),
    productos: z
      .array(
        z.object({
          productoId: z.coerce.number().int().positive().optional(),
          producto_id: z.coerce.number().int().positive().optional(),
          cantidad: stockInt.refine((n) => n > 0, 'La cantidad debe ser mayor a 0'),
          precio: moneyNumber.optional(),
          precioUnitario: moneyNumber.optional(),
        })
      )
      .optional(),
  })
  .passthrough();

const updatePedidoBody = createPedidoBody.partial();

const updatePedidoEstadoBody = z.object({
  estado: pedidoEstados,
  motivo: z.string().trim().optional(),
});

const addProductoPedidoBody = z.object({
  pedidoId: z.coerce.number().int().positive().optional(),
  pedido_id: z.coerce.number().int().positive().optional(),
  productoId: z.coerce.number().int().positive().optional(),
  producto_id: z.coerce.number().int().positive().optional(),
  cantidad: stockInt.refine((n) => n > 0, 'La cantidad debe ser mayor a 0'),
  precioUnitario: moneyNumber.optional(),
});

module.exports = {
  createPedidoBody,
  updatePedidoBody,
  updatePedidoEstadoBody,
  addProductoPedidoBody,
};
