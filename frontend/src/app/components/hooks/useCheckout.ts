import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from '../AlertDialog';
import { api } from '../../services/api';
import {
  CartItem,
  CheckoutData,
  CheckoutTouched,
  UserData,
  buildCheckoutDefaults,
  calcularTotalCarrito,
  getCartItemStockError,
  getCheckoutValidation,
  validateImageFile,
} from './landingShared';

interface UseCheckoutOptions {
  user?: UserData;
  carrito: CartItem[];
  clearCart: () => void;
  onRequireLogin: () => void;
  onPedidoCreated?: () => Promise<void> | void;
}

export function useCheckout({
  user,
  carrito,
  clearCart,
  onRequireLogin,
  onPedidoCreated,
}: UseCheckoutOptions) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [isSubmittingPedido, setIsSubmittingPedido] = useState(false);
  const [porcentajePago, setPorcentajePago] = useState<'100' | '50'>('100');
  const [checkoutData, setCheckoutData] = useState<CheckoutData>(() => buildCheckoutDefaults(user));
  const [checkoutTouched, setCheckoutTouched] = useState<CheckoutTouched>({
    direccion: false,
    telefono: false,
    fechaEntrega: false,
  });
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [comprobantePreview, setComprobantePreview] = useState('');
  const [comprobanteUploading, setComprobanteUploading] = useState(false);
  const submittingRef = useRef(false);

  const totalCarrito = useMemo(() => calcularTotalCarrito(carrito), [carrito]);

  const {
    checkoutDireccion,
    checkoutTelefonoDigits,
    checkoutFechaEntrega,
    shouldShowDireccionError,
    shouldShowTelefonoError,
    shouldShowFechaEntregaError,
    checkoutDireccionError,
    checkoutTelefonoError,
    checkoutFechaEntregaError,
    checkoutStockError,
    shouldShowComprobanteError,
    checkoutComprobanteError,
    checkoutValid,
  } = useMemo(
    () =>
      getCheckoutValidation({
        carrito,
        checkoutData,
        checkoutTouched,
        checkoutAttempted,
        comprobanteUrl,
        comprobanteUploading,
      }),
    [carrito, checkoutData, checkoutTouched, checkoutAttempted, comprobanteUrl, comprobanteUploading]
  );

  const resetCheckoutForm = useCallback(() => {
    setPorcentajePago('100');
    setCheckoutData(buildCheckoutDefaults(user));
    setCheckoutTouched({ direccion: false, telefono: false, fechaEntrega: false });
    setCheckoutAttempted(false);
    setComprobanteUrl('');
    setComprobantePreview('');
    setComprobanteUploading(false);
  }, [user]);

  const handleComprobanteFile = useCallback(async (file: File | null) => {
    if (!file) {
      setComprobanteUrl('');
      setComprobantePreview('');
      return;
    }

    // Validar imagen con lógica flexible (MIME type O extensión)
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error('Archivo rechazado', {
        description: validation.error || 'No se puede procesar esta imagen.',
      });
      return;
    }

    setComprobanteUploading(true);
    const preview = URL.createObjectURL(file);
    setComprobantePreview(preview);
    try {
      const url = await api.pedidos.uploadComprobante(file);
      setComprobanteUrl(url);
    } catch (error: unknown) {
      setComprobanteUrl('');
      setComprobantePreview('');
      const msg = error instanceof Error ? error.message : 'No se pudo cargar el comprobante.';
      toast.error('Comprobante no guardado', { description: msg });
      if (import.meta.env.DEV) {
        console.error('Error al subir comprobante de pedido', error);
      }
    } finally {
      setComprobanteUploading(false);
    }
  }, []);

  const realizarPedido = useCallback(() => {
    if (carrito.length === 0) {
      toast.error('Carrito vacío', {
        description: 'Agrega productos al carrito para realizar un pedido.',
      });
      return false;
    }

    if (carrito.some((item) => Boolean(getCartItemStockError(item)))) {
      toast.error('Ajusta las cantidades del carrito', {
        description: 'Hay productos con cantidades mayores al stock disponible.',
      });
      return false;
    }

    if (!user) {
      toast('Inicia sesión para continuar', {
        description: 'Debes iniciar sesión o registrarte para realizar un pedido.',
      });
      onRequireLogin();
      return false;
    }

    resetCheckoutForm();
    setShowCheckout(true);
    return true;
  }, [carrito, onRequireLogin, resetCheckoutForm, user]);

  const confirmarPedido = useCallback(async () => {
    if (submittingRef.current || isSubmittingPedido) return;

    setCheckoutAttempted(true);
    setCheckoutTouched({ direccion: true, telefono: true, fechaEntrega: true });

    if (!checkoutValid) {
      toast.error('Datos incompletos', {
        description:
          checkoutComprobanteError ||
          checkoutFechaEntregaError ||
          checkoutDireccionError ||
          checkoutTelefonoError ||
          (checkoutStockError ? getCartItemStockError(checkoutStockError) : '') ||
          'Completa los datos del pedido',
      });
      return;
    }

    submittingRef.current = true;
    setIsSubmittingPedido(true);
    setShowCheckout(false);
    clearCart();

    try {
      await api.pedidos.create({
        clienteId: undefined,
        fechaPedido: new Date().toISOString().split('T')[0],
        fechaEntrega: checkoutFechaEntrega,
        metodoPago: 'transferencia',
        porcentajeAbono: porcentajePago === '50' ? 50 : 100,
        total: totalCarrito,
        direccion: checkoutDireccion,
        telefono: checkoutTelefonoDigits,
        observaciones: checkoutData.observaciones.trim(),
        comprobanteUrl,
        productos: carrito.map((item) => ({
          productoId: Number(item.producto.id),
          cantidad: item.cantidad,
          precio: item.producto.precio,
          subtotal: item.producto.precio * item.cantidad,
        })),
      } as any);

      resetCheckoutForm();
      toast.success('Pedido confirmado', {
        description: `Gracias por tu compra, ${user?.nombre}. Tu pedido fue registrado exitosamente.`,
      });

      try {
        await onPedidoCreated?.({ light: true });
      } catch {
        // El pedido ya fue creado; si la recarga falla, no bloqueamos la confirmación al cliente.
      }
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : String(error ?? '');
      const esTimeout =
        /<html|504|gateway time-out|time-out/i.test(raw) ||
        (error instanceof Error && 'status' in error && Number((error as { status?: number }).status) === 504);
      const description = esTimeout
        ? 'La confirmación tardó más de lo esperado. Revise «Mis pedidos»: si aparece el pedido, no vuelva a enviarlo.'
        : /procesando|ya se cre[oó]|409/i.test(raw)
          ? 'Su pedido ya está siendo registrado. Revise «Mis pedidos» antes de intentar de nuevo.'
          : raw || 'No se pudo registrar el pedido.';
      toast.error(esTimeout ? 'Tiempo de espera agotado' : 'Error al crear pedido', { description });
      if (import.meta.env.DEV) {
        console.error('Error al crear pedido desde checkout', error);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmittingPedido(false);
    }
  }, [
    carrito,
    checkoutComprobanteError,
    checkoutData.observaciones,
    checkoutDireccion,
    checkoutDireccionError,
    checkoutFechaEntrega,
    checkoutFechaEntregaError,
    checkoutStockError,
    checkoutTelefonoDigits,
    checkoutTelefonoError,
    checkoutValid,
    clearCart,
    comprobanteUrl,
    isSubmittingPedido,
    onPedidoCreated,
    porcentajePago,
    resetCheckoutForm,
    totalCarrito,
    user?.nombre,
  ]);

  return {
    showCheckout,
    setShowCheckout,
    isSubmittingPedido,
    porcentajePago,
    setPorcentajePago,
    checkoutData,
    setCheckoutData,
    checkoutTouched,
    setCheckoutTouched,
    checkoutAttempted,
    setCheckoutAttempted,
    checkoutDireccion,
    checkoutTelefonoDigits,
    checkoutFechaEntrega,
    shouldShowDireccionError,
    shouldShowTelefonoError,
    shouldShowFechaEntregaError,
    checkoutDireccionError,
    checkoutTelefonoError,
    checkoutFechaEntregaError,
    checkoutStockError,
    shouldShowComprobanteError,
    checkoutComprobanteError,
    checkoutValid,
    comprobanteUrl,
    comprobantePreview,
    comprobanteUploading,
    handleComprobanteFile,
    totalCarrito,
    resetCheckoutForm,
    realizarPedido,
    confirmarPedido,
  };
}
