/**
 * Mapas rutas de la app (sin "/" inicial, como en App.tsx) a permisos del backend (strings en BD).
 * Si el usuario tiene el rol Administrador, AuthContext concede todo sin consultar esta tabla.
 */

const ANY = (perms: string[]) => perms;

export const ROUTE_VIEW_PERMISSIONS: Record<string, string[] | ((permisos: string[]) => boolean)> = {
  dashboard: ['Ver Dashboard'],
  medicion: ['Ver Dashboard'],
  // Nodo padre del sidebar "Configuracion": basta con tener al menos un permiso
  // para ver el menu desplegable.
  configuracion: ANY(['Ver Roles', 'Asignar Permisos']),
  'configuracion/roles': ['Ver Roles', 'Asignar Permisos'],
  // Nodo padre del sidebar "Usuarios": basta con tener al menos un permiso
  // sobre roles o usuarios para ver el menu desplegable.
  usuarios: ANY(['Ver Usuarios', 'Crear Usuarios', 'Editar Usuarios', 'Eliminar Usuarios', 'Ver Roles', 'Asignar Permisos']),
  'usuarios/roles': ['Ver Roles'],
  'usuarios/usuarios': ['Ver Usuarios'],
  'usuarios/accesos': ['Ver Usuarios'],
  compras: ANY([
    'Ver Proveedores',
    'Ver Compras',
    'Ver Productos',
    'Ver Categorías',
    'Crear Proveedores',
    'Registrar Compras',
  ]),
  'compras/proveedores': ['Ver Proveedores'],
  'compras/compras': ['Ver Compras'],
  'compras/productos': ['Ver Productos'],
  'compras/categorias': ['Ver Categorías'],
  produccion: ANY(['Ver Insumos', 'Entregar Insumos', 'Ver Producción', 'Registrar Producción']),
  'produccion/produccion': ['Ver Producción', 'Registrar Producción'],
  'produccion/entrega-insumos': ['Entregar Insumos', 'Ver Insumos'],
  'produccion/insumos': ['Ver Insumos'],
  ventas: ANY([
    'Ver Clientes',
    'Ver Ventas',
    'Ver Abonos',
    'Ver Pedidos',
    'Ver Domicilios',
    'Crear Clientes',
    'Registrar Ventas',
  ]),
  'ventas/clientes': ['Ver Clientes'],
  'ventas/ventas': ['Ver Ventas'],
  'ventas/abonos': ['Ver Abonos'],
  'ventas/pedidos': ['Ver Pedidos'],
  'ventas/domicilios': ['Ver Domicilios', 'Gestionar Domicilios'],
  cliente: (permisos) =>
    permisos.some((p) =>
      ['Ver Tienda', 'Ver Mis Pedidos', 'Ver Mis Lista de Compras', 'Ver Mis Domicilios'].includes(p)
    ),
  'cliente/tienda': ['Ver Tienda'],
  'cliente/pedidos': ['Ver Mis Pedidos'],
  'cliente/perfil': ['Ver Tienda', 'Ver Mis Pedidos', 'Ver Mis Domicilios'],
};

/** Orden alineado con el menú lateral: primera ruta permitida tras iniciar sesión (personal interno). */
const STAFF_ROUTE_ORDER = [
  'dashboard',
  'configuracion/roles',
  'usuarios/roles',
  'usuarios/usuarios',
  'usuarios/accesos',
  'compras/proveedores',
  'compras/compras',
  'compras/productos',
  'compras/categorias',
  'produccion/produccion',
  'produccion/entrega-insumos',
  'produccion/insumos',
  'ventas/clientes',
  'ventas/ventas',
  'ventas/abonos',
  'ventas/pedidos',
  'ventas/domicilios',
] as const;

export function firstPermittedStaffPath(permisos: string[], roleName: string): string {
  for (const route of STAFF_ROUTE_ORDER) {
    if (routeAllowsAccess(route, permisos, roleName)) {
      return `/${route}`;
    }
  }
  return '/dashboard';
}

export function routeAllowsAccess(route: string, permisos: string[], roleName: string): boolean {
  if (roleName === 'Administrador') return true;

  const rule = ROUTE_VIEW_PERMISSIONS[route];
  if (!rule) return false;

  if (typeof rule === 'function') {
    return rule(permisos);
  }

  return rule.some((p) => permisos.includes(p));
}
