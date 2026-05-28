const { z } = require('zod');
const { longTextString } = require('./common.schema');

const domicilioEstados = z.enum(['Pendiente', 'En Camino', 'Entregado', 'Cancelado']);

const createDomicilioBody = z
  .object({
    pedido_id: z.coerce.number().int().positive().optional(),
    pedidoId: z.coerce.number().int().positive().optional(),
    repartidor_id: z.coerce.number().int().positive().optional(),
    repartidorId: z.coerce.number().int().positive().optional(),
    direccion: z.union([longTextString, z.record(z.unknown())]).optional(),
    fecha: z.string().trim().optional(),
    hora: z.string().nullable().optional(),
    estado: domicilioEstados.optional(),
    detalle: longTextString.nullable().optional(),
    numero_domicilio: z.string().trim().max(50).optional(),
    numeroDomicilio: z.string().trim().max(50).optional(),
    repartidor: z.string().trim().max(100).optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const pedidoId = data.pedido_id ?? data.pedidoId;
    const repartidorId = data.repartidor_id ?? data.repartidorId;
    if (!pedidoId) {
      ctx.addIssue({ code: 'custom', message: 'pedido_id es requerido', path: ['pedido_id'] });
    }
    if (!repartidorId) {
      ctx.addIssue({ code: 'custom', message: 'repartidor_id es requerido', path: ['repartidor_id'] });
    }
  });

const updateDomicilioEstadoBody = z
  .object({
    estado: domicilioEstados,
    motivo_cancelacion: z.string().trim().optional(),
    motivoCancelacion: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.estado !== 'Cancelado') return;
    const motivo = String(data.motivo_cancelacion ?? data.motivoCancelacion ?? '').trim();
    if (motivo.length < 10 || motivo.length > 50) {
      ctx.addIssue({
        code: 'custom',
        message: 'El motivo de cancelación es obligatorio y debe tener entre 10 y 50 caracteres',
        path: ['motivo_cancelacion'],
      });
    }
  });

const updateDomicilioBody = z
  .object({
    repartidor_id: z.coerce.number().int().positive().optional(),
    repartidorId: z.coerce.number().int().positive().optional(),
    repartidor: z.string().trim().max(100).optional(),
  })
  .passthrough();

module.exports = {
  createDomicilioBody,
  updateDomicilioEstadoBody,
  updateDomicilioBody,
};
