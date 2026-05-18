const { z } = require('zod');

const abonoEstados = z.enum(['Registrado', 'Verificado', 'Aplicado', 'Finalizado', 'Cancelado']);

const createAbonoBody = z
  .object({
    numero_abono: z.string().trim().optional(),
    pedido_id: z.coerce.number().int().positive().optional(),
    cliente_id: z.coerce.number().int().positive().optional(),
    monto: z.coerce.number().positive().optional(),
    fecha: z.string().trim().optional(),
    metodo_pago: z.string().trim().optional(),
    estado: abonoEstados.optional(),
    porcentaje_abonado: z.coerce.number().min(0).max(100).optional(),
    detalle: z.string().optional(),
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
