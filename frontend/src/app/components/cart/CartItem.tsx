import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { FieldError, FieldHelper } from '../Form';
import { CartItem as CartItemType } from '../hooks/landingShared';
import { formatCurrencyCop } from '../../services/mappers';

interface CartItemProps {
  item: CartItemType;
  stockError: string;
  stockHelper: string;
  onDecrement: (productoId: string) => void;
  onIncrement: (productoId: string) => void;
  onUpdateQuantity: (productoId: string, value: string) => void;
  onRemove: (productoId: string) => void;
}

export function CartItem({
  item,
  stockError,
  stockHelper,
  onDecrement,
  onIncrement,
  onUpdateQuantity,
  onRemove,
}: CartItemProps) {
  const unitario = Number(item.producto.precio) || 0;
  const cantidad = Number(item.cantidad) || 0;
  const subtotal = unitario * cantidad;

  return (
    <div className="p-4 bg-background rounded-lg border border-border">
      <div className="flex gap-3">
        <img
          src={item.producto.imagen}
          alt={item.producto.nombre}
          className="w-20 h-20 flex-shrink-0 object-cover rounded-lg"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm mb-1 line-clamp-2">{item.producto.nombre}</h4>
              <p className="text-xs text-muted-foreground">{item.producto.categoria}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.producto.id)}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
              aria-label={`Eliminar ${item.producto.nombre} del carrito`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-primary mt-2">Unitario: {formatCurrencyCop(unitario)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Cantidad</span>
          <button
            type="button"
            onClick={() => onDecrement(item.producto.id)}
            className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            min={1}
            max={999}
            inputMode="numeric"
            value={item.cantidad}
            onChange={(e) => onUpdateQuantity(item.producto.id, e.target.value)}
            className="w-16 rounded-md border border-border bg-white px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label={`Cantidad de ${item.producto.nombre}`}
          />
          <button
            type="button"
            onClick={() => onIncrement(item.producto.id)}
            className="w-7 h-7 rounded-full bg-primary hover:bg-primary/90 text-white flex items-center justify-center transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="text-sm text-primary">{formatCurrencyCop(subtotal)}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {stockError ? <FieldError>{stockError}</FieldError> : <FieldHelper>{stockHelper}</FieldHelper>}
      </div>
    </div>
  );
}
