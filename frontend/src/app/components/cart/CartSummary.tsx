import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '../Button';
import { FieldError } from '../Form';
import { UserData } from '../hooks/landingShared';
import { formatCurrencyCop } from '../../services/mappers';

interface CartSummaryProps {
  totalCarrito: number;
  cantidadLineas: number;
  cantidadUnidades: number;
  hayErroresDeStock: boolean;
  user?: UserData;
  onCheckout: () => void;
}

export function CartSummary({
  totalCarrito,
  cantidadLineas,
  cantidadUnidades,
  hayErroresDeStock,
  user,
  onCheckout,
}: CartSummaryProps) {
  return (
    <>
      <div className="border-t border-border pt-4 mb-6">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Referencias distintas</span>
            <span>{cantidadLineas}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Unidades totales</span>
            <span>{cantidadUnidades}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrencyCop(totalCarrito)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Domicilio</span>
            <span className="text-primary">A calcular</span>
          </div>
        </div>
        <div className="flex justify-between border-t border-border pt-4">
          <span>Total</span>
          <span className="text-primary">{formatCurrencyCop(totalCarrito)}</span>
        </div>
      </div>

      <Button
        onClick={onCheckout}
        className="w-full bg-primary text-white py-3"
        icon={<ShoppingBag className="w-5 h-5" />}
        disabled={hayErroresDeStock}
      >
        Realizar Pedido
      </Button>

      {hayErroresDeStock ? (
        <FieldError className="mt-4">
          Ajusta las cantidades antes de continuar. Hay productos que superan el stock disponible.
        </FieldError>
      ) : !user ? (
        <p className="text-xs text-center text-muted-foreground mt-4">
          Inicia sesión para completar tu compra
        </p>
      ) : null}
    </>
  );
}
