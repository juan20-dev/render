const { z } = require('zod');
const { moneyNumber, longTextString } = require('./common.schema');

const abonoEstados = z.enum(['Registrado', 'Verificado', 'Aplicado', 'Finalizado', 'Cancelado']);

const createAbonoBody = z
  .object({
    numero_abono: z.string().trim().optional(),
    pedido_id: z.coerce.number().int().positive().optional(),
    cliente_id: z.coerce.number().int().positive().optional(),
    monto: moneyNumber.refine((n) => n > 0, 'El monto debe ser mayor a 0').optional(),
    fecha: z.string().trim().optional(),
    metodo_pago: z.string().trim().optional(),
    estado: abonoEstados.optional(),
    porcentaje_abonado: z.coerce.number().min(0).max(100).optional(),
    detalle: longTextString.optional(),
    comprobante_url: z
      .string()
      .trim()
      .max(500)
      .regex(/^\/uploads\/comprobantes\/[a-zA-Z0-9._-]+$/, 'URL de comprobante inválida')
      .optional(),
  })
  .passthrough();

const updateAbonoBody = createAbonoBody.partial().passthrough();

const updateAbonoEstadoBody = z.object({
  estado: abonoEstados,
  motivo: z.string().trim().optional(),
});

module.exports = {
  createAbonoBody,
  updateAbonoBody,
  updateAbonoEstadoBody,
};
