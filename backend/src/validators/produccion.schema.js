const { z } = require('zod');
const { longTextString } = require('./common.schema');

const consumoInsumoItem = z
  .object({
    clave: z.string().trim().optional(),
    insumo_nombre: z.string().trim().optional(),
    cantidad: z.coerce
      .number()
      .positive('La cantidad debe ser mayor a 0')
      .max(99999, 'La cantidad no puede superar 99999 por registro de consumo'),
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
    fecha: z.string().trim().min(1).optional(),
    fechaInicio: z.string().trim().min(1).optional(),
    tiempo_preparacion_minutos: z.coerce.number().min(0).max(120).optional(),
    tiempoPreparacion: z.coerce.number().min(0).max(120).optional(),
    responsable: z.string().trim().optional(),
    estado: z.string().trim().optional(),
    notes: longTextString.nullable().optional(),
    consumo_insumos: z.array(consumoInsumoItem).min(1, 'consumo_insumos es obligatorio').optional(),
    consumoInsumos: z.array(consumoInsumoItem).min(1, 'consumo_insumos es obligatorio').optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const pedidoId = data.pedido_id ?? data.pedidoId;
    const productorId = data.productor_id ?? data.productorId;
    const fecha = data.fecha ?? data.fechaInicio;
    const tiempoPrep = data.tiempo_preparacion_minutos ?? data.tiempoPreparacion;
    const consumoInsumos = data.consumo_insumos ?? data.consumoInsumos;

    if (!pedidoId) {
      ctx.addIssue({ code: 'custom', message: 'pedido_id es obligatorio', path: ['pedidoId'] });
    }
    if (!productorId) {
      ctx.addIssue({ code: 'custom', message: 'productor_id es obligatorio', path: ['productorId'] });
    }
    if (!fecha || String(fecha).trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'fecha es obligatoria', path: ['fechaInicio'] });
    }
    const tiempoNum = Number(tiempoPrep);
    if (!Number.isFinite(tiempoNum) || tiempoNum < 0 || tiempoNum > 120) {
      ctx.addIssue({
        code: 'custom',
        message: 'tiempo_preparacion_minutos debe estar entre 0 y 120',
        path: ['tiempoPreparacion'],
      });
    }
    if (!Array.isArray(consumoInsumos) || consumoInsumos.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'consumo_insumos es obligatorio', path: ['consumoInsumos'] });
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
    cantidad: z.coerce
      .number()
      .positive('La cantidad debe ser mayor a 0')
      .max(99999, 'La cantidad no puede superar 99999')
      .optional(),
    fecha: z.string().trim().optional(),
    responsable: z.string().trim().optional(),
    tiempo_preparacion_minutos: z.coerce.number().positive().optional(),
    estado: z.string().trim().optional(),
    notes: longTextString.nullable().optional(),
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
