import React, { useEffect, useState } from 'react';
import { AlertDialog, toast } from '../AlertDialog';
import { CartDrawer } from '../cart/CartDrawer';
import { AgeVerificationModal } from '../modals/AgeVerificationModal';
import { ChangePasswordModal } from '../modals/ChangePasswordModal';
import { CheckoutModal } from '../modals/CheckoutModal';
import { MyOrdersModal } from '../modals/MyOrdersModal';
import { ProfileModal } from '../modals/ProfileModal';
import { useAgeVerification } from '../hooks/useAgeVerification';
import { useLandingAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useCheckout } from '../hooks/useCheckout';
import { LandingPageProps, consumeLandingScroll, fechaMinimaEntregaColombia, productoDisponibleParaPedido, scrollToSection } from '../hooks/landingShared';
import { useOrders } from '../hooks/useOrders';
import { useProducts } from '../hooks/useProducts';
import { CarouselSection } from '../sections/Carousel/CarouselSection';
import { ContactSection } from '../sections/Contact/ContactSection';
import { Header } from '../sections/Header/Header';
import { ProductsSection } from '../sections/Products/ProductsSection';
import { SideMenu } from '../sections/SideMenu/SideMenu';

export function LandingPage({
  onNavigateToLogin,
  onNavigateToRegister,
  onNavigateToNosotros,
  user,
  onLogout,
}: LandingPageProps) {
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isCarritoOpen, setIsCarritoOpen] = useState(false);
  const [categoriasExpanded, setCategoriasExpanded] = useState(false);

  const {
    categorias,
    productos,
    productosFiltrados,
    busqueda,
    setBusqueda,
    categoriaSeleccionada,
    setCategoriaSeleccionada,
  } = useProducts();

  const {
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
  } = useCart({
    user,
    productos,
  });

  const { showMisPedidos, setShowMisPedidos, pedidos, misPedidosLoading, refreshPedidos } = useOrders(
    user
  );

  const {
    showCheckout,
    setShowCheckout,
    isSubmittingPedido,
    porcentajePago,
    setPorcentajePago,
    checkoutData,
    setCheckoutData,
    setCheckoutTouched,
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
    handleComprobanteFile,
    checkoutValid,
    realizarPedido,
    confirmarPedido,
  } = useCheckout({
    user,
    carrito,
    clearCart: limpiarCarrito,
    onRequireLogin: () => {
      setIsCarritoOpen(false);
      onNavigateToLogin();
    },
    onPedidoCreated: refreshPedidos,
  });

  const {
    isProfileOpen,
    isChangePasswordOpen,
    isPasswordSubmitting,
    passwordData,
    setPasswordData,
    currentPwdOk,
    isLogoutDialogOpen,
    setIsLogoutDialogOpen,
    newPwdErr,
    samePasswordErr,
    confirmErr,
    currentErr,
    passwordSubmitDisabled,
    openProfile,
    closeProfile,
    openChangePassword,
    closeChangePassword,
    submitChangePassword,
    handleLogoutClick,
    handleConfirmLogout,
  } = useLandingAuth({
    user,
    onLogout,
  });

  const {
    mostrarVerificacionEdad,
    accesoBloqueadoPorEdad,
    handleConfirmarMayorEdad,
    handleRechazarMayorEdad,
    volverDesdeBloqueo,
  } = useAgeVerification();

  const handleSectionShortcut = (sectionId: 'inicio' | 'productos' | 'contacto') => {
    setIsSideMenuOpen(false);
    scrollToSection(sectionId);
  };

  const handleCategoriaClick = (categoria: string) => {
    setCategoriaSeleccionada(categoria);
    setIsSideMenuOpen(false);
    scrollToSection('productos');
  };

  const handleShowAllProducts = () => {
    setCategoriaSeleccionada('Todos');
    scrollToSection('productos');
  };

  useEffect(() => {
    const target = consumeLandingScroll();
    if (target) {
      scrollToSection(target);
    }
  }, []);

  const handleExploreProducts = () => {
    setIsCarritoOpen(false);
    scrollToSection('productos');
  };

  return (
    <div className="min-h-screen h-screen overflow-y-auto bg-background main-content-scroll">
      <Header
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        onToggleMenu={() => setIsSideMenuOpen((prev) => !prev)}
        user={user}
        cantidadItemsCarrito={cantidadItemsCarrito}
        onOpenProfile={openProfile}
        onLogout={handleLogoutClick}
        onNavigateToLogin={onNavigateToLogin}
        onNavigateToRegister={onNavigateToRegister}
        onOpenCart={() => setIsCarritoOpen(true)}
        onScrollToTop={() => scrollToSection('inicio')}
      />

      <SideMenu
        isOpen={isSideMenuOpen}
        user={user}
        categorias={categorias}
        categoriasExpanded={categoriasExpanded}
        categoriaSeleccionada={categoriaSeleccionada}
        onClose={() => setIsSideMenuOpen(false)}
        onToggleCategorias={() => setCategoriasExpanded((prev) => !prev)}
        onCategoriaClick={handleCategoriaClick}
        onSectionShortcut={handleSectionShortcut}
        onOpenProfile={() => {
                        setIsSideMenuOpen(false);
          openProfile();
        }}
        onOpenOrders={() => {
                        setIsSideMenuOpen(false);
                        setShowMisPedidos(true);
                      }}
        onNavigateToNosotros={() => {
                    setIsSideMenuOpen(false);
                    onNavigateToNosotros();
                  }}
        onNavigateToLogin={() => {
                          setIsSideMenuOpen(false);
                          onNavigateToLogin();
                        }}
        onNavigateToRegister={() => {
                          setIsSideMenuOpen(false);
                          onNavigateToRegister();
                        }}
        onLogout={() => {
          setIsSideMenuOpen(false);
          handleLogoutClick();
        }}
      />

      <CartDrawer
        isOpen={isCarritoOpen}
        user={user}
        carrito={carrito}
        cantidadItemsCarrito={cantidadItemsCarrito}
        totalCarrito={totalCarrito}
        hayErroresDeStock={hayErroresDeStock}
        onClose={() => setIsCarritoOpen(false)}
        onExploreProducts={handleExploreProducts}
        onCheckout={() => {
          const startedCheckout = realizarPedido();
          if (startedCheckout) {
            setIsCarritoOpen(false);
          }
        }}
        onDecrement={decrementarCantidad}
        onIncrement={incrementarCantidad}
        onUpdateQuantity={actualizarCantidad}
        onRemove={eliminarDelCarrito}
        getStockError={getCartItemStockError}
        getStockHelper={getCartItemStockHelper}
      />

      <CarouselSection />

      <ProductsSection
        categorias={categorias}
        categoriaSeleccionada={categoriaSeleccionada}
        productosFiltrados={productosFiltrados}
        onSelectCategoria={setCategoriaSeleccionada}
        onAddToCart={agregarAlCarrito}
        isProductAvailable={productoDisponibleParaPedido}
      />

      <ContactSection
        onNavigateToNosotros={onNavigateToNosotros}
        onShowAllProducts={handleShowAllProducts}
        onScrollToTop={() => scrollToSection('inicio')}
      />

      <CheckoutModal
        isOpen={showCheckout}
        carrito={carrito}
        totalCarrito={totalCarrito}
        porcentajePago={porcentajePago}
        checkoutData={checkoutData}
        shouldShowDireccionError={shouldShowDireccionError}
        shouldShowTelefonoError={shouldShowTelefonoError}
        checkoutDireccionError={checkoutDireccionError}
        checkoutTelefonoError={checkoutTelefonoError}
        checkoutTelefonoDigits={checkoutTelefonoDigits}
        shouldShowFechaEntregaError={shouldShowFechaEntregaError}
        checkoutFechaEntregaError={checkoutFechaEntregaError}
        checkoutStockError={checkoutStockError}
        shouldShowComprobanteError={shouldShowComprobanteError}
        checkoutComprobanteError={checkoutComprobanteError}
        comprobantePreview={comprobantePreview}
        comprobanteUploading={comprobanteUploading}
        checkoutValid={checkoutValid}
        isSubmittingPedido={isSubmittingPedido}
        onClose={() => setShowCheckout(false)}
        onPorcentajePagoChange={setPorcentajePago}
        onComprobanteFile={handleComprobanteFile}
        onDireccionChange={(value) => {
                        setCheckoutTouched((prev) => ({ ...prev, direccion: true }));
          setCheckoutData((prev) => ({ ...prev, direccion: value }));
        }}
        onTelefonoChange={(value) => {
                        setCheckoutTouched((prev) => ({ ...prev, telefono: true }));
          setCheckoutData((prev) => ({ ...prev, telefono: value }));
        }}
        onFechaEntregaChange={(value) => {
          const fechaEnt = value;
          const hoy = fechaMinimaEntregaColombia();
          if (fechaEnt < hoy) {
            toast.warning('La fecha de entrega no puede ser una fecha pasada');
            return;
          }
          setCheckoutTouched((prev) => ({ ...prev, fechaEntrega: true }));
          setCheckoutData((prev) => ({ ...prev, fechaEntrega: fechaEnt }));
        }}
        onObservacionesChange={(value) => {
          setCheckoutData((prev) => ({ ...prev, observaciones: value }));
        }}
        onConfirm={confirmarPedido}
        getCartItemStockError={getCartItemStockError}
      />

      <MyOrdersModal
        isOpen={showMisPedidos}
        pedidos={pedidos}
        misPedidosLoading={misPedidosLoading}
        onClose={() => setShowMisPedidos(false)}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        user={user}
        onClose={closeProfile}
        onOpenChangePassword={openChangePassword}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        passwordData={passwordData}
        currentPwdOk={currentPwdOk}
        currentErr={currentErr}
        newPwdErr={newPwdErr}
        samePasswordErr={samePasswordErr}
        confirmErr={confirmErr}
        isSubmitting={isPasswordSubmitting}
        passwordSubmitDisabled={passwordSubmitDisabled}
        onClose={closeChangePassword}
        onCurrentPasswordChange={(value) =>
          setPasswordData((prev) => ({ ...prev, currentPassword: value }))
        }
        onNewPasswordChange={(value) =>
          setPasswordData((prev) => ({ ...prev, newPassword: value }))
        }
        onConfirmPasswordChange={(value) =>
          setPasswordData((prev) => ({ ...prev, confirmPassword: value }))
        }
        onSubmit={submitChangePassword}
      />

      <AgeVerificationModal
        isOpen={mostrarVerificacionEdad}
        accesoBloqueadoPorEdad={accesoBloqueadoPorEdad}
        onConfirm={handleConfirmarMayorEdad}
        onReject={handleRechazarMayorEdad}
        onBack={volverDesdeBloqueo}
      />

      <AlertDialog
        isOpen={isLogoutDialogOpen}
        onClose={() => setIsLogoutDialogOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Cerrar Sesión"
        description="¿Está seguro que desea cerrar sesión?"
        type="warning"
        confirmText="Sí, cerrar sesión"
        cancelText="Cancelar"
        showCancel={true}
      />
    </div>
  );
}
