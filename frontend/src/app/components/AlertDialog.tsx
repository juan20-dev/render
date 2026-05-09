import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle, Info, CheckCircle, Trash2 } from 'lucide-react';

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  description: React.ReactNode;
  type?: 'warning' | 'info' | 'success' | 'danger';
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
}

export function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  type = 'warning',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  showCancel = true
}: AlertDialogProps) {
  const handleConfirm = () => {
    void (async () => {
      try {
        if (typeof onConfirm === 'function') {
          await Promise.resolve(onConfirm());
        }
      } finally {
        onClose();
      }
    })();
  };

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <Trash2 className="w-6 h-6 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'info':
      default:
        return <Info className="w-6 h-6 text-primary" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'danger':
        return 'bg-destructive/10';
      case 'warning':
        return 'bg-yellow-100';
      case 'success':
        return 'bg-green-100';
      case 'info':
      default:
        return 'bg-primary/10';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${getBgColor()}`}>
            {getIcon()}
          </div>
          <div className="flex-1">
            <div className="text-muted-foreground">{description}</div>
          </div>
        </div>

        <div className={`flex gap-3 pt-4 ${showCancel ? 'justify-end' : 'justify-center'} border-t border-border`}>
          {showCancel && (
            <Button variant="outline" onClick={onClose}>
              {cancelText}
            </Button>
          )}
          <Button 
            onClick={handleConfirm}
            variant={type === 'danger' ? 'destructive' : 'default'}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Hook para usar alertas programáticamente
export function useAlertDialog() {
  const [alertState, setAlertState] = React.useState<{
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    type: 'warning' | 'info' | 'success' | 'danger';
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
  }>({
    isOpen: false,
    title: '',
    description: '',
    type: 'warning',
    onConfirm: () => {},
  });

  const showAlert = React.useCallback(
    (config: Omit<typeof alertState, 'isOpen'>) => {
      setAlertState({ ...config, isOpen: true });
    },
    []
  );

  const hideAlert = React.useCallback(() => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const AlertComponent = React.useMemo(
    () => (
      <AlertDialog
        isOpen={alertState.isOpen}
        onClose={hideAlert}
        onConfirm={alertState.onConfirm}
        title={alertState.title}
        description={alertState.description}
        type={alertState.type}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        showCancel={alertState.showCancel}
      />
    ),
    [alertState, hideAlert]
  );

  return { showAlert, hideAlert, AlertComponent };
}

/** Notificaciones flotantes (formularios, API). Misma API que sonner. */
export { toast, Toaster } from 'sonner';
