import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '../../Button';
import { Producto } from '../../hooks/landingShared';
import { formatCurrencyCop } from '../../../services/mappers';

interface ProductCardProps {
  producto: Producto;
  isAvailable: boolean;
  onAddToCart: (producto: Producto) => void;
}

export function ProductCard({ producto, isAvailable, onAddToCart }: ProductCardProps) {
  return (
    <div className="w-[160px] sm:w-[180px] md:w-[190px] bg-card rounded-lg shadow-md hover:shadow-xl transition-shadow overflow-hidden group">
      <div className="relative h-32 sm:h-36 md:h-40 overflow-hidden">
        <img
          src={producto.imagen}
          alt={producto.nombre}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
        />
        <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-primary text-white rounded-full text-[10px] sm:text-xs">
          {producto.categoria}
        </div>
      </div>

      <div className="p-2 sm:p-3">
        <h4 className="mb-1 text-xs sm:text-sm line-clamp-1">{producto.nombre}</h4>
        <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 sm:mb-3 line-clamp-2">
          {producto.descripcion}
        </p>
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <span className="text-primary text-xs sm:text-sm font-medium">
            {formatCurrencyCop(producto.precio)}
          </span>
          <Button
            onClick={() => onAddToCart(producto)}
            size="sm"
            className="w-full text-[10px] sm:text-xs py-1 sm:py-1.5"
            icon={<ShoppingCart className="w-3 h-3" />}
            disabled={!isAvailable}
          >
            {isAvailable ? 'Agregar' : 'Agotado'}
          </Button>
        </div>
      </div>
    </div>
  );
}
