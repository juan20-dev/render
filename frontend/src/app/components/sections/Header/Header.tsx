import React from 'react';
import { Menu } from 'lucide-react';
import { LOGO_URL, UserData } from '../../hooks/landingShared';
import { NavButtons } from './NavButtons';
import { SearchBar } from './SearchBar';

interface HeaderProps {
  busqueda: string;
  onBusquedaChange: (value: string) => void;
  onToggleMenu: () => void;
  user?: UserData;
  cantidadItemsCarrito: number;
  onOpenProfile: () => void;
  onLogout: () => void;
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onOpenCart: () => void;
  onScrollToTop: () => void;
}

export function Header({
  busqueda,
  onBusquedaChange,
  onToggleMenu,
  user,
  cantidadItemsCarrito,
  onOpenProfile,
  onLogout,
  onNavigateToLogin,
  onNavigateToRegister,
  onOpenCart,
  onScrollToTop,
}: HeaderProps) {
  return (
    <nav className="bg-primary text-white sticky top-0 z-40 shadow-lg flex-shrink-0">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={onToggleMenu}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <SearchBar value={busqueda} onChange={onBusquedaChange} />
          </div>

          <button
            type="button"
            onClick={onScrollToTop}
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity"
            aria-label="Volver al inicio"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src={LOGO_URL}
                alt="Grandma's Liqueurs Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="hidden sm:block text-left">
              <h2 className="text-white text-sm md:text-base lg:text-lg">Grandma&apos;s Liqueurs</h2>
              <p className="text-xs text-white/80">Licores Premium</p>
            </div>
          </button>

          <NavButtons
            user={user}
            cantidadItemsCarrito={cantidadItemsCarrito}
            onOpenProfile={onOpenProfile}
            onLogout={onLogout}
            onNavigateToLogin={onNavigateToLogin}
            onNavigateToRegister={onNavigateToRegister}
            onOpenCart={onOpenCart}
          />
        </div>

        <div className="md:hidden pb-2 sm:pb-3">
          <SearchBar value={busqueda} onChange={onBusquedaChange} mobile />
        </div>
      </div>
    </nav>
  );
}
