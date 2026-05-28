import { useEffect, useMemo, useState } from 'react';
import { toast } from '../AlertDialog';
import {
  CartItem,
  GUEST_CART_STORAGE_KEY,
  Producto,
  UserData,
  calcularCantidadItemsCarrito,
  calcularTotalCarrito,
  esProductoDePreparacion,
  getCartItemStockError,
  getCartItemStockHelper,
  getCartStorageKey,
  productoDisponibleParaPedido,
} from './landingShared';

interface UseCartOptions {
  user?: UserData;
  productos: Producto[];
}

export function useCart({ user, productos }: UseCartOptions) {
  const [carrito, setCarrito] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const guestKey = GUEST_CART_STORAGE_KEY;
    const userKey = getCartStorageKey(user);
    let raw = window.localStorage.getItem(userKey);

    if (user?.email && !raw) {
      const guestRaw = window.localStorage.getItem(guestKey);
      if (guestRaw) {
        raw = guestRaw;
        window.localStorage.setItem(userKey, guestRaw);
        window.localStorage.removeItem(guestKey);
      }
    }

    if (!raw) {
      setCarrito([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setCarrito([]);
        return;
      }

      setCarrito(
        parsed.filter(
          (item) =>
            item &&
            item.producto &&
            typeof item.producto.id !== 'undefined' &&
            typeof item.cantidad === 'number'
        )
      );
    } catch {
      setCarrito([]);
    }
  }, [user?.email]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getCartStorageKey(user), JSON.stringify(carrito));
  }, [carrito, user?.email]);

  useEffect(() => {
    if (!productos.length) return;

    setCarrito((prev) =>
      prev
        .map((item) => {
          const productoActualizado = productos.find((producto) => producto.id === item.producto.id);
          return productoActualizado ? { ...item, producto: productoActualizado } : item;
        })
        .filter((item) => item.producto)
    );
  }, [productos]);

  const agregarAlCarrito = (producto: Producto) => {
    if (!productoDisponibleParaPedido(producto)) {
      toast.error('Producto sin stock', {
        description: `${producto.nombre} no está disponible en este momento.`,
      });
      return;
    }

    setCarrito((prev) => {
      const itemExistente = prev.find((item) => item.producto.id === producto.id);
      if (itemExistente) {
        if (!esProductoDePreparacion(producto) && itemExistente.cantidad >= producto.stock) {
          toast.error('Stock máximo alcanzado', {
            description: `No puedes agregar más unidades de ${producto.nombre}.`,
          });
          return prev;
        }
        return prev.map((item) =>
          item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const incrementarCantidad = (productoId: string) => {
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.producto.id !== productoId) return item;
        if (
          !esProductoDePreparacion(item.producto) &&
          item.producto.stock > 0 &&
          item.cantidad >= item.producto.stock
        ) {
          toast.error('Stock máximo alcanzado', {
            description: `No puedes pedir más unidades de ${item.producto.nombre}.`,
          });
          return item;
        }
        return { ...item, cantidad: item.cantidad + 1 };
      })
    );
  };

  const decrementarCantidad = (productoId: string) => {
    setCarrito((prev) =>
      prev.map((item) =>
        item.producto.id === productoId
          ? { ...item, cantidad: Math.max(1, item.cantidad - 1) }
          : item
      )
    );
  };

  const actualizarCantidad = (productoId: string, rawValue: string) => {
    const digits = String(rawValue || '').replace(/\D/g, '');
    const nextCantidad = digits ? Math.min(999, Math.max(1, Number(digits))) : 1;
    setCarrito((prev) =>
      prev.map((item) =>
        item.producto.id === productoId ? { ...item, cantidad: nextCantidad } : item
      )
    );
  };

  const eliminarDelCarrito = (productoId: string) => {
    setCarrito((prev) => prev.filter((item) => item.producto.id !== productoId));
  };

  const limpiarCarrito = () => {
    if (typeof window !== 'undefined') {
      const userKey = getCartStorageKey(user);
      window.localStorage.removeItem(userKey);
      // Defensa adicional: evita que residuos del carrito invitado reaparezcan.
      window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    }
    setCarrito([]);
  };

  const totalCarrito = useMemo(() => calcularTotalCarrito(carrito), [carrito]);
  const cantidadItemsCarrito = useMemo(() => calcularCantidadItemsCarrito(carrito), [carrito]);
  const hayErroresDeStock = useMemo(
    () => carrito.some((item) => Boolean(getCartItemStockError(item))),
    [carrito]
  );

  return {
    carrito,
    totalCarrito,
    cantidadItemsCarrito,
    hayErroresDeStock,
    agregarAlCarrito,
    incrementarCantidad,
    decrementarCantidad,
    actualizarCantidad,
    eliminarDelCarrito,
    limpiarCarrito,
    getCartItemStockError,
    getCartItemStockHelper,
  };
}
