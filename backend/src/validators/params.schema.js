const { z } = require('zod');

const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

const pedidoIdParam = z.object({
  pedidoId: z.coerce.number().int().positive(),
});

const clienteIdParam = z.object({
  clienteId: z.coerce.number().int().positive(),
});

const productorIdParam = z.object({
  productorId: z.coerce.number().int().positive(),
});

module.exports = {
  idParam,
  pedidoIdParam,
  clienteIdParam,
  productorIdParam,
};
