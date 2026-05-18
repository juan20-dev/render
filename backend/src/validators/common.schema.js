const { z } = require('zod');

const estadoActivoInactivo = z.enum(['Activo', 'Inactivo']);

const motivoEstadoBody = z.object({
  estado: estadoActivoInactivo,
  motivo: z.string().trim().min(10).max(50),
});

const motivoCancelacionBody = z.object({
  motivo: z.string().trim().min(10).max(50),
  motivo_cancelacion: z.string().trim().min(10).max(50).optional(),
});

module.exports = {
  estadoActivoInactivo,
  motivoEstadoBody,
  motivoCancelacionBody,
};
