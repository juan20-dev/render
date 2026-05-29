const { z } = require('zod');

const estadoActivoInactivo = z.enum(['Activo', 'Inactivo']);

const collapseSpaces = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const decimalScale = (value) => {
  if (value === undefined || value === null) return 0;
  const text = String(value);
  if (!text.includes('.')) return 0;
  return text.split('.')[1]?.length ?? 0;
};

const hasRealTextShape = (value) => {
  const normalized = collapseSpaces(value).toLowerCase();
  if (!normalized) return false;
  const letters = normalized.match(/[a-záéíóúñ]/g) || [];
  if (letters.length < 3) return false;
  const vowels = normalized.match(/[aeiouáéíóú]/g) || [];
  return vowels.length / letters.length >= 0.2;
};

const humanNameString = z
  .string()
  .trim()
  .min(2, 'Debe tener al menos 2 caracteres')
  .max(100, 'No debe superar 100 caracteres')
  .regex(/^[A-Za-zÁÉÍÓÚáéíóúÑñ' -]+$/, 'Solo se permiten letras, espacios, apóstrofes y guiones')
  .refine(hasRealTextShape, 'El texto no parece un nombre válido');

const entityNameString = z
  .string()
  .trim()
  .min(2, 'Debe tener al menos 2 caracteres')
  .max(150, 'No debe superar 150 caracteres')
  .regex(
    /^[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ'.,()/% -]+$/,
    'El texto contiene caracteres no permitidos'
  );

const longTextString = z
  .string()
  .trim()
  .min(5, 'Debe tener al menos 5 caracteres')
  .max(255, 'No debe superar 255 caracteres');

const emailString = z
  .string()
  .trim()
  .toLowerCase()
  .email('Ingresa un correo válido')
  .max(100, 'El correo no debe superar 100 caracteres');

const documentoString = z
  .string()
  .trim()
  .regex(/^\d{6,15}$/, 'El documento debe tener entre 6 y 15 dígitos');

const telefonoString = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'El teléfono debe tener exactamente 10 dígitos');

const MONEY_MAX_COP = 100_000_000;

/** Montos COP en ventas, abonos y precios generales (hasta 100 millones). */
const moneyNumber = z
  .coerce
  .number()
  .nonnegative('No puede ser negativo')
  .max(MONEY_MAX_COP, 'El monto no puede superar $100.000.000 COP')
  .refine((n) => decimalScale(n) <= 2, 'Solo se permiten 2 decimales');

/** Totales de compra (mismo tope de 100 millones COP). */
const moneyNumberCompra = moneyNumber;

const stockInt = z
  .coerce
  .number()
  .int('Debe ser un número entero')
  .min(0, 'No puede ser negativo')
  .max(9999, 'No debe superar 9999');

const motivoEstadoBody = z.object({
  estado: estadoActivoInactivo,
  motivo: z.string().trim().min(10).max(50),
});

const motivoCancelacionBody = z.object({
  motivo: z.string().trim().min(10).max(50),
  motivo_cancelacion: z.string().trim().min(10).max(50).optional(),
});

module.exports = {
  MONEY_MAX_COP,
  estadoActivoInactivo,
  collapseSpaces,
  humanNameString,
  entityNameString,
  longTextString,
  emailString,
  documentoString,
  telefonoString,
  moneyNumber,
  moneyNumberCompra,
  stockInt,
  motivoEstadoBody,
  motivoCancelacionBody,
};
