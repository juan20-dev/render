import React, { useState } from 'react';
import { Toaster } from './components/AlertDialog';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { AuthProvider, useAuth } from './components/AuthContext';
import { api } from './services/api';
import { firstPermittedStaffPath } from './services/routePermissions';

// Landing Page
import { LandingPage } from './components/pages/LandingPage';
import { NosotrosPage } from './components/pages/NosotrosPage';

// Login
import { Login } from './components/pages/Login';

// Dashboard
import { Dashboard } from './components/pages/Dashboard';

// Usuarios
import { Roles } from './components/pages/usuarios/Roles';
import { Usuarios } from './components/pages/usuarios/Usuarios';
import { Accesos } from './components/pages/usuarios/Accesos';

// Compras
import { Proveedores } from './components/pages/compras/Proveedores';
import { Compras } from './components/pages/compras/Compras';
import { Productos } from './components/pages/compras/Productos';
import { Categorias } from './components/pages/compras/Categorias';

// Producción
import { Insumos } from './components/pages/produccion/Insumos';
import { EntregaInsumos } from './components/pages/produccion/EntregaInsumos';
import { Produccion } from './components/pages/produccion/Produccion';

// Ventas
import { Clientes } from './components/pages/ventas/Clientes';
import { Ventas } from './components/pages/ventas/Ventas';
import { Abonos } from './components/pages/ventas/Abonos';
import { Pedidos } from './components/pages/ventas/Pedidos';
import { Domicilios } from './components/pages/ventas/Domicilios';

// Cliente
import { TiendaCliente } from './components/pages/cliente/TiendaCliente';
import { MisPedidos } from './components/pages/cliente/MisPedidos';
import { MiPerfil } from './components/pages/cliente/MiPerfil';

const pageComponents: { [key: string]: React.ComponentType } = {
  '/': Dashboard,
  '/dashboard': Dashboard,
  '/medicion': Dashboard,
  '/usuarios/roles': Roles,
  '/usuarios/usuarios': Usuarios,
  '/usuarios/accesos': Accesos,
  '/compras/proveedores': Proveedores,
  '/compras/compras': Compras,
  '/compras/productos': Productos,
  '/compras/categorias': Categorias,
  '/produccion/produccion': Produccion,
  '/produccion/entrega-insumos': EntregaInsumos,
  '/produccion/insumos': Insumos,
  '/ventas/clientes': Clientes,
  '/ventas/ventas': Ventas,
  '/ventas/abonos': Abonos,
  '/ventas/pedidos': Pedidos,
  '/ventas/domicilios': Domicilios,
  '/configuracion/roles': Roles,
  '/cliente/tienda': TiendaCliente,
  '/cliente/pedidos': MisPedidos,
  '/cliente/perfil': MiPerfil
};

const pageTitles: { [key: string]: string } = {
  '/': 'Dashboard',
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
  '/cliente/perfil': 'Mi Perfil'
};

function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [showAuth, setShowAuth] = useState<'landing' | 'login' | 'register' | 'nosotros'>('landing');
  const [stayOnLanding, setStayOnLanding] = useState(false);
  const { user, login, logout, hasPermission } = useAuth();

  // Establecer ruta inicial basada en el rol del usuario
  React.useEffect(() => {
    if (user && !currentPath && !stayOnLanding) {
      if (user.rol === 'Cliente') {
        setStayOnLanding(true);
      } else {
        setCurrentPath(firstPermittedStaffPath(user.permisos || [], user.rol));
      }
    }
  }, [user, currentPath, stayOnLanding]);

  const handleNavigate = (path: string) => {
    // Verificar si el usuario tiene permiso para acceder a esta ruta
    if (hasPermission(path.substring(1))) { // Quitar el '/' inicial
      setCurrentPath(path);
    } else {
      alert('No tienes permisos para acceder a esta sección');
    }
  };

  const handleLogin = async (email: string, password: string) => {
    const success = await login(email, password);
    if (success) {
      try {
        const me = await api.auth.me();
        setShowAuth('landing');
        if (me.rol === 'Cliente') {
          setStayOnLanding(true);
          setCurrentPath('');
        } else {
          setStayOnLanding(false);
          setCurrentPath(firstPermittedStaffPath(me.permisos || [], me.rol));
        }
      } catch {
        setStayOnLanding(false);
        setCurrentPath('/dashboard');
      }
    } else {
      alert('Credenciales incorrectas');
    }
  };

  const handleLogout = async () => {
    await logout();
    setStayOnLanding(false);
    setCurrentPath('');
    setShowAuth('landing');
  };

  // Si el usuario es Cliente y debe quedarse en el landing
  if (user && user.rol === 'Cliente' && stayOnLanding) {
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
        onLogout={handleLogout}
      />
    );
  }

  // Si no está autenticado, mostrar landing page, login/registro o nosotros
  if (!user) {
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

  const CurrentPage = pageComponents[currentPath] || (user.rol === 'Cliente' ? TiendaCliente : Dashboard);
  const pageTitle = pageTitles[currentPath] || 'Grandma\'s Liqueurs';

  return (
    <div className="flex min-h-screen h-full bg-background">
      <Sidebar currentPath={currentPath} onNavigate={handleNavigate} />

      <div className="flex-1 flex flex-col min-h-screen">
        <Header
          title={pageTitle}
          userName={`${user.nombre} ${user.apellido}`}
          userRole={user.rol}
          userData={user}
          onLogout={handleLogout}
        />

        <main key={user.id} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <CurrentPage />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-center" closeButton />
      <AppContent />
    </AuthProvider>
  );
}