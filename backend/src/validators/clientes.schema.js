const { z } = require('zod');
const { motivoEstadoBody } = require('./common.schema');

const createClienteBody = z
  .object({
    nombre: z.string().trim().min(1),
    apellido: z.string().trim().min(1),
    tipoDocumento: z.string().trim().min(1),
    documento: z.string().trim().min(1),
    telefono: z.string().trim().min(1),
    email: z.string().trim().email(),
    direccion: z.string().trim().min(1),
    password: z.string().trim().optional(),
    estado: z.enum(['Activo', 'Inactivo']).optional(),
    foto_url: z.string().nullable().optional(),
  })
  .passthrough();

const updateClienteBody = createClienteBody.partial().passthrough();

const updateClienteEstadoBody = motivoEstadoBody;

module.exports = {
  createClienteBody,
  updateClienteBody,
  updateClienteEstadoBody,
};
