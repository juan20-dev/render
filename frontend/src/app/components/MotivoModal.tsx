import React from 'react';
import { Modal } from './Modal';
import { FormField } from './Form';
import { Button } from './Button';
import { FormActions } from './Form';

export interface MotivoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Texto o fragmento informativo encima del campo motivo */
  description?: React.ReactNode;
  motivo: string;
  onMotivoChange: (value: string) => void;
  onConfirm: () => void;
  minLength?: number;
  maxLength?: number;
  /** Si false, no exige motivo (solo confirmación) */
  requireMotivo?: boolean;
  children?: React.ReactNode;
}

/**
 * Modal reutilizable para motivo de cambio de estado (10–50 caracteres por defecto).
 */
export function MotivoModal({
  isOpen,
  onClose,
  title,
  description,
  motivo,
  onMotivoChange,
  onConfirm,
  minLength = 10,
  maxLength = 50,
  requireMotivo = true,
  children,
}: MotivoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        {description && <div className="p-4 bg-accent rounded-lg text-sm">{description}</div>}
        {children}
        {requireMotivo && (
          <FormField
            label="Motivo"
            name="motivo"
            type="textarea"
            value={motivo}
            onChange={(v) => onMotivoChange(String(v))}
            placeholder={`Motivo (${minLength}-${maxLength} caracteres)`}
            rows={3}
            required
            minLength={minLength}
            maxLength={maxLength}
          />
        )}
        <FormActions>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button onClick={onConfirm}>Confirmar</Button>
        </FormActions>
      </div>
    </Modal>
  );
}
