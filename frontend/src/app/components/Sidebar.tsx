import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Users,
  ShoppingCart,
  Package,
  ShoppingBag,
  BarChart3,
  Shield,
  LogIn,
  Building2,
  Boxes,
  Tags,
  Truck,
  Factory,
  UserCircle,
  Receipt,
  CreditCard,
  ClipboardList,
  Settings,
  Store,
  User
} from 'lucide-react';
import { useAuth } from './AuthContext';

// Logo local - using favicon from public folder
const LOGO_URL = '/favicon/apple-touch-icon.png';

interface SubMenuItem {
  name: string;
  icon: React.ReactNode;
  path: string;
  module: string;
}

interface MenuItem {
  name: string;
  icon: React.ReactNode;
  path?: string;
  module?: string;
  subItems?: SubMenuItem[];
  roles?: string[];  // Roles que pueden ver este item
}

const menuItems: MenuItem[] = [
  {
    name: 'Dashboard',
    icon: <BarChart3 className="w-5 h-5" />,
    path: '/dashboard',
    module: 'dashboard',
    roles: ['Administrador', 'Asesor', 'Productor', 'Repartidor']
  },
  {
    name: 'Configuración',
    icon: <Settings className="w-5 h-5" />,
    module: 'configuracion',
    roles: ['Administrador'],
    subItems: [
      { name: 'Gestión de Roles', icon: <Shield className="w-4 h-4" />, path: '/configuracion/roles', module: 'configuracion' }
    ]
  },
  {
    name: 'Usuarios',
    icon: <Users className="w-5 h-5" />,
    module: 'usuarios',
    roles: ['Administrador'],
    subItems: [
      { name: 'Gestión de Usuarios', icon: <Users className="w-4 h-4" />, path: '/usuarios/usuarios', module: 'usuarios' }
    ]
  },
  {
    name: 'Compras',
    icon: <ShoppingCart className="w-5 h-5" />,
    module: 'compras',
    roles: ['Administrador', 'Asesor', 'Productor'],
    subItems: [
      { name: 'Proveedores', icon: <Building2 className="w-4 h-4" />, path: '/compras/proveedores', module: 'compras' },
      { name: 'Compras', icon: <ShoppingCart className="w-4 h-4" />, path: '/compras/compras', module: 'compras' },
      { name: 'Productos', icon: <Package className="w-4 h-4" />, path: '/compras/productos', module: 'compras/productos' },
      { name: 'Categorías de Producto', icon: <Tags className="w-4 h-4" />, path: '/compras/categorias', module: 'compras' }
    ]
  },
  {
    name: 'Producción',
    icon: <Factory className="w-5 h-5" />,
    module: 'produccion',
    roles: ['Administrador', 'Productor'],
    subItems: [
      { name: 'Producción', icon: <Boxes className="w-4 h-4" />, path: '/produccion/produccion', module: 'produccion' },
      { name: 'Entrega de Insumos', icon: <Truck className="w-4 h-4" />, path: '/produccion/entrega-insumos', module: 'produccion' },
      { name: 'Insumos', icon: <Package className="w-4 h-4" />, path: '/produccion/insumos', module: 'produccion' }
    ]
  },
  {
    name: 'Ventas',
    icon: <ShoppingBag className="w-5 h-5" />,
    module: 'ventas',
    roles: ['Administrador', 'Asesor', 'Repartidor'],
    subItems: [
      { name: 'Clientes', icon: <UserCircle className="w-4 h-4" />, path: '/ventas/clientes', module: 'ventas' },
      { name: 'Ventas', icon: <Receipt className="w-4 h-4" />, path: '/ventas/ventas', module: 'ventas' },
      { name: 'Abonos', icon: <CreditCard className="w-4 h-4" />, path: '/ventas/abonos', module: 'ventas' },
      { name: 'Pedidos', icon: <ClipboardList className="w-4 h-4" />, path: '/ventas/pedidos', module: 'ventas/pedidos' },
      { name: 'Domicilios', icon: <Truck className="w-4 h-4" />, path: '/ventas/domicilios', module: 'ventas/domicilios' }
    ]
  },
  // Menú exclusivo para Cliente
  {
    name: 'Tienda',
    icon: <Store className="w-5 h-5" />,
    path: '/cliente/tienda',
    module: 'cliente',
    roles: ['Cliente']
  },
  {
    name: 'Mis Pedidos',
    icon: <ClipboardList className="w-5 h-5" />,
    path: '/cliente/pedidos',
    module: 'cliente',
    roles: ['Cliente']
  },
  {
    name: 'Mi Perfil',
    icon: <User className="w-5 h-5" />,
    path: '/cliente/perfil',
    module: 'cliente',
    roles: ['Cliente']
  }
];

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Sidebar({ currentPath, onNavigate }: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>(['Usuarios', 'Compras', 'Producción', 'Ventas', 'Configuración']);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hasPermission, user } = useAuth();

  const toggleItem = (itemName: string) => {
    setExpandedItems(prev =>
      prev.includes(itemName)
        ? prev.filter(name => name !== itemName)
        : [...prev, itemName]
    );
  };

  // Filtrar los items del menu segun los permisos del usuario.
  //
  // IMPORTANTE: La lista `roles` de cada item solo se usa para SEPARAR
  // estrictamente el menu del Cliente del menu del personal interno. Para los
  // roles personalizados creados desde "Gestion de Roles" (p. ej. "Cajero"),
  // la unica fuente de verdad sobre que ven es `hasPermission(item.module)`,
  // que consulta los permisos asignados al rol en BD. Si filtraramos por
  // `item.roles.includes(user.rol)` excluiriamos a TODOS los roles nuevos
  // (porque nunca estan en los arrays hardcodeados aqui) y veriamos un menu
  // vacio aunque el rol tuviera permisos validos.
  const isClienteOnlyItem = (item: MenuItem) =>
    Array.isArray(item.roles) && item.roles.length === 1 && item.roles[0] === 'Cliente';

  const filteredMenuItems = menuItems
    .map((item) => ({ ...item, subItems: item.subItems ? [...item.subItems] : undefined }))
    .filter((item) => {
      const userIsCliente = user?.rol === 'Cliente';

      // Items exclusivos del Cliente: solo visibles para usuarios con rol "Cliente".
      if (isClienteOnlyItem(item)) {
        if (!userIsCliente) return false;
      } else {
        // Items del personal interno: nunca para Cliente.
        if (userIsCliente) return false;
      }

      // Filtro real por permisos (respeta roles personalizados creados en BD).
      if (item.subItems && item.subItems.length > 0) {
        // Si hay sub-items, filtrarlos por permiso
        item.subItems = item.subItems.filter((subItem) => hasPermission(subItem.module));
        // Si quedan sub-items, mostrar el padre aunque no tenga permiso directo
        return item.subItems.length > 0;
      }

      // Si no hay sub-items, verificar permiso del módulo padre
      if (item.module && !hasPermission(item.module)) {
        return false;
      }

      return true;
    });

  return (
    <div
      className={`bg-sidebar text-sidebar-foreground min-h-screen h-full flex flex-col border-r border-sidebar-border transition-all duration-300 flex-shrink-0 ${
        isCollapsed ? 'w-12 sm:w-16' : 'w-48 sm:w-56 md:w-64'
      }`}
    >
      {/* Header */}
      <div className="p-2 sm:p-3 md:p-4 border-b border-sidebar-border flex-shrink-0">
        {!isCollapsed && (
          <div className="mb-2 flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src={LOGO_URL}
                alt="Grandma's Liqueurs Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sidebar-foreground text-xs sm:text-sm md:text-base truncate">Grandma's Liqueurs</h2>
              <p className="text-xs sm:text-sm text-sidebar-foreground/70 truncate">Sistema de Gestión</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="mb-2 flex items-center justify-center">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden">
              <img
                src={LOGO_URL}
                alt="Grandma's Liqueurs Logo"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-center p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
        >
          <ChevronRight className={`w-5 h-5 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 overflow-y-auto p-1 sm:p-2">
        {filteredMenuItems.map((item) => (
          <div key={item.name} className="mb-1">
            {item.subItems ? (
              <>
                <button
                  onClick={() => toggleItem(item.name)}
                  className="w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-sidebar-accent rounded-lg transition-colors group text-xs sm:text-sm"
                  title={isCollapsed ? item.name : ''}
                >
                  <span className="text-sidebar-foreground flex-shrink-0">{item.icon}</span>
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-left text-sidebar-foreground truncate">{item.name}</span>
                      <ChevronDown
                        className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform text-sidebar-foreground flex-shrink-0 ${
                          expandedItems.includes(item.name) ? 'rotate-180' : ''
                        }`}
                      />
                    </>
                  )}
                </button>
                {expandedItems.includes(item.name) && !isCollapsed && (
                  <div className="ml-2 sm:ml-4 mt-1 space-y-1">
                    {item.subItems.map((subItem) => (
                      <button
                        key={subItem.path}
                        onClick={() => onNavigate(subItem.path)}
                        className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm ${
                          currentPath === subItem.path
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                            : 'hover:bg-sidebar-accent text-sidebar-foreground'
                        }`}
                      >
                        <span className="flex-shrink-0">{subItem.icon}</span>
                        <span className="truncate">{subItem.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => item.path && onNavigate(item.path)}
                className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm ${
                  currentPath === item.path
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'hover:bg-sidebar-accent text-sidebar-foreground'
                }`}
                title={isCollapsed ? item.name : ''}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 sm:p-3 md:p-4 border-t border-sidebar-border flex-shrink-0">
        {!isCollapsed && (
          <div className="text-xs sm:text-xs text-sidebar-foreground/70">
            <p className="truncate">Calle 104 # 79D – 65</p>
            <p className="truncate">Medellín, Laureles</p>
            <p className="mt-1 truncate">Tel: 324 610 2339</p>
          </div>
        )}
      </div>
    </div>
  );
}