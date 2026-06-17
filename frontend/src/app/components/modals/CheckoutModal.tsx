import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../Button';
import { FieldError, FormField } from '../Form';
import { CartItem, CheckoutData, CHECKOUT_CUENTA_TRANSFERENCIA, CHECKOUT_QR_URL, fechaMinimaEntregaColombia } from '../hooks/landingShared';
import { formatCurrencyCop } from '../../services/mappers';

interface CheckoutModalProps {
  isOpen: boolean;
  carrito: CartItem[];
  totalCarrito: number;
  porcentajePago: '100' | '50';
  checkoutData: CheckoutData;
  shouldShowDireccionError: boolean;
  shouldShowTelefonoError: boolean;
  checkoutDireccionError: string;
  checkoutTelefonoError: string;
  checkoutTelefonoDigits: string;
  shouldShowFechaEntregaError: boolean;
  checkoutFechaEntregaError: string;
  checkoutStockError: CartItem | null;
  shouldShowComprobanteError: boolean;
  checkoutComprobanteError: string;
  comprobantePreview: string;
  comprobanteUploading: boolean;
  checkoutValid: boolean;
  isSubmittingPedido: boolean;
  onClose: () => void;
  onPorcentajePagoChange: (value: '100' | '50') => void;
  onDireccionChange: (value: string) => void;
  onTelefonoChange: (value: string) => void;
  onFechaEntregaChange: (value: string) => void;
  onObservacionesChange: (value: string) => void;
  onComprobanteFile: (file: File | null) => void | Promise<void>;
  onConfirm: () => Promise<void> | void;
  getCartItemStockError: (item: CartItem) => string;
}

export function CheckoutModal({
  isOpen,
  carrito,
  totalCarrito,
  porcentajePago,
  checkoutData,
  shouldShowDireccionError,
  shouldShowTelefonoError,
  checkoutDireccionError,
  checkoutTelefonoError,
  checkoutTelefonoDigits,
  shouldShowFechaEntregaError,
  checkoutFechaEntregaError,
  checkoutStockError,
  shouldShowComprobanteError,
  checkoutComprobanteError,
  comprobantePreview,
  comprobanteUploading,
  checkoutValid,
  isSubmittingPedido,
  onClose,
  onPorcentajePagoChange,
  onDireccionChange,
  onTelefonoChange,
  onFechaEntregaChange,
  onObservacionesChange,
  onComprobanteFile,
  onConfirm,
  getCartItemStockError,
}: CheckoutModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto main-content-scroll">
          <div className="sticky top-0 bg-primary text-white p-4 sm:p-6 rounded-t-xl sm:rounded-t-2xl flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-base sm:text-lg md:text-xl">Finalizar Pedido</h3>
              <button
                onClick={() => {
                  if (!isSubmittingPedido) {
                    onClose();
                  }
                }}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
                disabled={isSubmittingPedido}
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="mb-6">
              <h4 className="mb-4">Resumen del Pedido</h4>
              <div className="space-y-2 bg-background p-4 rounded-lg">
                {carrito.map((item) => {
                  const unitario = Number(item.producto.precio) || 0;
                  const cantidad = Number(item.cantidad) || 0;
                  const subtotal = unitario * cantidad;
                  return (
                    <div key={item.producto.id} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                      <p className="text-sm font-medium">{item.producto.nombre}</p>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Cantidad: {cantidad}</span>
                        <span>Unitario: {formatCurrencyCop(unitario)}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="text-primary">{formatCurrencyCop(subtotal)}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex justify-between">
                    <span>Total del pedido</span>
                    <span className="text-primary">{formatCurrencyCop(totalCarrito)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="mb-4">Transferencia Bancaria</h4>
              <div className="space-y-4 p-4 border border-border rounded-lg bg-background">
                <div>
                  <p className="text-sm text-muted-foreground">Número de cuenta</p>
                  <p className="font-medium tracking-wide">{CHECKOUT_CUENTA_TRANSFERENCIA}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <img
                    src={CHECKOUT_QR_URL}
                    alt="Código QR para transferencia"
                    className="w-36 h-36 object-contain rounded-lg border border-border bg-white"
                  />
                  <p className="text-xs text-muted-foreground flex-1">
                    Realice la consignación por el monto indicado (total o abono mínimo) y adjunte la captura de
                    pantalla del comprobante para habilitar «Confirmar Pedido».
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="checkout-comprobante" className="block text-sm font-medium">
                    Comprobante de consignación *
                  </label>
                  <input
                    id="checkout-comprobante"
                    name="checkout-comprobante"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isSubmittingPedido || comprobanteUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void onComprobanteFile(file);
                    }}
                    className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground"
                  />
                  <p className="text-xs text-muted-foreground">JPG, PNG o WEBP. Máximo 2 MB.</p>
                  {comprobanteUploading && (
                    <p className="text-xs text-muted-foreground">Cargando comprobante...</p>
                  )}
                  {comprobantePreview && !comprobanteUploading && (
                    <img
                      src={comprobantePreview}
                      alt="Vista previa del comprobante"
                      className="mt-2 h-32 w-auto max-w-full object-contain rounded-lg border border-border"
                    />
                  )}
                  {shouldShowComprobanteError && checkoutComprobanteError && (
                    <FieldError>{checkoutComprobanteError}</FieldError>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="mb-4">Forma de Pago</h4>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="percentage"
                    className="w-4 h-4 text-primary"
                    checked={porcentajePago === '100'}
                    onChange={() => onPorcentajePagoChange('100')}
                  />
                  <div className="flex-1">
                    <p>Pago Total (100%)</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrencyCop(totalCarrito)}
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="percentage"
                    className="w-4 h-4 text-primary"
                    checked={porcentajePago === '50'}
                    onChange={() => onPorcentajePagoChange('50')}
                  />
                  <div className="flex-1">
                    <p>Abono Mínimo (50%)</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrencyCop(totalCarrito * 0.5)} (Saldo:{' '}
                      {formatCurrencyCop(totalCarrito * 0.5)})
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="mb-4">Información de Entrega</h4>
              <div className="space-y-4">
                <FormField
                  label="Dirección de entrega"
                  name="checkout-direccion"
                  value={checkoutData.direccion}
                  onChange={(value) => onDireccionChange(value as string)}
                  placeholder="Calle 104 # 79D - 65"
                  required
                  error={shouldShowDireccionError ? checkoutDireccionError : undefined}
                  helperText={
                    checkoutData.direccion.trim()
                      ? 'Puedes editar esta dirección si deseas recibir el pedido en otra ubicación.'
                      : undefined
                  }
                />

                <FormField
                  label="Teléfono de contacto"
                  name="checkout-telefono"
                  value={checkoutData.telefono}
                  onChange={(value) => onTelefonoChange(value as string)}
                  placeholder="3246102339"
                  required
                  inputDigitRule="telefono10"
                  error={shouldShowTelefonoError ? checkoutTelefonoError : undefined}
                  helperText={
                    checkoutTelefonoDigits
                      ? 'Puedes editar este teléfono si quieres usar otro número de contacto.'
                      : undefined
                  }
                />

                <FormField
                  label="Fecha de entrega * (solo fechas futuras)"
                  name="checkout-fecha-entrega"
                  type="date"
                  value={checkoutData.fechaEntrega}
                  onChange={(value) => onFechaEntregaChange(value as string)}
                  min={fechaMinimaEntregaColombia()}
                  required
                  error={shouldShowFechaEntregaError ? checkoutFechaEntregaError : undefined}
                />

                <FormField
                  label="Observaciones (Opcional)"
                  name="checkout-observaciones"
                  type="textarea"
                  rows={3}
                  value={checkoutData.observaciones}
                  onChange={(value) => onObservacionesChange(value as string)}
                  placeholder="Instrucciones especiales para la entrega..."
                />
              </div>
            </div>

            {checkoutStockError && (
              <FieldError className="mb-4">
                Ajusta el carrito antes de confirmar. {getCartItemStockError(checkoutStockError)}
              </FieldError>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={isSubmittingPedido}
                onClick={() => {
                  if (!isSubmittingPedido) {
                    onClose();
                  }
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                disabled={!checkoutValid || isSubmittingPedido}
                onClick={() => {
                  void onConfirm();
                }}
                className="flex-1 bg-primary text-white"
              >
                {isSubmittingPedido ? 'Enviando...' : 'Confirmar Pedido'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
