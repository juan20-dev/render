import React, { Suspense, lazy, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { AuthProvider, useAuth } from './components/AuthContext';
import type { AuthLoginResult } from './components/AuthContext';
import { useAlertDialog } from './components/AlertDialog';
import { subscribeApiLoading } from './services/api';

// Login
import { Login } from './components/pages/Login';

const DashboardPage = lazy(() => import('./components/pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const HomePage = lazy(() => import('./components/pages/Home').then((module) => ({ default: module.Home })));
const RolesPage = lazy(() => import('./components/pages/usuarios/Roles').then((module) => ({ default: module.Roles })));
const UsuariosPage = lazy(() => import('./components/pages/usuarios/Usuarios').then((module) => ({ default: module.Usuarios })));
const AccesosPage = lazy(() => import('./components/pages/usuarios/Accesos').then((module) => ({ default: module.Accesos })));
const ProveedoresPage = lazy(() => import('./components/pages/compras/Proveedores').then((module) => ({ default: module.Proveedores })));
const ComprasPage = lazy(() => import('./components/pages/compras/Compras').then((module) => ({ default: module.Compras })));
const ProductosPage = lazy(() => import('./components/pages/compras/Productos').then((module) => ({ default: module.Productos })));
const CategoriasPage = lazy(() => import('./components/pages/compras/Categorias').then((module) => ({ default: module.Categorias })));
const InsumosPage = lazy(() => import('./components/pages/produccion/Insumos').then((module) => ({ default: module.Insumos })));
const ProduccionPage = lazy(() => import('./components/pages/produccion/Produccion').then((module) => ({ default: module.Produccion })));
const ClientesPage = lazy(() => import('./components/pages/ventas/Clientes').then((module) => ({ default: module.Clientes })));
const VentasPage = lazy(() => import('./components/pages/ventas/Ventas').then((module) => ({ default: module.Ventas })));
const AbonosPage = lazy(() => import('./components/pages/ventas/Abonos').then((module) => ({ default: module.Abonos })));
const PedidosPage = lazy(() => import('./components/pages/ventas/Pedidos').then((module) => ({ default: module.Pedidos })));
const DomiciliosPage = lazy(() => import('./components/pages/ventas/Domicilios').then((module) => ({ default: module.Domicilios })));
const TiendaClientePage = lazy(() => import('./components/pages/cliente/TiendaCliente').then((module) => ({ default: module.TiendaCliente })));
const MisPedidosPage = lazy(() => import('./components/pages/cliente/MisPedidos').then((module) => ({ default: module.MisPedidos })));
const MisComprasClientePage = lazy(() =>
  import('./components/pages/cliente/MisComprasCliente').then((module) => ({ default: module.MisComprasCliente }))
);
const MisDomiciliosClientePage = lazy(() =>
  import('./components/pages/cliente/MisDomiciliosCliente').then((module) => ({ default: module.MisDomiciliosCliente }))
);
const MiPerfilPage = lazy(() => import('./components/pages/cliente/MiPerfil').then((module) => ({ default: module.MiPerfil })));

const pageComponents: { [key: string]: React.ComponentType } = {
  '/': HomePage,
  '/dashboard': DashboardPage,
  '/medicion': DashboardPage,
  '/usuarios/roles': RolesPage,
  '/usuarios/usuarios': UsuariosPage,
  '/usuarios/accesos': AccesosPage,
  '/compras/proveedores': ProveedoresPage,
  '/compras/compras': ComprasPage,
  '/compras/productos': ProductosPage,
  '/compras/categorias': CategoriasPage,
  '/produccion/insumos': InsumosPage,
  '/produccion/produccion': ProduccionPage,
  '/ventas/clientes': ClientesPage,
  '/ventas/ventas': VentasPage,
  '/ventas/abonos': AbonosPage,
  '/ventas/pedidos': PedidosPage,
  '/ventas/domicilios': DomiciliosPage,
  '/configuracion/roles': RolesPage,
  '/cliente/tienda': TiendaClientePage,
  '/cliente/pedidos': MisPedidosPage,
  '/cliente/compras': MisComprasClientePage,
  '/cliente/domicilios': MisDomiciliosClientePage,
  '/perfil': MiPerfilPage,
};

const pageTitles: { [key: string]: string } = {
  '/': 'Inicio',
  '/dashboard': 'Dashboard',
  '/medicion': 'Dashboard',
  '/usuarios/roles': 'Gestión de Roles',
  '/usuarios/usuarios': 'Gestión de Usuarios',
  '/usuarios/accesos': 'Gestión de Accesos',
  '/compras/proveedores': 'Proveedores',
  '/compras/compras': 'Compras',
  '/compras/productos': 'Productos',
  '/compras/categorias': 'Categorías de Producto',
  '/produccion/insumos': 'Entrega de Insumos',
  '/produccion/produccion': 'Producción',
  '/ventas/clientes': 'Clientes',
  '/ventas/ventas': 'Ventas',
  '/ventas/abonos': 'Abonos',
  '/ventas/pedidos': 'Pedidos',
  '/ventas/domicilios': 'Domicilios',
  '/configuracion/roles': 'Gestión de Roles',
  '/cliente/tienda': 'Tienda',
  '/cliente/pedidos': 'Mis Pedidos',
  '/cliente/compras': 'Mis compras',
  '/cliente/domicilios': 'Mis domicilios',
  '/perfil': 'Mi perfil',
};

function GlobalLoadingOverlay() {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1C0A11]/60 backdrop-blur-[3px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex min-w-[160px] items-center justify-center rounded-2xl border border-[#7A1F3D]/35 bg-[#FFF9FB] px-8 py-7 shadow-[0_18px_50px_rgba(0,0,0,0.38)]">
        <div className="flex items-end gap-2" aria-hidden="true">
          <span
            className="h-3 w-3 rounded-full bg-[#7A1F3D] animate-bounce"
            style={{ animationDelay: '0ms', animationDuration: '700ms' }}
          />
          <span
            className="h-3 w-3 rounded-full bg-[#7A1F3D] animate-bounce"
            style={{ animationDelay: '120ms', animationDuration: '700ms' }}
          />
          <span
            className="h-3 w-3 rounded-full bg-[#7A1F3D] animate-bounce"
            style={{ animationDelay: '240ms', animationDuration: '700ms' }}
          />
        </div>
        <span className="sr-only">Cargando</span>
      </div>
    </div>
  );
}

function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isApiLoading, setIsApiLoading] = useState(false);
  const [isGlobalLoadingVisible, setIsGlobalLoadingVisible] = useState(false);
  const { user, isAuthLoading, sessionWarningVersion, login, logout, hasPermission } = useAuth();
  const { showAlert, AlertComponent } = useAlertDialog();

  // Asegura landing consistente al iniciar sesion/cambiar de rol.
  React.useEffect(() => {
    if (!user) {
      setCurrentPath('');
      return;
    }

    const preferredPaths = [
      '/cliente/tienda',
      '/cliente/pedidos',
      '/dashboard',
      '/usuarios/usuarios',
      '/compras/compras',
      '/produccion/produccion',
      '/ventas/ventas',
      '/home',
    ];

    const defaultPath = preferredPaths.find((path) => hasPermission(path.substring(1))) || '/';
    setCurrentPath(defaultPath);
  }, [user?.id, user?.permisos, hasPermission]);

  React.useEffect(() => {
    const unsubscribe = subscribeApiLoading((loading) => {
      setIsApiLoading(loading);
    });

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (!user || sessionWarningVersion === 0) return;

    showAlert({
      title: 'Tu sesion cerrara pronto',
      description: 'Por seguridad, tu sesion expirara en aproximadamente 30 segundos. Guarda cualquier cambio pendiente.',
      type: 'info',
      onConfirm: () => {},
      confirmText: 'Entendido',
      cancelText: 'Cerrar',
    });
  }, [sessionWarningVersion, user?.id, showAlert]);

  React.useEffect(() => {
    setIsGlobalLoadingVisible(isApiLoading);
  }, [isApiLoading]);

  const handleNavigate = (path: string) => {
    // Verificar si el usuario tiene permiso para acceder a esta ruta
    if (hasPermission(path.substring(1))) { // Quitar el '/' inicial
      setCurrentPath(path);
    } else {
      showAlert({
        title: 'Acceso denegado',
        description: 'No tienes permisos para acceder a esta sección.',
        type: 'warning',
        onConfirm: () => {},
        confirmText: 'Entendido',
        cancelText: 'Cerrar',
      });
    }
  };

  const handleLogin = async (email: string, password: string, rememberMe = false): Promise<AuthLoginResult> => {
    const result = await login(email, password, rememberMe);
    if (result.success) {
      console.log('Login exitoso');
    }
    return result;
  };

  const handleLogout = () => {
    showAlert({
      title: 'Confirmar cierre de sesión',
      description: '¿Estás seguro de que deseas cerrar la sesión actual?',
      type: 'warning',
      confirmText: 'Sí, cerrar sesión',
      cancelText: 'Cancelar',
      onConfirm: () => {
        logout();
      },
    });
  };

  if (isAuthLoading) {
    return (
      <>
        {AlertComponent}
        <GlobalLoadingOverlay />
      </>
    );
  }

  // Si no está autenticado, mostrar pantalla de login
  if (!user) {
    return (
      <>
        <Login onLogin={handleLogin} />
        {AlertComponent}
        {isGlobalLoadingVisible && <GlobalLoadingOverlay />}
      </>
    );
  }

  const fallbackPath = [
    '/cliente/tienda',
    '/cliente/pedidos',
    '/dashboard',
    '/usuarios/usuarios',
    '/compras/compras',
    '/produccion/produccion',
    '/ventas/ventas',
  ].find((path) => hasPermission(path.substring(1))) || '/';
  const CurrentPage = pageComponents[currentPath] || pageComponents[fallbackPath] || HomePage;
  const pageTitle = pageTitles[currentPath] || 'Grandma\'s Liqueurs';

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPath={currentPath} onNavigate={handleNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={pageTitle} userName={`${user.nombre} ${user.apellido}`} userRole={user.rol} onLogout={handleLogout} />
        
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={null}>
            <CurrentPage />
          </Suspense>
        </main>
      </div>
      {AlertComponent}

      {isGlobalLoadingVisible && <GlobalLoadingOverlay />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}