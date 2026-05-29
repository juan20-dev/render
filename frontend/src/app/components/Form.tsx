import React, { useState } from 'react';
import { AlertCircle, Info, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { formatProperCase, shouldFormatTextFieldKey } from '../services/mappers';

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
  /** Longitud mínima de caracteres (text/textarea). Si se define, valida en vivo y muestra contador. */
  minLength?: number;
  /** Longitud máxima de caracteres (text/textarea). Aplica `maxLength` nativo y se muestra en el contador. */
  maxLength?: number;
  pattern?: string;
  /** Para type=date/datetime-local. Si se omite, por defecto NO se permiten fechas pasadas (mínimo = hoy). Pase `allowPastDates` para deshabilitar esta restricción (p. ej. filtros). */
  allowPastDates?: boolean;
  /** Mensaje de error controlado por el padre (validación inline estándar). Si se proporciona, prevalece sobre las validaciones internas. */
  error?: string;
  /** Texto auxiliar bajo el campo (p. ej. contador de caracteres). Mismo estilo que el helper de Login. */
  helperText?: React.ReactNode;
  /** Deshabilita el control. */
  disabled?: boolean;
  /** Solo dígitos: teléfono 10, documento/NIT 12, NIT/Documento 6–12 o 6–15. */
  inputDigitRule?: 'telefono10' | 'documento12' | 'documento6to12' | 'documento6to15';
  /** Oculta los textos auxiliares automáticos generados por reglas internas. */
  hideAutoHelper?: boolean;
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

const seemsLikeGibberish = (raw: string): boolean => {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) return false;
  const letters = normalized.match(/[a-záéíóúñ]/g) || [];
  if (letters.length < 6) return false;
  const vowels = normalized.match(/[aeiouáéíóú]/g) || [];
  return vowels.length / letters.length < 0.2;
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
  minLength,
  maxLength,
  pattern,
  allowPastDates = false,
  error: externalError,
  helperText,
  disabled = false,
  inputDigitRule,
  hideAutoHelper = false,
}: FormFieldProps) {
  const [internalError, setInternalError] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [showPasswordPlain, setShowPasswordPlain] = useState(false);
  const error = externalError !== undefined && externalError !== '' ? externalError : internalError;
  const setError = setInternalError;
  const digitStr = inputDigitRule ? String(value ?? '').replace(/\D/g, '') : '';
  const normalizedName = String(name || '').toLowerCase();
  const isEmailLikeField =
    type === 'email' || normalizedName.includes('email') || normalizedName.includes('correo');
  const autoCapAtSixty =
    maxLength === undefined &&
    !inputDigitRule &&
    isEmailLikeField;
  const autoCapAtThirty =
    maxLength === undefined &&
    !inputDigitRule &&
    (type === 'text' || type === 'textarea') &&
    (
      normalizedName.includes('nombre') ||
      normalizedName.includes('apellido') ||
      normalizedName.includes('direccion') ||
      normalizedName.includes('razonsocial')
    );
  const autoCapAtDefault =
    maxLength === undefined &&
    !inputDigitRule &&
    (type === 'text' || type === 'textarea' || type === 'email' || type === 'password');
  const effectiveMaxLength =
    autoCapAtSixty ? 60 : autoCapAtThirty ? 30 : autoCapAtDefault ? 60 : maxLength;
  // Los identificadores flexibles no muestran error parcial mientras se escribe; sólo tras blur/submit.
  const showDigitPartial = Boolean(
    inputDigitRule &&
      inputDigitRule !== 'documento6to12' &&
      inputDigitRule !== 'documento6to15' &&
      digitStr.length > 0
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
  const baseSelectClasses = `${baseInputClasses} bg-white text-sm pr-10 appearance-none cursor-pointer`;

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

    if (inputDigitRule === 'documento6to15') {
      if (required && digits.length === 0) {
        setError(touched ? 'Este campo es obligatorio' : '');
        return;
      }
      if (!required && digits.length === 0) {
        setError('');
        return;
      }
      if (digits.length < 6 || digits.length > 15) {
        setError('El NIT/Documento debe tener entre 6 y 15 dígitos');
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
    if (type === 'email') {
      if (required && !String(val ?? '').trim()) {
        setError('Este campo es obligatorio');
        return;
      }
      if (val) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val.toString())) {
          setError('Ingresa un correo electrónico válido');
          return;
        }
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

      const numberName = normalizedName;
      const decimalLen = String(val).includes('.') ? String(val).split('.')[1]?.length ?? 0 : 0;
      const looksPrice = numberName.includes('precio') || numberName.includes('monto') || numberName.includes('total');
      const looksCount = numberName.includes('cantidad') || numberName.includes('stock');

      if (looksPrice) {
        if (decimalLen > 2) {
          setError('Solo se permiten 2 decimales en valores monetarios');
          return;
        }
        if (numVal > 100_000_000) {
          setError('El valor monetario no puede superar $100.000.000 COP');
          return;
        }
      }

      if (looksCount) {
        if (!Number.isInteger(numVal)) {
          setError('La cantidad debe ser un número entero');
          return;
        }
        if (numVal > 9999) {
          setError('La cantidad no puede ser mayor a 9999');
          return;
        }
      }
    }

    if ((type === 'text' || type === 'textarea' || type === 'email' || type === 'password') && (minLength || effectiveMaxLength)) {
      const len = String(val ?? '').trim().length;
      if (minLength && len > 0 && len < minLength) {
        setError(`Debe tener al menos ${minLength} caracteres (lleva ${len}).`);
        return;
      }
      if (effectiveMaxLength && len > effectiveMaxLength) {
        setError(`Excede el máximo de ${effectiveMaxLength} caracteres (lleva ${len}).`);
        return;
      }
    }

    if (type === 'text' || type === 'textarea') {
      const raw = String(val ?? '');
      const isNameLike =
        normalizedName.includes('nombre') ||
        normalizedName.includes('apellido') ||
        normalizedName.includes('razon') ||
        normalizedName.includes('direccion');
      if (isNameLike && raw.trim() && seemsLikeGibberish(raw)) {
        setError('El texto no parece válido. Revisa el contenido ingresado.');
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
      next =
        inputDigitRule === 'telefono10'
          ? d.slice(0, 10)
          : inputDigitRule === 'documento6to15'
            ? d.slice(0, 15)
            : d.slice(0, 12);
      if (
        inputDigitRule === 'documento6to12' || inputDigitRule === 'documento6to15'
          ? d.length > 0
          : true
      ) {
        setTouched(true);
      }
    } else if (type === 'email' || type === 'password') {
      setTouched(true);
    }
    onChange?.(next);
    validateField(next);
  };

  const handleBlur = () => {
    setTouched(true);
    let nextValue: string | number = value ?? '';
    if (
      (type === 'text' || type === 'textarea') &&
      !inputDigitRule &&
      shouldFormatTextFieldKey(name)
    ) {
      const formatted = formatProperCase(String(nextValue));
      if (formatted !== String(nextValue)) {
        nextValue = formatted;
        onChange?.(formatted);
      }
    }
    validateField(nextValue);
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
          maxLength={effectiveMaxLength}
          minLength={minLength}
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
          className={baseSelectClasses}
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
      ) : type === 'password' ? (
        <div className="relative">
          <input
            id={name}
            name={name}
            type={showPasswordPlain ? 'text' : 'password'}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            maxLength={effectiveMaxLength}
            minLength={minLength}
            pattern={pattern}
            autoComplete={name === 'password' || String(name || '').includes('Password') ? 'current-password' : undefined}
            className={`${baseInputClasses} pr-11`}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPasswordPlain((v) => !v)}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            aria-label={showPasswordPlain ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPasswordPlain ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
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
              : inputDigitRule === 'documento6to15'
                ? 15
                : inputDigitRule === 'documento12' || inputDigitRule === 'documento6to12'
                ? 12
                : effectiveMaxLength
          }
          minLength={minLength}
          className={baseInputClasses}
        />
      )}

      {showError ? (
        <FieldError>{error}</FieldError>
      ) : helperText ? (
        <FieldHelper>{helperText}</FieldHelper>
      ) : !hideAutoHelper && inputDigitRule === 'telefono10' ? (
        <FieldHelper>Exactamente 10 dígitos (solo números).</FieldHelper>
      ) : !hideAutoHelper && inputDigitRule === 'documento12' ? (
        <FieldHelper>Exactamente 12 dígitos (solo números).</FieldHelper>
      ) : !hideAutoHelper && inputDigitRule === 'documento6to12' ? (
        <FieldHelper>Entre 6 y 12 dígitos (solo números).</FieldHelper>
      ) : !hideAutoHelper && inputDigitRule === 'documento6to15' ? (
        <FieldHelper>Entre 6 y 15 dígitos (solo números).</FieldHelper>
      ) : (minLength || effectiveMaxLength) && (type === 'text' || type === 'textarea' || type === 'password' || type === 'email') ? (
        <FieldHelper>
          {(() => {
            const len = String(value ?? '').length;
            if (minLength && effectiveMaxLength) return `Entre ${minLength} y ${effectiveMaxLength} caracteres (${len}/${effectiveMaxLength}).`;
            if (effectiveMaxLength) return `Máximo ${effectiveMaxLength} caracteres (${len}/${effectiveMaxLength}).`;
            if (minLength) return `Mínimo ${minLength} caracteres (lleva ${len}).`;
            return null;
          })()}
        </FieldHelper>
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