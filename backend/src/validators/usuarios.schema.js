const { z } = require('zod');
const {
  motivoEstadoBody,
  humanNameString,
  emailString,
  documentoString,
  telefonoString,
  longTextString,
} = require('./common.schema');

const createUsuarioBody = z
  .object({
    nombre: humanNameString,
    apellido: humanNameString,
    email: emailString,
    documento: documentoString,
    telefono: telefonoString.optional(),
    tipo_documento: z.string().trim().optional(),
    tipoDocumento: z.string().trim().optional(),
    direccion: longTextString.optional(),
    rol_id: z.coerce.number().int().positive(),
    estado: z.enum(['Activo', 'Inactivo']).optional(),
    password: z.string().trim().optional(),
  })
  .passthrough();

const updateUsuarioBody = createUsuarioBody.partial().passthrough();

const updateUsuarioEstadoBody = motivoEstadoBody;

const changePasswordBody = z.object({
  password: z.string().trim().min(8),
  newPassword: z.string().trim().min(8).optional(),
  currentPassword: z.string().trim().optional(),
});

module.exports = {
  createUsuarioBody,
  updateUsuarioBody,
  updateUsuarioEstadoBody,
  changePasswordBody,
};
