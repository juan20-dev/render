import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Producto } from '../../hooks/landingShared';
import { ProductCard } from './ProductCard';

interface ProductsSectionProps {
  categorias: string[];
  categoriaSeleccionada: string;
  productosFiltrados: Producto[];
  onSelectCategoria: (categoria: string) => void;
  onAddToCart: (producto: Producto) => void;
  isProductAvailable: (producto: Producto) => boolean;
}

export function ProductsSection({
  categorias,
  categoriaSeleccionada,
  productosFiltrados,
  onSelectCategoria,
  onAddToCart,
  isProductAvailable,
}: ProductsSectionProps) {
  const categoriasScrollRef = useRef<HTMLDivElement | null>(null);

  const desplazarCategorias = (direccion: 'izquierda' | 'derecha') => {
    if (!categoriasScrollRef.current) return;
    const delta = direccion === 'izquierda' ? -240 : 240;
    categoriasScrollRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <section id="productos" className="py-8 sm:py-12 md:py-16 bg-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-primary mb-3 sm:mb-4 text-xl sm:text-2xl md:text-3xl">
            Productos Destacados
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-4 sm:mb-6 text-sm sm:text-base px-4">
            Descubre nuestra selección premium de licores y bebidas de la más alta calidad
          </p>
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => desplazarCategorias('izquierda')}
              className="rounded-full border border-border bg-white p-1.5 text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
              aria-label="Desplazar categorías a la izquierda"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div
              ref={categoriasScrollRef}
              className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
            >
              <div className="inline-flex min-w-full items-center justify-start gap-2 px-1">
                {categorias.map((categoria) => (
                  <button
                    key={categoria}
                    onClick={() => onSelectCategoria(categoria)}
                    className={`rounded-full border px-3 py-1.5 text-xs sm:text-sm transition-colors ${
                      categoriaSeleccionada === categoria
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    {categoria}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => desplazarCategorias('derecha')}
              className="rounded-full border border-border bg-white p-1.5 text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
              aria-label="Desplazar categorías a la derecha"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {categoriaSeleccionada !== 'Todos' && (
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 text-primary rounded-lg">
              <span className="text-xs sm:text-sm">
                Mostrando: <strong>{categoriaSeleccionada}</strong>
              </span>
              <button
                onClick={() => onSelectCategoria('Todos')}
                className="ml-2 p-1 hover:bg-primary/20 rounded"
                title="Ver todos los productos"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
          {productosFiltrados.map((producto) => (
            <ProductCard
              key={producto.id}
              producto={producto}
              isAvailable={isProductAvailable(producto)}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>

        {productosFiltrados.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No se encontraron productos que coincidan con tu búsqueda
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
