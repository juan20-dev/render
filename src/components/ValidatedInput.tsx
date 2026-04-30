import React, { useState } from 'react';
import { validators, getValidationClass, getValidationIcon } from '../../utils/validators';

interface ValidatedInputProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  placeholder?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValidation?: (isValid: boolean, message?: string) => void;
  validationType?: 'email' | 'phone' | 'password' | 'document' | 'required' | 'none';
  tipoDocumento?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Input component with real-time validation
 * Provides immediate feedback to user while typing
 */
export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  onValidation,
  validationType = 'none',
  tipoDocumento,
  required = false,
  disabled = false,
  className = '',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e);

    // Real-time validation
    let validation: { valid: boolean; message?: string; strength?: string } | null = null;

    switch (validationType) {
      case 'email':
        validation = validators.email.format(e.target.value);
        break;
      case 'phone':
        validation = validators.phone.format(e.target.value);
        break;
      case 'password':
        validation = validators.password.strength(e.target.value);
        break;
      case 'document':
        validation = validators.document.format(e.target.value, tipoDocumento);
        break;
      case 'required':
        validation = validators.required(e.target.value, label);
        break;
      default:
        validation = null;
    }

    if (validation) {
      setIsValid(validation.valid);
      setValidationMessage(validation.message || null);
      onValidation?.(validation.valid, validation.message);
    }
  };

  const icon = getValidationIcon(isValid, isFocused || value !== '');
  const borderClass = getValidationClass(isValid, isFocused || value !== '');

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          className={`
            w-full px-3 py-2 border rounded-md
            focus:outline-none focus:ring-2 focus:ring-blue-500
            ${borderClass}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${className}
          `}
        />
        {icon && (
          <span className="absolute right-3 top-2 text-lg">
            {icon === '✓' && <span className="text-green-500">✓</span>}
            {icon === '✗' && <span className="text-red-500">✗</span>}
            {icon === '⚠️' && <span className="text-yellow-500">⚠️</span>}
          </span>
        )}
      </div>
      {validationMessage && (
        <p
          className={`text-sm mt-1 ${
            isValid ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {validationMessage}
        </p>
      )}
    </div>
  );
};
