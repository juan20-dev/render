const { z } = require('zod');

const loginBody = z.object({
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
  rememberMe: z.boolean().optional(),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
  newPassword: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
    .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
    .regex(/\d/, 'Debe incluir al menos un número'),
  confirmPassword: z.string().optional(),
});

const registerClienteBody = z
  .object({
    nombre: z.string().trim().min(1, 'Nombre obligatorio'),
    apellido: z.string().trim().min(1, 'Apellido obligatorio'),
    email: z.string().trim().email('Correo inválido'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    tipoDocumento: z.string().trim().optional(),
    documento: z.string().trim().optional(),
    telefono: z.string().trim().optional(),
    direccion: z.string().trim().optional(),
  })
  .passthrough();

const passwordResetRequestBody = z.object({
  email: z.string().trim().email('Correo inválido'),
});

module.exports = {
  loginBody,
  changePasswordBody,
  registerClienteBody,
  passwordResetRequestBody,
};
