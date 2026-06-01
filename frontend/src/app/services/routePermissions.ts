/**
 * Mapas rutas de la app a permisos del backend (strings en BD).
 * Administrador: acceso total. Demás roles staff: según permisos/gestiones asignadas en BD.
 *
 * Permisos por gestión (sub-módulo) y por módulo completo (marcador Gestion:Modulo).
 */

const ANY = (perms: string[]) => perms;

export const GESTION_PERMISSION_PREFIX = 'Gestion:';

export type StaffModuleId =
  | 'Dashboard'
  | 'Configuración'
  | 'Usuarios'
  | 'Compras'
  | 'Producción'
  | 'Ventas';

export type StaffSubGestionId = string;

export const STAFF_MODULES: Array<{
  id: StaffModuleId;
  label: string;
  subGestiones: Array<{ id: StaffSubGestionId; label: string }>;
}> = [
  {
    id: 'Dashboard',
    label: 'Dashboard',
    subGestiones: [{ id: 'Dashboard.Panel', label: 'Dashboard' }],
  },
  {
    id: 'Configuración',
    label: 'Configuración',
    subGestiones: [{ id: 'Configuración.Roles', label: 'Gestión de roles' }],
  },
  {
    id: 'Usuarios',
    label: 'Usuarios',
    subGestiones: [{ id: 'Usuarios.Usuarios', label: 'Gestión de usuarios' }],
  },
  {
    id: 'Compras',
    label: 'Compras',
    subGestiones: [
      { id: 'Compras.Proveedores', label: 'Proveedores' },
      { id: 'Compras.Compras', label: 'Compras' },
      { id: 'Compras.Productos', label: 'Productos' },
      { id: 'Compras.Categorías', label: 'Categorías' },
    ],
  },
  {
    id: 'Producción',
    label: 'Producción',
    subGestiones: [
      { id: 'Producción.Ordenes', label: 'Producción' },
      { id: 'Producción.EntregaInsumos', label: 'Entrega de insumos' },
      { id: 'Producción.Insumos', label: 'Insumos' },
    ],
  },
  {
    id: 'Ventas',
    label: 'Ventas',
    subGestiones: [
      { id: 'Ventas.Clientes', label: 'Clientes' },
      { id: 'Ventas.Ventas', label: 'Ventas' },
      { id: 'Ventas.Pedidos', label: 'Pedidos' },
      { id: 'Ventas.Abonos', label: 'Abonos' },
      { id: 'Ventas.Domicilios', label: 'Domicilios' },
    ],
  },
];

/** @deprecated Use STAFF_MODULES */
export const STAFF_GESTIONES = STAFF_MODULES.map((m) => ({ id: m.id, label: m.label }));

const GESTION_BUNDLES: Record<string, string[]> = {
  Dashboard: ['Ver Dashboard'],
  'Dashboard.Panel': ['Ver Dashboard'],
  'Configuración.Roles': [
    'Ver Roles',
    'Crear Roles',
    'Editar Roles',
    'Eliminar Roles',
    'Asignar Permisos',
  ],
  'Usuarios.Usuarios': [
    'Ver Usuarios',
    'Crear Usuarios',
    'Editar Usuarios',
    'Eliminar Usuarios',
    'Asignar Roles',
  ],
  'Compras.Proveedores': [
    'Ver Proveedores',
    'Crear Proveedores',
    'Editar Proveedores',
    'Eliminar Proveedores',
  ],
  'Compras.Compras': [
    'Ver Compras',
    'Crear Compras',
    'Registrar Compras',
    'Editar Compras',
    'Eliminar Compras',
    'Anular Compras',
  ],
  'Compras.Productos': [
    'Ver Productos',
    'Crear Productos',
    'Editar Productos',
    'Eliminar Productos',
    'Ver Producto-Insumos',
    'Crear Producto-Insumos',
    'Editar Producto-Insumos',
    'Eliminar Producto-Insumos',
  ],
  'Compras.Categorías': [
    'Ver Categorías',
    'Crear Categorías',
    'Editar Categorías',
    'Eliminar Categorías',
  ],
  Compras: [],
  'Producción.Ordenes': ['Ver Producción', 'Registrar Producción'],
  'Producción.EntregaInsumos': ['Entregar Insumos', 'Ver Insumos'],
  'Producción.Insumos': ['Ver Insumos', 'Crear Insumos', 'Editar Insumos', 'Eliminar Insumos'],
  Producción: [],
  'Ventas.Clientes': ['Ver Clientes', 'Crear Clientes', 'Editar Clientes', 'Eliminar Clientes'],
  'Ventas.Ventas': [
    'Ver Ventas',
    'Crear Ventas',
    'Registrar Ventas',
    'Editar Ventas',
    'Eliminar Ventas',
    'Anular Ventas',
  ],
  'Ventas.Pedidos': ['Ver Pedidos', 'Crear Pedidos', 'Editar Pedidos', 'Eliminar Pedidos'],
  'Ventas.Abonos': ['Ver Abonos', 'Crear Abonos', 'Editar Abonos', 'Eliminar Abonos'],
  'Ventas.Domicilios': [
    'Ver Domicilios',
    'Crear Domicilios',
    'Editar Domicilios',
    'Eliminar Domicilios',
    'Gestionar Domicilios',
  ],
  Ventas: [],
};

/** Lecturas auxiliares para cargar datos relacionados en cada gestión. */
const SUB_GESTION_READ_DEPS: Record<string, string[]> = {
  'Ventas.Ventas': ['Ver Clientes', 'Ver Productos', 'Ver Pedidos'],
  'Ventas.Pedidos': ['Ver Clientes', 'Ver Productos', 'Ver Producción'],
  'Ventas.Abonos': ['Ver Pedidos', 'Ver Clientes'],
  'Ventas.Domicilios': ['Ver Pedidos', 'Ver Clientes', 'Ver Productos', 'Ver Usuarios'],
  'Compras.Compras': ['Ver Productos', 'Ver Proveedores'],
  'Producción.Ordenes': ['Ver Insumos', 'Ver Productos', 'Ver Pedidos'],
  'Producción.EntregaInsumos': ['Ver Insumos', 'Ver Usuarios'],
};

const mergeSubBundlePerms = (subId: string, base: string[]) => {
  const merged = new Set(base);
  for (const dep of SUB_GESTION_READ_DEPS[subId] || []) {
    merged.add(dep);
  }
  return [...merged];
};

for (const mod of STAFF_MODULES) {
  for (const sub of mod.subGestiones) {
    GESTION_BUNDLES[sub.id] = mergeSubBundlePerms(sub.id, GESTION_BUNDLES[sub.id] || []);
  }
  const union = new Set<string>();
  for (const sub of mod.subGestiones) {
    for (const p of GESTION_BUNDLES[sub.id] || []) union.add(p);
  }
  GESTION_BUNDLES[mod.id] = [...union];
}

const MODULE_BY_SUB_ID: Record<string, StaffModuleId> = {};
for (const mod of STAFF_MODULES) {
  for (const sub of mod.subGestiones) {
    MODULE_BY_SUB_ID[sub.id] = mod.id;
  }
}

export const ALL_SUB_GESTION_IDS = STAFF_MODULES.flatMap((m) =>
  m.subGestiones.map((s) => s.id)
);

const PERMISSION_ALIASES: Record<string, string[]> = {
  'Crear Compras': ['Registrar Compras'],
  'Crear Ventas': ['Registrar Ventas'],
  'Crear Abonos': ['Registrar Abonos'],
  'Editar Domicilios': ['Gestionar Domicilios'],
  'Eliminar Compras': ['Anular Compras'],
  'Eliminar Ventas': ['Anular Ventas'],
};

const equivalentPermissions = (permission: string) => {
  const aliases = PERMISSION_ALIASES[permission] || [];
  return [permission, ...aliases];
};

export const gestionMarker = (gestionId: string) =>
  `${GESTION_PERMISSION_PREFIX}${String(gestionId).trim()}`;

export const parseGestionMarker = (permission: string): string | null => {
  const raw = String(permission || '').trim();
  if (!raw.startsWith(GESTION_PERMISSION_PREFIX)) return null;
  return raw.slice(GESTION_PERMISSION_PREFIX.length).trim() || null;
};

const isModuleId = (id: string): id is StaffModuleId =>
  STAFF_MODULES.some((m) => m.id === id);

const permissionHeld = (permisos: string[], permission: string) =>
  equivalentPermissions(permission).some((candidate) => permisos.includes(candidate));

const gestionBundleFullyGranted = (permisos: string[], gestionId: string) => {
  const bundle = GESTION_BUNDLES[gestionId] || [];
  return bundle.length > 0 && bundle.every((perm) => permissionHeld(permisos, perm));
};

export const userHasGestionAccess = (permisos: string[], gestionId: string) => {
  const list = Array.isArray(permisos) ? permisos : [];
  const id = String(gestionId || '').trim();
  if (!id) return false;

  if (list.some((p) => parseGestionMarker(p) === id)) return true;

  if (isModuleId(id)) {
    const mod = STAFF_MODULES.find((m) => m.id === id);
    if (!mod) return false;
    return mod.subGestiones.some((sub) => userHasGestionAccess(list, sub.id));
  }

  if (gestionBundleFullyGranted(list, id)) return true;

  const moduleId = MODULE_BY_SUB_ID[id];
  if (moduleId && list.some((p) => parseGestionMarker(p) === moduleId)) return true;

  return false;
};

export const userHasModuleAccess = (permisos: string[], moduleId: StaffModuleId) =>
  userHasGestionAccess(permisos, moduleId);

const resolveExpansionTargets = (rawId: string): string[] => {
  const id = String(rawId || '').trim();
  if (!id) return [];
  if (isModuleId(id)) {
    const mod = STAFF_MODULES.find((m) => m.id === id);
    return mod ? mod.subGestiones.map((s) => s.id) : [];
  }
  if (GESTION_BUNDLES[id]) return [id];
  return [];
};

export const collapseToGestiones = (permisos: string[]): StaffSubGestionId[] => {
  const list = Array.isArray(permisos) ? permisos : [];
  const selected = new Set<StaffSubGestionId>();

  for (const raw of list) {
    const markerId = parseGestionMarker(raw);
    if (!markerId) continue;
    if (isModuleId(markerId)) {
      const mod = STAFF_MODULES.find((m) => m.id === markerId);
      if (mod) {
        for (const sub of mod.subGestiones) selected.add(sub.id);
      }
      continue;
    }
    if (GESTION_BUNDLES[markerId]) selected.add(markerId);
  }

  for (const subId of ALL_SUB_GESTION_IDS) {
    if (gestionBundleFullyGranted(list, subId)) {
      selected.add(subId);
    }
  }

  return [...selected];
};

export const expandGestiones = (gestionIds: string[]): string[] => {
  const subTargets = new Set<string>();
  const granular = new Set<string>();

  for (const raw of gestionIds) {
    const id = String(raw || '').trim();
    if (!id) continue;
    const fromMarker = parseGestionMarker(id);
    const key = fromMarker || id;
    for (const targetId of resolveExpansionTargets(key)) {
      subTargets.add(targetId);
    }
    if (isModuleId(key)) {
      granular.add(gestionMarker(key));
    }
  }

  for (const subId of subTargets) {
    granular.add(gestionMarker(subId));
    for (const perm of GESTION_BUNDLES[subId] || []) {
      granular.add(perm);
      for (const alias of PERMISSION_ALIASES[perm] || []) {
        granular.add(alias);
      }
    }
    const moduleId = MODULE_BY_SUB_ID[subId];
    if (moduleId) {
      const mod = STAFF_MODULES.find((m) => m.id === moduleId);
      const allMarked = mod?.subGestiones.every((s) => subTargets.has(s.id));
      if (allMarked) {
        granular.add(gestionMarker(moduleId));
      }
    }
  }

  return [...granular];
};

export const getSubGestionesForModule = (moduleId: StaffModuleId) =>
  STAFF_MODULES.find((m) => m.id === moduleId)?.subGestiones.map((s) => s.id) ?? [];

export const isModuleFullySelected = (moduleId: StaffModuleId, selected: StaffSubGestionId[]) => {
  const subs = getSubGestionesForModule(moduleId);
  return subs.length > 0 && subs.every((id) => selected.includes(id));
};

export const toggleModuleInSelection = (
  moduleId: StaffModuleId,
  selected: StaffSubGestionId[]
): StaffSubGestionId[] => {
  const subs = getSubGestionesForModule(moduleId);
  if (isModuleFullySelected(moduleId, selected)) {
    return selected.filter((id) => !subs.includes(id));
  }
  const next = new Set(selected);
  for (const id of subs) next.add(id);
  return [...next];
};

export const toggleSubGestionInSelection = (
  subId: StaffSubGestionId,
  selected: StaffSubGestionId[]
): StaffSubGestionId[] =>
  selected.includes(subId) ? selected.filter((id) => id !== subId) : [...selected, subId];

const ROUTE_TO_SUB_GESTION: Record<string, string> = {
  dashboard: 'Dashboard.Panel',
  medicion: 'Dashboard.Panel',
  configuracion: 'Configuración.Roles',
  'configuracion/roles': 'Configuración.Roles',
  usuarios: 'Usuarios.Usuarios',
  'usuarios/roles': 'Configuración.Roles',
  'usuarios/usuarios': 'Usuarios.Usuarios',
  'usuarios/accesos': 'Usuarios.Usuarios',
  compras: 'Compras',
  'compras/proveedores': 'Compras.Proveedores',
  'compras/compras': 'Compras.Compras',
  'compras/productos': 'Compras.Productos',
  'compras/categorias': 'Compras.Categorías',
  produccion: 'Producción',
  'produccion/produccion': 'Producción.Ordenes',
  'produccion/entrega-insumos': 'Producción.EntregaInsumos',
  'produccion/insumos': 'Producción.Insumos',
  ventas: 'Ventas',
  'ventas/clientes': 'Ventas.Clientes',
  'ventas/ventas': 'Ventas.Ventas',
  'ventas/abonos': 'Ventas.Abonos',
  'ventas/pedidos': 'Ventas.Pedidos',
  domicilios: 'Ventas.Domicilios',
  'ventas/domicilios': 'Ventas.Domicilios',
};

const ROUTE_TO_MODULE: Record<string, StaffModuleId> = {
  dashboard: 'Dashboard',
  medicion: 'Dashboard',
  configuracion: 'Configuración',
  'configuracion/roles': 'Configuración',
  usuarios: 'Usuarios',
  'usuarios/roles': 'Configuración',
  'usuarios/usuarios': 'Usuarios',
  'usuarios/accesos': 'Usuarios',
  compras: 'Compras',
  'compras/proveedores': 'Compras',
  'compras/compras': 'Compras',
  'compras/productos': 'Compras',
  'compras/categorias': 'Compras',
  produccion: 'Producción',
  'produccion/produccion': 'Producción',
  'produccion/entrega-insumos': 'Producción',
  'produccion/insumos': 'Producción',
  ventas: 'Ventas',
  'ventas/clientes': 'Ventas',
  'ventas/ventas': 'Ventas',
  'ventas/abonos': 'Ventas',
  'ventas/pedidos': 'Ventas',
  domicilios: 'Ventas',
  'ventas/domicilios': 'Ventas',
};

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
    'Crear Clientes',
    'Crear Ventas',
    'Registrar Ventas',
  ]),
  'ventas/clientes': ['Ver Clientes'],
  'ventas/ventas': ['Ver Ventas'],
  'ventas/abonos': ['Ver Abonos'],
  'ventas/pedidos': ['Ver Pedidos'],
  domicilios: ANY(['Ver Domicilios', 'Editar Domicilios', 'Gestionar Domicilios']),
  'ventas/domicilios': ['Ver Domicilios', 'Editar Domicilios', 'Gestionar Domicilios'],
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

/** Resultado de Promise.allSettled con registro en consola (modo desarrollo). */
export function settledValue<T>(result: PromiseSettledResult<T>, fallback: T, resourceLabel?: string): T {
  if (result.status === 'fulfilled') return result.value;
  console.error(
    resourceLabel
      ? `[permisos] No se pudo cargar ${resourceLabel}:`
      : '[permisos] Error al cargar recurso:',
    result.reason
  );
  return fallback;
}

/** Sub-gestión concreta (Ventas.Pedidos); el id de módulo solo (Ventas) no lleva punto. */
const isSpecificSubGestionId = (gestionId: string) => gestionId.includes('.');

export function routeAllowsAccess(route: string, permisos: string[], roleName: string): boolean {
  const normalized = route.replace(/^\//, '');

  if (roleName === 'Administrador') return true;

  if (roleName === 'Cliente') {
    return (
      normalized === 'cliente/tienda' ||
      normalized === 'cliente/pedidos' ||
      normalized === 'cliente/perfil'
    );
  }

  const subGestionId = ROUTE_TO_SUB_GESTION[normalized];
  if (subGestionId) {
    if (userHasGestionAccess(permisos, subGestionId)) {
      return true;
    }
    // Pantalla con sub-gestión fija: no heredar acceso del módulo padre ni permisos auxiliares de lectura.
    if (isSpecificSubGestionId(subGestionId)) {
      return false;
    }
  }

  const moduleId = ROUTE_TO_MODULE[normalized];
  if (moduleId && userHasModuleAccess(permisos, moduleId)) {
    return true;
  }

  const rule = ROUTE_VIEW_PERMISSIONS[normalized];
  if (!rule) return false;

  if (typeof rule === 'function') {
    return rule(permisos);
  }

  return rule.some((p) => permissionHeld(permisos, p));
}
