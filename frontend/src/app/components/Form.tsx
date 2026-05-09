import React, { useState } from 'react';
import { AlertCircle, Info, CheckCircle2 } from 'lucide-react';

/* ------------------------------------------------------------------
 * Primitivas estandarizadas para validación inline.
 * Mismo lenguaje visual que el resto de la UI (AlertDialog del Login):
 *   - Icono Lucide a la izquierda
 *   - Tipografía text-xs
 *   - Píldora con fondo sutil del color semántico
 *   - Animación de entrada suave
 * ------------------------------------------------------------------ */

interface FieldFeedbackProps {
  children: React.ReactNode;
  className?: string;
}

export function FieldError({ children, className = '' }: FieldFeedbackProps) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive transition-all ${className}`}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="leading-snug">{children}</span>
    </div>
  );
}

export function FieldHelper({ children, className = '' }: FieldFeedbackProps) {
  if (!children) return null;
  return (
    <div
      className={`flex items-start gap-1.5 px-1 text-xs text-muted-foreground ${className}`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-70" aria-hidden="true" />
      <span className="leading-snug">{children}</span>
    </div>
  );
}

export function FieldSuccess({ children, className = '' }: FieldFeedbackProps) {
  if (!children) return null;
  return (
    <div
      className={`flex items-start gap-1.5 rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-700 transition-all ${className}`}
    >
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="leading-snug">{children}</span>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'file';
  value?: string | number;
  onChange?: (value: string | number) => void;
  placeholder?: string;
  required?: boolean;
  options?: { value: string | number; label: string }[];
  /** En type=select: si es true (defecto), se agrega la opción vacía "Seleccionar...". Desactívelo cuando las opciones ya incluyen su propio placeholder (p. ej. valor 0). */
  selectPlaceholder?: boolean;
  rows?: number;
  accept?: string;
  min?: number | string;
  max?: number | string;
  pattern?: string;
  /** Para type=date/datetime-local. Si se omite, por defecto NO se permiten fechas pasadas (mínimo = hoy). Pase `allowPastDates` para deshabilitar esta restricción (p. ej. filtros). */
  allowPastDates?: boolean;
  /** Mensaje de error controlado por el padre (validación inline estándar). Si se proporciona, prevalece sobre las validaciones internas. */
  error?: string;
  /** Texto auxiliar bajo el campo (p. ej. contador de caracteres). Mismo estilo que el helper de Login. */
  helperText?: React.ReactNode;
  /** Deshabilita el control. */
  disabled?: boolean;
  /** Solo dígitos: teléfono 10, documento/NIT 12 (validación en vivo) o NIT/Documento 6–12 (sin error en vivo). */
  inputDigitRule?: 'telefono10' | 'documento12' | 'documento6to12';
}

// Devuelve la fecha actual en formato YYYY-MM-DD (zona horaria local).
const getTodayDateString = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

// Devuelve la fecha+hora actual en formato YYYY-MM-DDTHH:mm (zona horaria local) para datetime-local.
const getNowDateTimeString = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

export function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  options = [],
  selectPlaceholder = true,
  rows = 4,
  accept,
  min,
  max,
  pattern,
  allowPastDates = false,
  error: externalError,
  helperText,
  disabled = false,
  inputDigitRule,
}: FormFieldProps) {
  const [internalError, setInternalError] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const error = externalError !== undefined && externalError !== '' ? externalError : internalError;
  const setError = setInternalError;
  const digitStr = inputDigitRule ? String(value ?? '').replace(/\D/g, '') : '';
  // documento6to12 NO muestra el error mientras se escribe; sólo tras blur o submit (touched).
  const showDigitPartial = Boolean(
    inputDigitRule && inputDigitRule !== 'documento6to12' && digitStr.length > 0
  );
  const showError =
    externalError !== undefined && externalError !== ''
      ? true
      : Boolean(internalError) && (touched || showDigitPartial);

  // Para inputs de fecha en formularios de creación, por defecto bloqueamos fechas pasadas.
  const effectiveMin =
    min !== undefined
      ? min
      : !allowPastDates && type === 'date'
        ? getTodayDateString()
        : !allowPastDates && type === 'datetime-local'
          ? getNowDateTimeString()
          : undefined;

  const baseInputClasses = `w-full px-4 py-2 bg-input-background border rounded-lg focus:outline-none focus:ring-2 transition-all ${
    showError
      ? 'border-destructive ring-1 ring-destructive/20 focus:ring-destructive'
      : 'border-border focus:ring-ring'
  } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;

  const validateField = (val: string | number) => {
    const strVal = val === undefined || val === null ? '' : String(val);
    const digits = strVal.replace(/\D/g, '');

    if (inputDigitRule === 'telefono10') {
      if (required && digits.length === 0) {
        setError(touched ? 'Este campo es obligatorio' : '');
        return;
      }
      if (!required && digits.length === 0) {
        setError('');
        return;
      }
      if (digits.length !== 10) {
        setError('El teléfono debe tener exactamente 10 dígitos');
        return;
      }
      setError('');
      return;
    }

    if (inputDigitRule === 'documento12') {
      if (required && digits.length === 0) {
        setError(touched ? 'Este campo es obligatorio' : '');
        return;
      }
      if (!required && digits.length === 0) {
        setError('');
        return;
      }
      if (digits.length !== 12) {
        setError('El documento debe tener exactamente 12 dígitos');
        return;
      }
      setError('');
      return;
    }

    if (inputDigitRule === 'documento6to12') {
      if (required && digits.length === 0) {
        setError(touched ? 'Este campo es obligatorio' : '');
        return;
      }
      if (!required && digits.length === 0) {
        setError('');
        return;
      }
      if (digits.length < 6 || digits.length > 12) {
        setError('El NIT/Documento debe tener entre 6 y 12 dígitos');
        return;
      }
      setError('');
      return;
    }

    if (!touched) return;

    // Validaciones básicas
    if (required && (!val || val === '')) {
      setError('Este campo es obligatorio');
      return;
    }

    // Validaciones por tipo
    if (type === 'email' && val) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val.toString())) {
        setError('Ingresa un correo electrónico válido');
        return;
      }
    }

    if (type === 'number' && val) {
      const numVal = Number(val);
      if (min !== undefined && numVal < Number(min)) {
        setError(`El valor debe ser al menos ${min}`);
        return;
      }
      if (max !== undefined && numVal > Number(max)) {
        setError(`El valor no puede ser mayor a ${max}`);
        return;
      }
    }

    // Validación de fechas pasadas en formularios de creación.
    if ((type === 'date' || type === 'datetime-local') && val && !allowPastDates) {
      const minDate = effectiveMin ? String(effectiveMin) : '';
      if (minDate && String(val) < minDate) {
        setError('No se permite seleccionar una fecha anterior a hoy.');
        return;
      }
    }

    if (pattern && val) {
      const regex = new RegExp(pattern);
      if (!regex.test(val.toString())) {
        setError('El formato ingresado no es válido');
        return;
      }
    }

    // Si pasa todas las validaciones
    setError('');
  };

  const handleChange = (newValue: string | number) => {
    let next: string | number = newValue;
    if (inputDigitRule) {
      const d = String(newValue).replace(/\D/g, '');
      next = inputDigitRule === 'telefono10' ? d.slice(0, 10) : d.slice(0, 12);
      // documento6to12: NO marcamos `touched` al escribir para que el mensaje no aparezca todavía.
      if (inputDigitRule !== 'documento6to12') {
        setTouched(true);
      }
    }
    onChange?.(next);
    validateField(next);
  };

  const handleBlur = () => {
    setTouched(true);
    validateField(value ?? '');
  };

  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      
      {type === 'textarea' ? (
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          rows={rows}
          disabled={disabled}
          className={baseInputClasses}
        />
      ) : type === 'select' ? (
        <select
          id={name}
          name={name}
          value={value === undefined || value === null ? '' : value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          required={required}
          disabled={disabled}
          className={baseInputClasses}
        >
          {selectPlaceholder ? <option value="">Seleccionar...</option> : null}
          {options.map((option) => (
            <option key={String(option.value)} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === 'file' ? (
        <input
          id={name}
          name={name}
          type="file"
          onChange={(e) => {
            // Para file input no usamos el onChange normal
            const event = e as any;
            if (event.target && onChange) {
              onChange(event);
            }
          }}
          accept={accept}
          required={required}
          disabled={disabled}
          className={baseInputClasses}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={(e) => handleChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          min={effectiveMin as any}
          max={max as any}
          pattern={pattern}
          disabled={disabled}
          inputMode={inputDigitRule ? 'numeric' : undefined}
          maxLength={
            inputDigitRule === 'telefono10'
              ? 10
              : inputDigitRule === 'documento12' || inputDigitRule === 'documento6to12'
                ? 12
                : undefined
          }
          className={baseInputClasses}
        />
      )}

      {showError ? (
        <FieldError>{error}</FieldError>
      ) : helperText ? (
        <FieldHelper>{helperText}</FieldHelper>
      ) : inputDigitRule === 'telefono10' ? (
        <FieldHelper>Exactamente 10 dígitos (solo números).</FieldHelper>
      ) : inputDigitRule === 'documento12' ? (
        <FieldHelper>Exactamente 12 dígitos (solo números).</FieldHelper>
      ) : inputDigitRule === 'documento6to12' ? (
        <FieldHelper>Entre 6 y 12 dígitos (solo números).</FieldHelper>
      ) : null}
    </div>
  );
}

interface FormProps {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  className?: string;
  /** Desactiva la validación HTML5 del navegador (útil cuando hay campos auxiliares que no deben bloquear el envío). */
  noValidate?: boolean;
}

export function Form({ children, onSubmit, className = '', noValidate = false }: FormProps) {
  return (
    <form onSubmit={onSubmit} className={`space-y-4 ${className}`} noValidate={noValidate}>
      {children}
    </form>
  );
}

interface FormActionsProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export function FormActions({ children, align = 'right' }: FormActionsProps) {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end'
  };

  return (
    <div className={`flex gap-3 pt-4 ${alignClasses[align]}`}>
      {children}
    </div>
  );
}