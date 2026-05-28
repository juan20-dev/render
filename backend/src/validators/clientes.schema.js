const { z } = require('zod');
const {
  motivoEstadoBody,
  humanNameString,
  documentoString,
  telefonoString,
  emailString,
  longTextString,
} = require('./common.schema');

const createClienteBody = z
  .object({
    nombre: humanNameString,
    apellido: humanNameString,
    tipoDocumento: z.string().trim().min(1),
    documento: documentoString,
    telefono: telefonoString,
    email: emailString,
    direccion: longTextString,
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
