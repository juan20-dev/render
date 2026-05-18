const { z } = require('zod');

const pedidoEstados = z.enum(['Pendiente', 'En Proceso', 'Completado', 'Cancelado']);

const createPedidoBody = z
  .object({
    numero_pedido: z.string().trim().optional(),
    cliente_id: z.coerce.number().int().positive().optional(),
    fecha: z.string().trim().optional(),
    fecha_entrega: z.string().trim().optional(),
    detalles: z.string().optional(),
    direccion: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    total: z.coerce.number().nonnegative().optional(),
    estado: pedidoEstados.optional(),
    metodo_pago: z.string().trim().optional(),
    esquema_abono: z.enum(['50%', '100%']).optional(),
    productos: z
      .array(
        z.object({
          productoId: z.coerce.number().int().positive().optional(),
          producto_id: z.coerce.number().int().positive().optional(),
          cantidad: z.coerce.number().positive(),
          precio: z.coerce.number().nonnegative().optional(),
          precioUnitario: z.coerce.number().nonnegative().optional(),
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
  cantidad: z.coerce.number().positive(),
  precioUnitario: z.coerce.number().nonnegative().optional(),
});

module.exports = {
  createPedidoBody,
  updatePedidoBody,
  updatePedidoEstadoBody,
  addProductoPedidoBody,
};
