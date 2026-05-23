import React, { useState, useEffect } from 'react';
import { ShoppingCart, Menu, X, Search, User, Phone, Mail, MapPin, Facebook, Instagram, Plus, Minus, Trash2, ShoppingBag, FileEdit, LogOut, KeyRound, CreditCard, FileText } from 'lucide-react';
import { Button } from '../Button';
import { AlertDialog } from '../AlertDialog';
import { Modal } from '../Modal';
import { Form, FormField, FormActions, FieldSuccess } from '../Form';
import { api, newPasswordPolicyMessage } from '../../services/api';
import { toast } from 'sonner';

// Logo local - using favicon from public folder
const LOGO_URL = '/favicon/apple-touch-icon.png';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  imagen: string;
  descripcion: string;
}

interface UserData {
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  telefono?: string;
  direccion?: string;
}

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onNavigateToNosotros: () => void;
  user?: UserData;
  onLogout?: () => void;
}

// Imágenes para el carrusel
const imagenesCarrusel = [
  {
    url: 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=1200&h=500&fit=crop',
    titulo: 'Licores Premium',
    subtitulo: 'La mejor selección de bebidas en Medellín'
  },
  {
    url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1200&h=500&fit=crop',
    titulo: 'Rones Añejos',
    subtitulo: 'Calidad y tradición en cada botella'
  },
  {
    url: 'https://images.unsplash.com/photo-1527281400986-0cc1d2c1e1af?w=1200&h=500&fit=crop',
    titulo: 'Whiskies Importados',
    subtitulo: 'Experiencias únicas para paladares exigentes'
  },
  {
    url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&h=500&fit=crop',
    titulo: 'Vinos Selectos',
    subtitulo: 'De las mejores bodegas del mundo'
  }
];

export function LandingPage({ onNavigateToLogin, onNavigateToRegister, onNavigateToNosotros, user, onLogout }: LandingPageProps) {
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isCarritoOpen, setIsCarritoOpen] = useState(false);
  const [carrito, setCarrito] = useState<{ producto: Producto; cantidad: number }[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [indiceCarrusel, setIndiceCarrusel] = useState(0);
  const [categoriasExpanded, setCategoriasExpanded] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showMisPedidos, setShowMisPedidos] = useState(false);
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [porcentajePago, setPorcentajePago] = useState<'100' | '50'>('100');
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [checkoutData, setCheckoutData] = useState({
    direccion: '',
    telefono: '',
    observaciones: '',
  });
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>('Todos');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [currentPwdOk, setCurrentPwdOk] = useState<boolean | null>(null);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'info' as 'warning' | 'info' | 'success' | 'danger',
    onConfirm: () => {}
  });

  // Estados para productos y categorías de la API
  const [productosAPI, setProductosAPI] = useState<any[]>([]);
  const [categoriasAPI, setCategoriasAPI] = useState<any[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(true);

  // Verificacion de mayoria de edad
  const [mostrarVerificacionEdad, setMostrarVerificacionEdad] = useState(false);
  const [accesoBloqueadoPorEdad, setAccesoBloqueadoPorEdad] = useState(false);

  useEffect(() => {
    try {
      const yaConfirmado = window.sessionStorage.getItem('grandmas_mayor_edad') === '1';
      if (yaConfirmado) return;
    } catch {
      // Ignorar errores de acceso a sessionStorage (modo incognito, etc.)
    }
    const t = window.setTimeout(() => setMostrarVerificacionEdad(true), 2000);
    return () => window.clearTimeout(t);
  }, []);

  const handleConfirmarMayorEdad = () => {
    try {
      window.sessionStorage.setItem('grandmas_mayor_edad', '1');
    } catch {
      // Ignorar errores de acceso a sessionStorage
    }
    setMostrarVerificacionEdad(false);
    setAccesoBloqueadoPorEdad(false);
  };

  const handleRechazarMayorEdad = () => {
    setAccesoBloqueadoPorEdad(true);
  };

  // Catálogo público (sin login) — GET /api/public/catalogo
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const { productos, categorias } = await api.public.getCatalogo();
        setProductosAPI(Array.isArray(productos) ? productos : []);
        setCategoriasAPI(Array.isArray(categorias) ? categorias : []);
      } catch (error) {
        console.error('Error cargando catálogo público:', error);
      } finally {
        setLoadingProductos(false);
      }
    };
    cargarDatos();
  }, []);

  useEffect(() => {
    if (!user) {
      setPedidos([]);
      return;
    }
    api.pedidos
      .getAllWithDetails()
      .then((rows) => setPedidos(Array.isArray(rows) ? rows : []))
      .catch(() => setPedidos([]));
  }, [user]);

  useEffect(() => {
    const pwd = passwordData.currentPassword.trim();
    if (!pwd || !user) {
      setCurrentPwdOk(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      api.auth
        .verifyCurrentPassword(pwd)
        .then((ok) => {
          if (!cancelled) setCurrentPwdOk(ok);
        })
        .catch(() => {
          if (!cancelled) setCurrentPwdOk(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [passwordData.currentPassword, user]);

  const imagenProductoFallback =
    'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=400&h=400&fit=crop';

  // Convertir catálogo público al formato de la landing
  const productosFromAPI: Producto[] = productosAPI.map((p: {
    id: number;
    nombre?: string;
    descripcion?: string;
    precio?: number;
    imagen_url?: string;
    categoria?: string;
  }) => {
    const imagenUrl = String(p.imagen_url || '').trim();
    return {
      id: String(p.id),
      nombre: p.nombre || '',
      categoria: p.categoria || 'Sin categoría',
      precio: Number(p.precio ?? 0),
      imagen: imagenUrl || imagenProductoFallback,
      descripcion: p.descripcion || '',
    };
  });

  const todosLosProductos = productosFromAPI;
  const categorias = [
    'Todos',
    ...categoriasAPI.map((c: { nombre?: string }) => c.nombre).filter(Boolean),
  ];

  // Auto-avance del carrusel
  React.useEffect(() => {
    const intervalo = setInterval(() => {
      setIndiceCarrusel((prev) => (prev + 1) % imagenesCarrusel.length);
    }, 5000);
    return () => clearInterval(intervalo);
  }, []);

  // Agregar al carrito
  const agregarAlCarrito = (producto: Producto) => {
    const itemExistente = carrito.find(item => item.producto.id === producto.id);

    if (itemExistente) {
      setCarrito(carrito.map(item =>
        item.producto.id === producto.id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item
      ));
    } else {
      setCarrito([...carrito, { producto, cantidad: 1 }]);
    }
  };

  // Incrementar cantidad
  const incrementarCantidad = (productoId: string) => {
    setCarrito(carrito.map(item =>
      item.producto.id === productoId
        ? { ...item, cantidad: item.cantidad + 1 }
        : item
    ));
  };

  // Decrementar cantidad
  const decrementarCantidad = (productoId: string) => {
    setCarrito(carrito.map(item =>
      item.producto.id === productoId
        ? { ...item, cantidad: Math.max(1, item.cantidad - 1) }
        : item
    ));
  };

  // Eliminar del carrito
  const eliminarDelCarrito = (productoId: string) => {
    setCarrito(carrito.filter(item => item.producto.id !== productoId));
  };

  // Calcular total del carrito
  const totalCarrito = carrito.reduce((total, item) => total + (item.producto.precio * item.cantidad), 0);
  const cantidadItemsCarrito = carrito.reduce((total, item) => total + item.cantidad, 0);

  // Realizar pedido
  const realizarPedido = () => {
    if (carrito.length === 0) {
      setAlertState({
        isOpen: true,
        title: 'Carrito vacío',
        description: 'Agrega productos al carrito para realizar un pedido',
        type: 'warning',
        onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    if (!user) {
      setAlertState({
        isOpen: true,
        title: 'Inicia sesión',
        description: 'Debes iniciar sesión o registrarte para realizar un pedido',
        type: 'info',
        onConfirm: () => {
          setAlertState(prev => ({ ...prev, isOpen: false }));
          setIsCarritoOpen(false);
          onNavigateToLogin();
        }
      });
      return;
    }

    // Si hay usuario, mostrar checkout
    setIsCarritoOpen(false);
    setShowCheckout(true);
  };

  // Filtrar productos por búsqueda y categoría
  const productosFiltrados = todosLosProductos.filter(p => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.categoria.toLowerCase().includes(busqueda.toLowerCase());
    const matchCategoria = categoriaSeleccionada === 'Todos' || p.categoria === categoriaSeleccionada;
    return matchBusqueda && matchCategoria;
  });

  // Función para cambiar categoría y desplazar a productos
  const handleCategoriaClick = (categoria: string) => {
    setCategoriaSeleccionada(categoria);
    setIsSideMenuOpen(false);
    // Desplazar a la sección de productos
    setTimeout(() => {
      const productosSection = document.getElementById('productos');
      if (productosSection) {
        productosSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Función para manejar cambio de contraseña
  const newPwdErr = newPasswordPolicyMessage(passwordData.newPassword);
  const confirmErr =
    passwordData.confirmPassword.trim() && passwordData.newPassword !== passwordData.confirmPassword
      ? 'Las contraseñas nuevas no coinciden.'
      : '';
  const currentErr =
    passwordData.currentPassword.trim() && currentPwdOk === false ? 'La contraseña actual no es correcta.' : '';

  const passwordSubmitDisabled =
    !!newPwdErr ||
    !!confirmErr ||
    !!currentErr ||
    currentPwdOk !== true ||
    !passwordData.currentPassword.trim() ||
    !passwordData.newPassword.trim() ||
    !passwordData.confirmPassword.trim();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordSubmitDisabled) return;

    try {
      await api.auth.changePassword(
        passwordData.currentPassword,
        passwordData.newPassword,
        passwordData.confirmPassword
      );
      toast.success('Contraseña actualizada');
      setIsChangePasswordOpen(false);
      setIsProfileOpen(true);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setCurrentPwdOk(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña';
      toast.error(msg);
    }
  };

  const handleLogoutClick = () => {
    setIsLogoutDialogOpen(true);
  };

  const handleConfirmLogout = () => {
    setIsLogoutDialogOpen(false);
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <div className="min-h-screen h-screen overflow-y-auto bg-background main-content-scroll">
      {/* Navbar */}
      <nav className="bg-primary text-white sticky top-0 z-40 shadow-lg flex-shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Menú hamburguesa y barra de búsqueda */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={() => setIsSideMenuOpen(!isSideMenuOpen)}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {/* Barra de búsqueda con hover - Desktop */}
              <div className="hidden md:block group">
                <div className="relative">
                  <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <Search className="w-5 h-5 text-white" />
                  </button>
                  <div className="absolute left-0 top-0 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar licores..."
                        className="w-48 lg:w-64 px-4 py-2 pl-10 rounded-lg bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-sm"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Logo centrado */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                <img
                  src={LOGO_URL}
                  alt="Grandma's Liqueurs Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="hidden sm:block">
                <h2 className="text-white text-sm md:text-base lg:text-lg">Grandma's Liqueurs</h2>
                <p className="text-xs text-white/80">Licores Premium</p>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {user ? (
                <>
                  {/* Usuario autenticado - Botón de perfil */}
                  <button
                    onClick={() => setIsProfileOpen(true)}
                    className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300"
                    title="Mi perfil"
                  >
                    <User className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="text-xs sm:text-sm truncate max-w-[80px] md:max-w-none">{user.nombre}</span>
                  </button>

                  {/* Botón Cerrar Sesión */}
                  <button
                    onClick={handleLogoutClick}
                    className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 group overflow-hidden"
                  >
                    <LogOut className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="max-w-0 group-hover:max-w-xs overflow-hidden transition-all duration-300 whitespace-nowrap text-xs sm:text-sm">
                      Cerrar Sesión
                    </span>
                  </button>
                </>
              ) : (
                <>
                  {/* Botón Iniciar Sesión - Solo icono con hover */}
                  <button
                    onClick={onNavigateToLogin}
                    className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 group overflow-hidden"
                  >
                    <User className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="max-w-0 group-hover:max-w-xs overflow-hidden transition-all duration-300 whitespace-nowrap text-xs sm:text-sm">
                      Iniciar Sesión
                    </span>
                  </button>

                  {/* Botón Registrarse - Icono de hoja con lápiz */}
                  <button
                    onClick={onNavigateToRegister}
                    className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 group overflow-hidden"
                  >
                    <FileEdit className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="max-w-0 group-hover:max-w-xs overflow-hidden transition-all duration-300 whitespace-nowrap text-xs sm:text-sm">
                      Registrarse
                    </span>
                  </button>
                </>
              )}

              {/* Carrito */}
              <button
                onClick={() => setIsCarritoOpen(true)}
                className="relative p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
                {cantidadItemsCarrito > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-white text-primary text-xs rounded-full flex items-center justify-center font-medium">
                    {cantidadItemsCarrito}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Barra de búsqueda móvil */}
          <div className="md:hidden pb-2 sm:pb-3">
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar licores..."
                className="w-full px-3 sm:px-4 py-1.5 sm:py-2 pl-9 sm:pl-10 rounded-lg bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm"
              />
              <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-white/60" />
            </div>
          </div>
        </div>
      </nav>

      {/* Menú lateral desplegable */}
      {isSideMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsSideMenuOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full w-64 sm:w-72 md:w-80 bg-primary text-white z-50 shadow-xl overflow-y-auto sidebar-menu-scroll">
            <div className="p-6">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                    <img
                      src={LOGO_URL}
                      alt="Grandma's Liqueurs Logo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="text-white">Menú</h3>
                </div>
                <button
                  onClick={() => setIsSideMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <nav className="space-y-2">
                <a href="#inicio" className="block px-4 py-3 rounded-lg hover:bg-white/10 transition-colors">
                  Inicio
                </a>
                <a href="#productos" className="block px-4 py-3 rounded-lg hover:bg-white/10 transition-colors">
                  Productos
                </a>

                {/* Categorías expandibles */}
                <div>
                  <button
                    onClick={() => setCategoriasExpanded(!categoriasExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <span>Categorías</span>
                    <svg
                      className={`w-5 h-5 transition-transform ${categoriasExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Subcategorías */}
                  {categoriasExpanded && (
                    <div className="ml-4 mt-2 space-y-1">
                      <button
                        onClick={() => handleCategoriaClick('Todos')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Todos' ? 'bg-white/20' : ''}`}
                      >
                        Todas las categorías
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Whiskies')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Whiskies' ? 'bg-white/20' : ''}`}
                      >
                        Whiskies
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Rones')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Rones' ? 'bg-white/20' : ''}`}
                      >
                        Rones
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Vinos')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Vinos' ? 'bg-white/20' : ''}`}
                      >
                        Vinos
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Cervezas')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Cervezas' ? 'bg-white/20' : ''}`}
                      >
                        Cervezas
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Tequilas')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Tequilas' ? 'bg-white/20' : ''}`}
                      >
                        Tequilas
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Vodkas')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Vodkas' ? 'bg-white/20' : ''}`}
                      >
                        Vodkas
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Ginebras')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Ginebras' ? 'bg-white/20' : ''}`}
                      >
                        Ginebras
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Aguardientes')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Aguardientes' ? 'bg-white/20' : ''}`}
                      >
                        Aguardientes
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Cócteles')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Cócteles' ? 'bg-white/20' : ''}`}
                      >
                        Cócteles
                      </button>
                      <button
                        onClick={() => handleCategoriaClick('Bebidas Personalizadas')}
                        className={`block w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm ${categoriaSeleccionada === 'Bebidas Personalizadas' ? 'bg-white/20' : ''}`}
                      >
                        Bebidas Personalizadas
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/20 my-4"></div>

                {/* Opciones de usuario - Solo visible si el usuario está autenticado */}
                {user && (
                  <>
                    <button
                      onClick={() => {
                        setIsSideMenuOpen(false);
                        setIsProfileOpen(true);
                      }}
                      className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <User className="w-5 h-5" />
                      Mi Perfil
                    </button>
                    <button
                      onClick={() => {
                        setIsSideMenuOpen(false);
                        setShowMisPedidos(true);
                      }}
                      className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <ShoppingBag className="w-5 h-5" />
                      Mis Pedidos
                    </button>
                  </>
                )}

                <a
                  href="#contacto"
                  onClick={() => setIsSideMenuOpen(false)}
                  className="block px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Contacto
                </a>
                <button
                  onClick={() => {
                    setIsSideMenuOpen(false);
                    onNavigateToNosotros();
                  }}
                  className="block w-full text-left px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Nosotros
                </button>

                {/* Botones móviles */}
                <div className="pt-4 space-y-2 sm:hidden">
                  {user ? (
                    <>
                      <button
                        onClick={() => {
                          setIsSideMenuOpen(false);
                          setShowMisPedidos(true);
                        }}
                        className="w-full px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-left"
                      >
                        Mis Pedidos
                      </button>
                      <div className="px-4 py-3 rounded-lg bg-white/10">
                        <p className="text-sm">
                          {user.nombre} {user.apellido}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setIsSideMenuOpen(false);
                          handleLogoutClick();
                        }}
                        className="w-full px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-left"
                      >
                        Cerrar Sesión
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setIsSideMenuOpen(false);
                          onNavigateToLogin();
                        }}
                        className="w-full px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-left"
                      >
                        Iniciar Sesión
                      </button>
                      <button
                        onClick={() => {
                          setIsSideMenuOpen(false);
                          onNavigateToRegister();
                        }}
                        className="w-full px-4 py-3 rounded-lg bg-white text-primary hover:bg-white/90 transition-colors text-left"
                      >
                        Registrarse
                      </button>
                    </>
                  )}
                </div>
              </nav>
            </div>
          </div>
        </>
      )}

      {/* Panel del Carrito - Lateral derecho */}
      {isCarritoOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsCarritoOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white z-50 shadow-2xl overflow-y-auto main-content-scroll">
            <div className="sticky top-0 bg-primary text-white p-6 shadow-md z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-6 h-6" />
                  <h3 className="text-white">Mi Carrito</h3>
                </div>
                <button
                  onClick={() => setIsCarritoOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
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
                  <Button
                    onClick={() => setIsCarritoOpen(false)}
                    className="bg-primary text-white"
                  >
                    Explorar Productos
                  </Button>
                </div>
              ) : (
                <>
                  {/* Lista de productos */}
                  <div className="space-y-4 mb-6">
                    {carrito.map((item) => (
                      <div
                        key={item.producto.id}
                        className="flex gap-4 p-4 bg-background rounded-lg border border-border"
                      >
                        <img
                          src={item.producto.imagen}
                          alt={item.producto.nombre}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <h4 className="text-sm mb-1 line-clamp-1">{item.producto.nombre}</h4>
                          <p className="text-xs text-muted-foreground mb-2">
                            {item.producto.categoria}
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-primary">
                              ${item.producto.precio.toLocaleString('es-CO')}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => decrementarCantidad(item.producto.id)}
                                className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="w-8 text-center">{item.cantidad}</span>
                              <button
                                onClick={() => incrementarCantidad(item.producto.id)}
                                className="w-7 h-7 rounded-full bg-primary hover:bg-primary/90 text-white flex items-center justify-center transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => eliminarDelCarrito(item.producto.id)}
                          className="p-2 h-fit rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Resumen y total */}
                  <div className="border-t border-border pt-4 mb-6">
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${totalCarrito.toLocaleString('es-CO')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Domicilio</span>
                        <span className="text-primary">A calcular</span>
                      </div>
                    </div>
                    <div className="flex justify-between border-t border-border pt-4">
                      <span>Total</span>
                      <span className="text-primary">
                        ${totalCarrito.toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>

                  {/* Botón realizar pedido */}
                  <Button
                    onClick={realizarPedido}
                    className="w-full bg-primary text-white py-3"
                    icon={<ShoppingBag className="w-5 h-5" />}
                  >
                    Realizar Pedido
                  </Button>

                  <p className="text-xs text-center text-muted-foreground mt-4">
                    Inicia sesión para completar tu compra
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Carrusel de imágenes */}
      <section id="inicio" className="relative h-[250px] sm:h-[350px] md:h-[400px] lg:h-[500px] overflow-hidden">
        <div className="relative h-full">
          {imagenesCarrusel.map((imagen, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === indiceCarrusel ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={imagen.url}
                alt={imagen.titulo}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/30 flex items-center">
                <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 text-white">
                  <h1 className="text-white mb-2 sm:mb-3 md:mb-4 text-xl sm:text-2xl md:text-3xl lg:text-4xl">{imagen.titulo}</h1>
                  <p className="text-sm sm:text-base md:text-xl lg:text-2xl text-white/90 max-w-2xl">{imagen.subtitulo}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Indicadores */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {imagenesCarrusel.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-all ${
                index === indiceCarrusel ? 'bg-white w-8' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      </section>

      {/* Productos destacados */}
      <section id="productos" className="py-8 sm:py-12 md:py-16 bg-background">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-primary mb-3 sm:mb-4 text-xl sm:text-2xl md:text-3xl">Productos Destacados</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-4 sm:mb-6 text-sm sm:text-base px-4">
              Descubre nuestra selección premium de licores y bebidas de la más alta calidad
            </p>
            {categoriaSeleccionada !== 'Todos' && (
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 text-primary rounded-lg">
                <span className="text-xs sm:text-sm">Mostrando: <strong>{categoriaSeleccionada}</strong></span>
                <button
                  onClick={() => setCategoriaSeleccionada('Todos')}
                  className="ml-2 p-1 hover:bg-primary/20 rounded"
                  title="Ver todos los productos"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {productosFiltrados.map((producto) => (
              <div
                key={producto.id}
                className="bg-card rounded-lg shadow-md hover:shadow-xl transition-shadow overflow-hidden group"
              >
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
                      ${producto.precio.toLocaleString('es-CO')}
                    </span>
                    <Button
                      onClick={() => agregarAlCarrito(producto)}
                      size="sm"
                      className="w-full text-[10px] sm:text-xs py-1 sm:py-1.5"
                      icon={<ShoppingCart className="w-3 h-3" />}
                    >
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {productosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No se encontraron productos que coincidan con tu búsqueda</p>
            </div>
          )}

          <div className="text-center mt-12">
            <Button
              onClick={user ? () => {} : onNavigateToRegister}
              size="lg"
              className="bg-primary text-white"
            >
              Ver Todos los Productos
            </Button>
          </div>
        </div>
      </section>

      {/* Sección de Contacto */}
      <section id="contacto" className="py-8 sm:py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <h2 className="text-primary mb-3 sm:mb-4 text-xl sm:text-2xl md:text-3xl">Contáctanos</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base px-4">
              ¿Tienes alguna pregunta? Estamos aquí para ayudarte
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Información de contacto */}
            <div className="space-y-6 mb-12">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center text-center p-6 bg-background rounded-lg hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <MapPin className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="mb-2">Dirección</h4>
                  <p className="text-sm text-muted-foreground">
                    Calle 104 # 79D – 65<br/>
                    Medellín, Laureles<br/>
                    Antioquia, Colombia
                  </p>
                </div>

                <div className="flex flex-col items-center text-center p-6 bg-background rounded-lg hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Phone className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="mb-2">Teléfono</h4>
                  <p className="text-sm text-muted-foreground">
                    324 610 2339<br/>
                    Lunes a Sábado: 9:00 AM - 8:00 PM<br/>
                    Domingos: 10:00 AM - 6:00 PM
                  </p>
                </div>

                <div className="flex flex-col items-center text-center p-6 bg-background rounded-lg hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Mail className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="mb-2">Email</h4>
                  <p className="text-sm text-muted-foreground">
                    info@grandmasliqueurs.com<br/>
                    ventas@grandmasliqueurs.com
                  </p>
                </div>
              </div>
            </div>

            {/* Redes sociales */}
            <div className="text-center">
              <h4 className="mb-6">Síguenos en Redes Sociales</h4>
              <div className="flex gap-4 justify-center">
                <a href="#" className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors text-white shadow-lg hover:shadow-xl">
                  <Facebook className="w-6 h-6" />
                </a>
                <a href="#" className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors text-white shadow-lg hover:shadow-xl">
                  <Instagram className="w-6 h-6" />
                </a>
                <a href="#" className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors text-white shadow-lg hover:shadow-xl">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-white pt-8 sm:pt-12 md:pt-16 pb-6 sm:pb-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
            {/* Información de la empresa */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                  <img
                    src={LOGO_URL}
                    alt="Grandma's Liqueurs Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-white">Grandma's Liqueurs</h3>
                  <p className="text-sm text-white/80">Licores Premium desde 2015</p>
                </div>
              </div>
              <p className="text-white/80 mb-4">
                Somos una empresa dedicada a la comercialización de licores premium en Medellín.
                Contamos con 12 colaboradores comprometidos con ofrecer productos de la más alta calidad
                y un servicio excepcional.
              </p>
            </div>

            {/* Enlaces rápidos */}
            <div>
              <h4 className="text-white mb-4">Enlaces Rápidos</h4>
              <ul className="space-y-2 text-white/80">
                <li><a href="#inicio" className="hover:text-white transition-colors">Inicio</a></li>
                <li><a href="#productos" className="hover:text-white transition-colors">Productos</a></li>
                <li>
                  <button 
                    onClick={() => {
                      setCategoriaSeleccionada('Todos');
                      setTimeout(() => {
                        const productosSection = document.getElementById('productos');
                        if (productosSection) {
                          productosSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 100);
                    }} 
                    className="hover:text-white transition-colors"
                  >
                    Categorías
                  </button>
                </li>
                <li><button onClick={onNavigateToNosotros} className="hover:text-white transition-colors">Nosotros</button></li>
                <li><a href="#contacto" className="hover:text-white transition-colors">Contacto</a></li>
              </ul>
            </div>

            {/* Contacto */}
            <div>
              <h4 className="text-white mb-4">Contacto</h4>
              <ul className="space-y-3 text-white/80">
                <li className="flex items-start gap-2">
                  <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>Calle 104 # 79D – 65<br/>Medellín, Laureles</span>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-5 h-5 flex-shrink-0" />
                  <span>324 610 2339</span>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-5 h-5 flex-shrink-0" />
                  <span>info@grandmasliqueurs.com</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Redes sociales */}
          <div className="border-t border-white/20 pt-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-white/80 text-sm">
                © 2026 Grandma's Liqueurs. Todos los derechos reservados.
              </p>

              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Instagram className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal de Checkout */}
      {showCheckout && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowCheckout(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto main-content-scroll">
              <div className="sticky top-0 bg-primary text-white p-4 sm:p-6 rounded-t-xl sm:rounded-t-2xl flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-white text-base sm:text-lg md:text-xl">Finalizar Pedido</h3>
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {/* Resumen del pedido */}
                <div className="mb-6">
                  <h4 className="mb-4">Resumen del Pedido</h4>
                  <div className="space-y-2 bg-background p-4 rounded-lg">
                    {carrito.map((item) => (
                      <div key={item.producto.id} className="flex justify-between text-sm">
                        <span>
                          {item.producto.nombre} x{item.cantidad}
                        </span>
                        <span className="text-primary">
                          ${(item.producto.precio * item.cantidad).toLocaleString('es-CO')}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-2 mt-2">
                      <div className="flex justify-between">
                        <span>Total</span>
                        <span className="text-primary">
                          ${totalCarrito.toLocaleString('es-CO')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Métodos de pago */}
                <div className="mb-6">
                  <h4 className="mb-4">Método de Pago</h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="payment"
                        className="w-4 h-4 text-primary"
                        checked={metodoPago === 'efectivo'}
                        onChange={() => setMetodoPago('efectivo')}
                      />
                      <div>
                        <p>Efectivo</p>
                        <p className="text-xs text-muted-foreground">Pago al recibir tu pedido</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="payment"
                        className="w-4 h-4 text-primary"
                        checked={metodoPago === 'transferencia'}
                        onChange={() => setMetodoPago('transferencia')}
                      />
                      <div>
                        <p>Transferencia Bancaria</p>
                        <p className="text-xs text-muted-foreground">Te enviaremos los datos por WhatsApp</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Porcentaje de pago */}
                <div className="mb-6">
                  <h4 className="mb-4">Forma de Pago</h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="percentage"
                        className="w-4 h-4 text-primary"
                        checked={porcentajePago === '100'}
                        onChange={() => setPorcentajePago('100')}
                      />
                      <div className="flex-1">
                        <p>Pago Total (100%)</p>
                        <p className="text-xs text-muted-foreground">
                          ${totalCarrito.toLocaleString('es-CO')}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="percentage"
                        className="w-4 h-4 text-primary"
                        checked={porcentajePago === '50'}
                        onChange={() => setPorcentajePago('50')}
                      />
                      <div className="flex-1">
                        <p>Abono Mínimo (50%)</p>
                        <p className="text-xs text-muted-foreground">
                          ${(totalCarrito * 0.5).toLocaleString('es-CO')} (Saldo: ${(totalCarrito * 0.5).toLocaleString('es-CO')})
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Información de entrega */}
                <div className="mb-6">
                  <h4 className="mb-4">Información de Entrega</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block mb-2 text-sm">Dirección de entrega</label>
                      <input
                        type="text"
                        value={checkoutData.direccion}
                        onChange={(e) => setCheckoutData((prev) => ({ ...prev, direccion: e.target.value }))}
                        placeholder="Calle 104 # 79D - 65"
                        className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 text-sm">Teléfono de contacto</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={checkoutData.telefono}
                        onChange={(e) =>
                          setCheckoutData((prev) => ({
                            ...prev,
                            telefono: e.target.value.replace(/\D/g, '').slice(0, 10),
                          }))
                        }
                        placeholder="3246102339"
                        className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 text-sm">Observaciones (Opcional)</label>
                      <textarea
                        rows={3}
                        value={checkoutData.observaciones}
                        onChange={(e) => setCheckoutData((prev) => ({ ...prev, observaciones: e.target.value }))}
                        placeholder="Instrucciones especiales para la entrega..."
                        className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      ></textarea>
                    </div>
                  </div>
                </div>

                {/* Botones */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowCheckout(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        if (!checkoutData.direccion.trim()) {
                          throw new Error('La dirección de entrega es obligatoria');
                        }
                        if (!checkoutData.telefono.trim()) {
                          throw new Error('El teléfono de contacto es obligatorio');
                        }
                        const telDigitsCheckout = checkoutData.telefono.replace(/\D/g, '');
                        if (telDigitsCheckout.length !== 10) {
                          throw new Error('El teléfono de contacto debe tener exactamente 10 dígitos');
                        }

                        await api.pedidos.create({
                          clienteId: undefined,
                          fechaPedido: new Date().toISOString().split('T')[0],
                          fechaEntrega: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                          metodoPago,
                          porcentajeAbono: porcentajePago === '50' ? 50 : 100,
                          total: totalCarrito,
                          direccion: checkoutData.direccion.trim(),
                          telefono: telDigitsCheckout,
                          productos: carrito.map((item) => ({
                            productoId: Number(item.producto.id),
                            cantidad: item.cantidad,
                            precio: item.producto.precio,
                            subtotal: item.producto.precio * item.cantidad,
                          })),
                        } as any);

                        const pedidosActualizados = await api.pedidos.getAllWithDetails();
                        setPedidos(Array.isArray(pedidosActualizados) ? pedidosActualizados : []);

                        setAlertState({
                          isOpen: true,
                          title: 'Pedido Confirmado',
                          description: `¡Gracias por tu compra, ${user?.nombre}! Tu pedido ha sido registrado exitosamente.`,
                          type: 'success',
                          onConfirm: () => {
                            setAlertState(prev => ({ ...prev, isOpen: false }));
                            setShowCheckout(false);
                            setCarrito([]);
                            setMetodoPago('efectivo');
                            setPorcentajePago('100');
                            setCheckoutData({ direccion: '', telefono: '', observaciones: '' });
                          }
                        });
                      } catch (error: any) {
                        setAlertState({
                          isOpen: true,
                          title: 'Error al crear pedido',
                          description: error.message || 'No se pudo registrar el pedido',
                          type: 'danger',
                          onConfirm: () => setAlertState(prev => ({ ...prev, isOpen: false })),
                        });
                      }
                    }}
                    className="flex-1 bg-primary text-white"
                  >
                    Confirmar Pedido
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Mis Pedidos */}
      {showMisPedidos && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowMisPedidos(false)}
          />
          <div className="fixed right-0 top-0 h-full w-full sm:w-[450px] md:w-[500px] bg-white z-50 shadow-2xl overflow-y-auto main-content-scroll">
            <div className="sticky top-0 bg-primary text-white p-4 sm:p-6 shadow-md z-10 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
                  <h3 className="text-white text-base sm:text-lg">Mis Pedidos</h3>
                </div>
                <button
                  onClick={() => setShowMisPedidos(false)}
                  className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
              {pedidos.length > 0 && (
                <p className="text-xs sm:text-sm text-white/80 mt-2">
                  {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}
                </p>
              )}
            </div>

            <div className="p-4 sm:p-6">
              {pedidos.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
                  <p className="text-muted-foreground mb-2">No tienes pedidos aún</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Realiza tu primera compra y aparecerá aquí
                  </p>
                  <Button
                    onClick={() => setShowMisPedidos(false)}
                    className="bg-primary text-white"
                  >
                    Explorar Productos
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {pedidos.map((pedido: any) => (
                    <div
                      key={pedido.id}
                      className="bg-background rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-sm mb-1">Pedido #{pedido.id}</h4>
                          <p className="text-xs text-muted-foreground">
                            {new Date(pedido.fechaPedido || pedido.fecha || '').toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs ${
                          String(pedido.estado).toLowerCase().includes('pend') ? 'bg-yellow-100 text-yellow-800' :
                          String(pedido.estado).toLowerCase().includes('complet') ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {pedido.estado}
                        </span>
                      </div>

                      <div className="space-y-2 mb-3">
                        {(pedido.productos || []).map((item: any, idx: number) => (
                          <div key={`${pedido.id}-${idx}`} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {item.nombre || item.producto?.nombre || `Producto #${item.productoId || 'N/A'}`} x{item.cantidad || 0}
                            </span>
                            <span>
                              ${((item.producto?.precio || item.precio || 0) * (item.cantidad || 0)).toLocaleString('es-CO')}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-border pt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Método de pago</span>
                          <span>{pedido.metodoPago || 'Efectivo'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Monto pagado</span>
                          <span className="text-primary">
                            ${Number(pedido.montoAbonado ?? pedido.montoPagado ?? pedido.total ?? 0).toLocaleString('es-CO')}
                          </span>
                        </div>
                        {Number(pedido.saldo || 0) > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Saldo pendiente</span>
                            <span className="text-destructive">
                              ${Number(pedido.saldo || 0).toLocaleString('es-CO')}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-border pt-2">
                          <span>Total</span>
                          <span className="text-primary">
                            ${pedido.total.toLocaleString('es-CO')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal de Perfil */}
      <Modal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        title="Mi Perfil"
        size="lg"
      >
        <div className="space-y-6">
          {/* Información del usuario */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary/10 rounded-lg">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3>Información Personal</h3>
                <p className="text-sm text-muted-foreground">Datos de tu cuenta</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-background p-6 rounded-lg">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Nombre completo</p>
                  <p className="text-sm">{user?.nombre} {user?.apellido}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Correo electrónico</p>
                  <p className="text-sm">{user?.email}</p>
                </div>
              </div>

              {user?.tipoDocumento && user?.numeroDocumento && (
                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Documento</p>
                    <p className="text-sm">{user.tipoDocumento} {user.numeroDocumento}</p>
                  </div>
                </div>
              )}

              {user?.telefono && (
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Teléfono</p>
                    <p className="text-sm">{user.telefono}</p>
                  </div>
                </div>
              )}

              {user?.direccion && (
                <div className="flex items-start gap-3 md:col-span-2">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Dirección</p>
                    <p className="text-sm">{user.direccion}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Rol</p>
                  <p className="text-sm">{user?.rol}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Botón de cambiar contraseña */}
          <div className="border-t border-border pt-6">
            <Button
              onClick={() => {
                setIsProfileOpen(false);
                setIsChangePasswordOpen(true);
              }}
              variant="outline"
              className="w-full"
              icon={<KeyRound className="w-5 h-5" />}
            >
              Cambiar Contraseña
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Cambiar Contraseña */}
      <Modal
        isOpen={isChangePasswordOpen}
        onClose={() => {
          setIsChangePasswordOpen(false);
          setIsProfileOpen(true);
          setPasswordData({
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          });
          setCurrentPwdOk(null);
        }}
        title="Cambiar Contraseña"
        size="md"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary/10 rounded-lg">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Ingresa tu contraseña actual y la nueva contraseña
            </p>
          </div>
        </div>

        <Form onSubmit={handleChangePassword}>
          <FormField
            label="Contraseña Actual"
            name="currentPassword"
            type="password"
            value={passwordData.currentPassword}
            onChange={(value) => setPasswordData({ ...passwordData, currentPassword: value as string })}
            placeholder="••••••••"
            required
            error={currentErr}
          />
          {passwordData.currentPassword.trim() && currentPwdOk === true ? (
            <FieldSuccess>Contraseña actual verificada.</FieldSuccess>
          ) : null}

          <FormField
            label="Nueva Contraseña"
            name="newPassword"
            type="password"
            value={passwordData.newPassword}
            onChange={(value) => setPasswordData({ ...passwordData, newPassword: value as string })}
            placeholder="••••••••"
            required
            error={passwordData.newPassword.trim() ? newPwdErr || undefined : undefined}
          />

          <FormField
            label="Confirmar Nueva Contraseña"
            name="confirmPassword"
            type="password"
            value={passwordData.confirmPassword}
            onChange={(value) => setPasswordData({ ...passwordData, confirmPassword: value as string })}
            placeholder="••••••••"
            required
            error={confirmErr || undefined}
          />

          <div className="p-4 bg-accent rounded-lg mb-4">
            <p className="text-xs text-muted-foreground">
              <strong>Nota:</strong> Mínimo 8 caracteres, una mayúscula, una minúscula y un número.
            </p>
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => {
              setIsChangePasswordOpen(false);
              setIsProfileOpen(true);
              setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
              });
              setCurrentPwdOk(null);
            }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={passwordSubmitDisabled} icon={<KeyRound className="w-5 h-5" />}>
              Cambiar Contraseña
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* AlertDialog */}
      <AlertDialog
        isOpen={alertState.isOpen}
        onClose={() => setAlertState({ ...alertState, isOpen: false })}
        onConfirm={alertState.onConfirm}
        title={alertState.title}
        description={alertState.description}
        type={alertState.type}
        confirmText="Aceptar"
        cancelText="Cerrar"
      />

      {/* Verificacion de mayoria de edad */}
      {mostrarVerificacionEdad && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verificacion-edad-titulo"
          >
            <div className="bg-primary text-white px-6 py-5 flex flex-col items-center text-center gap-2">
              <img src={LOGO_URL} alt="Grandma's Liquors" className="w-14 h-14 rounded-full bg-white/10 p-1" />
              <h2 id="verificacion-edad-titulo" className="text-lg sm:text-xl font-semibold">
                Verificacion de edad
              </h2>
            </div>

            <div className="p-6 text-center space-y-4">
              {!accesoBloqueadoPorEdad ? (
                <>
                  <p className="text-base text-foreground">
                    Confirmo que soy mayor de edad
                  </p>
                  <p className="text-sm text-muted-foreground">
                    El consumo de bebidas alcoholicas es exclusivo para personas mayores de 18 anos. El exceso de alcohol es perjudicial para la salud.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleRechazarMayorEdad}
                    >
                      No
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleConfirmarMayorEdad}
                    >
                      Si
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-base text-foreground font-medium">
                    Acceso restringido
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Lo sentimos, debes ser mayor de edad para ingresar a Grandma's Liquors. Si te equivocaste, puedes confirmar tu mayoria de edad para continuar.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setAccesoBloqueadoPorEdad(false)}
                    >
                      Volver
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleConfirmarMayorEdad}
                    >
                      Soy mayor de edad
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AlertDialog para confirmar cierre de sesión */}
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
