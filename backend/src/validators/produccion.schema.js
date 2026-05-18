const { z } = require('zod');

const consumoInsumoItem = z
  .object({
    clave: z.string().trim().optional(),
    insumo_nombre: z.string().trim().optional(),
    cantidad: z.coerce.number().positive(),
    unidad: z.string().trim().optional(),
    producto_catalogo_id: z.coerce.number().int().positive().optional(),
  })
  .passthrough();

const createProduccionBody = z
  .object({
    pedido_id: z.coerce.number().int().positive().optional(),
    pedidoId: z.coerce.number().int().positive().optional(),
    productor_id: z.coerce.number().int().positive().optional(),
    productorId: z.coerce.number().int().positive().optional(),
    fecha: z.string().trim().min(1, 'fecha es obligatoria'),
    tiempo_preparacion_minutos: z.coerce.number().positive('tiempo_preparacion_minutos debe ser mayor a 0'),
    responsable: z.string().trim().optional(),
    estado: z.string().trim().optional(),
    notes: z.string().nullable().optional(),
    consumo_insumos: z.array(consumoInsumoItem).min(1, 'consumo_insumos es obligatorio'),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (!(data.pedido_id ?? data.pedidoId)) {
      ctx.addIssue({ code: 'custom', message: 'pedido_id es obligatorio', path: ['pedido_id'] });
    }
    if (!(data.productor_id ?? data.productorId)) {
      ctx.addIssue({ code: 'custom', message: 'productor_id es obligatorio', path: ['productor_id'] });
    }
  });

const updateProduccionEstadoBody = z.object({
  estado: z.string().trim().min(1, 'estado es obligatorio'),
  motivo_cancelacion: z.string().trim().optional(),
  motivoCancelacion: z.string().trim().optional(),
});

const updateProduccionBody = z
  .object({
    producto_id: z.coerce.number().int().positive().optional(),
    pedido_id: z.coerce.number().int().positive().nullable().optional(),
    cantidad: z.coerce.number().int().positive().optional(),
    fecha: z.string().trim().optional(),
    responsable: z.string().trim().optional(),
    tiempo_preparacion_minutos: z.coerce.number().positive().optional(),
    estado: z.string().trim().optional(),
    notes: z.string().nullable().optional(),
    insumos_gastados: z.array(z.unknown()).optional(),
  })
  .passthrough();

const sugerirConsumoBody = z
  .object({
    pedido_id: z.coerce.number().int().positive().optional(),
    pedidoId: z.coerce.number().int().positive().optional(),
    productor_id: z.coerce.number().int().positive().optional(),
    productorId: z.coerce.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (!(data.pedido_id ?? data.pedidoId)) {
      ctx.addIssue({ code: 'custom', message: 'pedido_id es obligatorio', path: ['pedido_id'] });
    }
    if (!(data.productor_id ?? data.productorId)) {
      ctx.addIssue({ code: 'custom', message: 'productor_id es obligatorio', path: ['productor_id'] });
    }
  });

module.exports = {
  createProduccionBody,
  updateProduccionEstadoBody,
  updateProduccionBody,
  sugerirConsumoBody,
};
