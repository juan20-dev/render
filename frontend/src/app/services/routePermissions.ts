/**
 * Mapas rutas de la app a permisos del backend (strings en BD).
 * Administrador: acceso total. Asesor: operación completa excepto usuarios/roles/config.
 */

const ANY = (perms: string[]) => perms;

/** Rutas reservadas solo para Administrador */
export const ADMIN_ONLY_ROUTES = new Set([
  'configuracion',
  'configuracion/roles',
  'usuarios',
  'usuarios/roles',
  'usuarios/usuarios',
  'usuarios/accesos',
]);

export const ROUTE_VIEW_PERMISSIONS: Record<string, string[] | ((permisos: string[]) => boolean)> = {
  dashboard: ['Ver Dashboard'],
  medicion: ['Ver Dashboard'],
  configuracion: ANY(['Ver Roles', 'Asignar Permisos']),
  'configuracion/roles': ['Ver Roles', 'Asignar Permisos'],
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
    'Crear Compras',
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
    'Crear Clientes',
    'Crear Ventas',
  ]),
  'ventas/clientes': ['Ver Clientes'],
  'ventas/ventas': ['Ver Ventas'],
  'ventas/abonos': ['Ver Abonos'],
  'ventas/pedidos': ['Ver Pedidos'],
  domicilios: ANY(['Ver Domicilios', 'Editar Domicilios']),
  'ventas/domicilios': ['Ver Domicilios', 'Editar Domicilios'],
  cliente: (permisos) =>
    permisos.some((p) => ['Ver Tienda', 'Ver Mis Pedidos', 'Cliente'].includes(p)),
  'cliente/tienda': ['Ver Tienda'],
  'cliente/pedidos': ['Ver Mis Pedidos'],
  'cliente/perfil': ['Ver Tienda', 'Ver Mis Pedidos'],
};

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
  const normalized = route.replace(/^\//, '');

  if (roleName === 'Administrador') return true;

  if (roleName === 'Asesor') {
    if (ADMIN_ONLY_ROUTES.has(normalized)) return false;
    return true;
  }

  if (roleName === 'Repartidor') {
    return normalized === 'dashboard' || normalized === 'ventas/domicilios';
  }

  if (roleName === 'Productor') {
    return normalized === 'dashboard' || normalized === 'produccion/produccion';
  }

  if (roleName === 'Cliente') {
    return (
      normalized === 'cliente/tienda' ||
      normalized === 'cliente/pedidos' ||
      normalized === 'cliente/perfil'
    );
  }

  const rule = ROUTE_VIEW_PERMISSIONS[normalized];
  if (!rule) return false;

  if (typeof rule === 'function') {
    return rule(permisos);
  }

  return rule.some((p) => permisos.includes(p));
}
