import React from 'react';
import { ShoppingCart, X } from 'lucide-react';
import { Button } from '../Button';
import { CartItem as CartItemType, UserData } from '../hooks/landingShared';
import { CartItem } from './CartItem';
import { CartSummary } from './CartSummary';

interface CartDrawerProps {
  isOpen: boolean;
  user?: UserData;
  carrito: CartItemType[];
  cantidadItemsCarrito: number;
  totalCarrito: number;
  hayErroresDeStock: boolean;
  onClose: () => void;
  onExploreProducts: () => void;
  onCheckout: () => void;
  onDecrement: (productoId: string) => void;
  onIncrement: (productoId: string) => void;
  onUpdateQuantity: (productoId: string, value: string) => void;
  onRemove: (productoId: string) => void;
  getStockError: (item: CartItemType) => string;
  getStockHelper: (item: CartItemType) => string;
}

export function CartDrawer({
  isOpen,
  user,
  carrito,
  cantidadItemsCarrito,
  totalCarrito,
  hayErroresDeStock,
  onClose,
  onExploreProducts,
  onCheckout,
  onDecrement,
  onIncrement,
  onUpdateQuantity,
  onRemove,
  getStockError,
  getStockHelper,
}: CartDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white z-50 shadow-2xl overflow-y-auto main-content-scroll">
        <div className="sticky top-0 bg-primary text-white p-6 shadow-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6" />
              <h3 className="text-white">Mi Carrito</h3>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          {cantidadItemsCarrito > 0 && (
            <p className="text-sm text-white/80 mt-2">
              {cantidadItemsCarrito} {cantidadItemsCarrito === 1 ? 'producto' : 'productos'}
            </p>
          )}
        </div>

        <div className="p-6">
          {carrito.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground mb-2">Tu carrito está vacío</p>
              <p className="text-sm text-muted-foreground mb-6">
                Agrega productos para comenzar tu compra
              </p>
              <Button onClick={onExploreProducts} className="bg-primary text-white">
                Explorar Productos
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-6">
                {carrito.map((item) => (
                  <CartItem
                    key={item.producto.id}
                    item={item}
                    stockError={getStockError(item)}
                    stockHelper={getStockHelper(item)}
                    onDecrement={onDecrement}
                    onIncrement={onIncrement}
                    onUpdateQuantity={onUpdateQuantity}
                    onRemove={onRemove}
                  />
                ))}
              </div>

              <CartSummary
                totalCarrito={totalCarrito}
                cantidadLineas={carrito.length}
                cantidadUnidades={cantidadItemsCarrito}
                hayErroresDeStock={hayErroresDeStock}
                user={user}
                onCheckout={onCheckout}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
