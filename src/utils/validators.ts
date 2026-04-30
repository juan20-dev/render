/**
 * Real-time validators for form fields
 */

export const validators = {
  /**
   * Email format and uniqueness
   */
  email: {
    format: (email: string): { valid: boolean; message?: string } => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email) return { valid: false, message: 'El email es requerido' };
      if (!emailRegex.test(email)) {
        return { valid: false, message: 'El formato del email no es válido' };
      }
      return { valid: true };
    },
  },

  /**
   * Phone number validation
   */
  phone: {
    format: (phone: string): { valid: boolean; message?: string } => {
      const cleaned = phone.replace(/\D/g, '');
      if (!cleaned) return { valid: false, message: 'El teléfono es requerido' };
      if (cleaned.length < 7 || cleaned.length > 15) {
        return {
          valid: false,
          message: 'El teléfono debe tener entre 7 y 15 dígitos numéricos',
        };
      }
      return { valid: true };
    },
  },

  /**
   * Password strength validation
   */
  password: {
    strength: (password: string): { valid: boolean; strength: string; message: string } => {
      if (!password) {
        return {
          valid: false,
          strength: 'none',
          message: 'La contraseña es requerida',
        };
      }

      const criteria = {
        hasMinLength: password.length >= 8,
        hasUpperCase: /[A-Z]/.test(password),
        hasLowerCase: /[a-z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      };

      const metCriteria = Object.values(criteria).filter(Boolean).length;

      if (metCriteria < 3) {
        return {
          valid: false,
          strength: 'weak',
          message:
            'Débil: Debe contener mayúsculas, minúsculas, números y caracteres especiales (mín. 8 caracteres)',
        };
      }

      if (metCriteria < 5) {
        return {
          valid: true,
          strength: 'medium',
          message: 'Media: Cumple con la mayoría de criterios',
        };
      }

      return {
        valid: true,
        strength: 'strong',
        message: 'Fuerte: Cumple con todos los criterios de seguridad',
      };
    },
  },

  /**
   * Document number validation (basic format)
   */
  document: {
    format: (
      document: string,
      tipoDocumento?: string
    ): { valid: boolean; message?: string } => {
      const cleaned = document.replace(/\D/g, '');

      if (!cleaned) return { valid: false, message: 'El número de documento es requerido' };

      if (tipoDocumento === 'Cédula' && (cleaned.length < 5 || cleaned.length > 12)) {
        return { valid: false, message: 'La cédula debe tener entre 5 y 12 dígitos' };
      }

      if (tipoDocumento === 'Pasaporte' && (cleaned.length < 6 || cleaned.length > 12)) {
        return { valid: false, message: 'El pasaporte debe tener entre 6 y 12 caracteres' };
      }

      return { valid: true };
    },
  },

  /**
   * Generic required field
   */
  required: (value: string | number, fieldName: string): { valid: boolean; message?: string } => {
    if (!value || String(value).trim() === '') {
      return { valid: false, message: `${fieldName} es requerido` };
    }
    return { valid: true };
  },

  /**
   * Number range validation
   */
  numberRange: (
    value: number,
    min: number,
    max: number,
    fieldName: string
  ): { valid: boolean; message?: string } => {
    if (isNaN(value)) {
      return { valid: false, message: `${fieldName} debe ser un número válido` };
    }
    if (value < min || value > max) {
      return {
        valid: false,
        message: `${fieldName} debe estar entre ${min} y ${max}`,
      };
    }
    return { valid: true };
  },
};

/**
 * Validation feedback styles
 */
export const getValidationClass = (
  isValid: boolean | null,
  isDirty: boolean
): string => {
  if (!isDirty) return '';
  if (isValid === null) return 'border-yellow-400';
  return isValid ? 'border-green-500' : 'border-red-500';
};

export const getValidationIcon = (
  isValid: boolean | null,
  isDirty: boolean
): string | null => {
  if (!isDirty) return null;
  if (isValid === null) return '⚠️';
  return isValid ? '✓' : '✗';
};
