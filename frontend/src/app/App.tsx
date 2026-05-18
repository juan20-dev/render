import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Toaster } from './components/AlertDialog';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { AuthProvider, useAuth } from './components/AuthContext';
import { api } from './services/api';
import { firstPermittedStaffPath } from './services/routePermissions';
import { LandingPage } from './components/pages/LandingPage';
import { NosotrosPage } from './components/pages/NosotrosPage';
import { Login } from './components/pages/Login';
import { Dashboard } from './components/pages/Dashboard';
import { Roles } from './components/pages/usuarios/Roles';
import { Usuarios } from './components/pages/usuarios/Usuarios';
import { Accesos } from './components/pages/usuarios/Accesos';
import { Proveedores } from './components/pages/compras/Proveedores';
import { Compras } from './components/pages/compras/Compras';
import { Productos } from './components/pages/compras/Productos';
import { Categorias } from './components/pages/compras/Categorias';
import { Insumos } from './components/pages/produccion/Insumos';
import { EntregaInsumos } from './components/pages/produccion/EntregaInsumos';
import { Produccion } from './components/pages/produccion/Produccion';
import { Clientes } from './components/pages/ventas/Clientes';
import { Ventas } from './components/pages/ventas/Ventas';
import { Abonos } from './components/pages/ventas/Abonos';
import { Pedidos } from './components/pages/ventas/Pedidos';
import { Domicilios } from './components/pages/ventas/Domicilios';
import { TiendaCliente } from './components/pages/cliente/TiendaCliente';
import { MisPedidos } from './components/pages/cliente/MisPedidos';
import { MiPerfil } from './components/pages/cliente/MiPerfil';
import { SessionIdleWatcher } from './components/SessionIdleWatcher';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/medicion': 'Dashboard',
  '/usuarios/roles': 'Gestión de Roles',
  '/usuarios/usuarios': 'Gestión de Usuarios',
  '/usuarios/accesos': 'Gestión de Accesos',
  '/compras/proveedores': 'Proveedores',
  '/compras/compras': 'Compras',
  '/compras/productos': 'Productos',
  '/compras/categorias': 'Categorías de Producto',
  '/produccion/produccion': 'Producción',
  '/produccion/entrega-insumos': 'Entrega de Insumos',
  '/produccion/insumos': 'Insumos',
  '/ventas/clientes': 'Clientes',
  '/ventas/ventas': 'Ventas',
  '/ventas/abonos': 'Abonos',
  '/ventas/pedidos': 'Pedidos',
  '/ventas/domicilios': 'Domicilios',
  '/configuracion/roles': 'Gestión de Roles',
  '/cliente/tienda': 'Tienda de Productos',
  '/cliente/pedidos': 'Mis Pedidos',
  '/cliente/perfil': 'Mi Perfil',
};

function RequireRouteAccess({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const routeKey = location.pathname.replace(/^\//, '');
  if (!user) return null;
  if (!hasPermission(routeKey)) {
    const fallback =
      user.rol === 'Cliente'
        ? '/cliente/tienda'
        : firstPermittedStaffPath(user.permisos || [], user.rol);
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function StaffLayout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (!user) return null;

  const pageTitle = pageTitles[location.pathname] || "Grandma's Liqueurs";
  const staffHome = firstPermittedStaffPath(user.permisos || [], user.rol);

  const handleNavigate = (path: string) => {
    const routeKey = path.replace(/^\//, '');
    if (hasPermission(routeKey)) navigate(path);
    else navigate(staffHome);
  };

  return (
    <div className="flex min-h-screen h-full bg-background">
      <Sidebar currentPath={location.pathname} onNavigate={handleNavigate} />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header
          title={pageTitle}
          userName={`${user.nombre} ${user.apellido}`}
          userRole={user.rol}
          userData={user}
          onLogout={async () => {
            await logout();
            navigate('/');
          }}
        />
        <main key={user.id} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <RequireRouteAccess>
            <Routes>
              <Route path="/" element={<Navigate to={staffHome} replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/medicion" element={<Dashboard />} />
              <Route path="/configuracion/roles" element={<Roles />} />
              <Route path="/usuarios/roles" element={<Roles />} />
              <Route path="/usuarios/usuarios" element={<Usuarios />} />
              <Route path="/usuarios/accesos" element={<Accesos />} />
              <Route path="/compras/proveedores" element={<Proveedores />} />
              <Route path="/compras/compras" element={<Compras />} />
              <Route path="/compras/productos" element={<Productos />} />
              <Route path="/compras/categorias" element={<Categorias />} />
              <Route path="/produccion/produccion" element={<Produccion />} />
              <Route path="/produccion/entrega-insumos" element={<EntregaInsumos />} />
              <Route path="/produccion/insumos" element={<Insumos />} />
              <Route path="/ventas/clientes" element={<Clientes />} />
              <Route path="/ventas/ventas" element={<Ventas />} />
              <Route path="/ventas/abonos" element={<Abonos />} />
              <Route path="/ventas/pedidos" element={<Pedidos />} />
              <Route path="/ventas/domicilios" element={<Domicilios />} />
              <Route path="*" element={<Navigate to={staffHome} replace />} />
            </Routes>
          </RequireRouteAccess>
        </main>
      </div>
    </div>
  );
}

function ClienteAppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (!user) return null;

  const pageTitle = pageTitles[location.pathname] || 'Mi cuenta';

  return (
    <div className="flex min-h-screen h-full bg-background">
      <Sidebar
        currentPath={location.pathname}
        onNavigate={(path) => navigate(path)}
      />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header
          title={pageTitle}
          userName={`${user.nombre} ${user.apellido}`}
          userRole={user.rol}
          userData={user}
          onLogout={async () => {
            await logout();
            navigate('/');
          }}
        />
        <main key={user.id} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <RequireRouteAccess>
            <Routes>
              <Route path="/cliente/tienda" element={<TiendaCliente />} />
              <Route path="/cliente/pedidos" element={<MisPedidos />} />
              <Route path="/cliente/perfil" element={<MiPerfil />} />
              <Route path="*" element={<Navigate to="/cliente/tienda" replace />} />
            </Routes>
          </RequireRouteAccess>
        </main>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showAuth, setShowAuth] = useState<'landing' | 'login' | 'register' | 'nosotros'>('landing');
  const [stayOnLanding, setStayOnLanding] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.rol === 'Cliente' && stayOnLanding) return;
    if (user.rol === 'Cliente') {
      if (!location.pathname.startsWith('/cliente')) {
        navigate('/cliente/tienda', { replace: true });
      }
      return;
    }
    const home = firstPermittedStaffPath(user.permisos || [], user.rol);
    if (location.pathname === '/' || location.pathname === '') {
      navigate(home, { replace: true });
    }
  }, [user, stayOnLanding, navigate, location.pathname]);

  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
    const me = await api.auth.me();
    setShowAuth('landing');
    if (me.rol === 'Cliente') {
      setStayOnLanding(true);
    } else {
      setStayOnLanding(false);
      navigate(firstPermittedStaffPath(me.permisos || [], me.rol), { replace: true });
    }
  };

  if (user?.rol === 'Cliente' && stayOnLanding) {
    if (showAuth === 'nosotros') {
      return (
        <NosotrosPage
          onNavigateToRegister={() => setShowAuth('register')}
          onBackToHome={() => setShowAuth('landing')}
        />
      );
    }
    return (
      <LandingPage
        onNavigateToLogin={() => setShowAuth('login')}
        onNavigateToRegister={() => setShowAuth('register')}
        onNavigateToNosotros={() => setShowAuth('nosotros')}
        user={user}
        onLogout={async () => {
          setStayOnLanding(false);
          navigate('/');
        }}
      />
    );
  }

  if (user?.rol === 'Cliente') {
    return <ClienteAppShell />;
  }

  if (user) {
    return <StaffLayout />;
  }

  if (showAuth === 'landing') {
    return (
      <LandingPage
        onNavigateToLogin={() => setShowAuth('login')}
        onNavigateToRegister={() => setShowAuth('register')}
        onNavigateToNosotros={() => setShowAuth('nosotros')}
      />
    );
  }

  if (showAuth === 'nosotros') {
    return (
      <NosotrosPage
        onNavigateToRegister={() => setShowAuth('register')}
        onBackToHome={() => setShowAuth('landing')}
      />
    );
  }

  return (
    <Login
      onLogin={handleLogin}
      initialTab={showAuth === 'register' ? 'register' : 'login'}
      onBackToLanding={() => setShowAuth('landing')}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionIdleWatcher />
        <Toaster richColors position="top-center" closeButton />
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}