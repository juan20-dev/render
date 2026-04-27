import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, subscribeApiUnauthorized } from '../services/api';

export type UserRole = 'Administrador' | 'Asesor' | 'Productor' | 'Repartidor' | 'Cliente';

export interface User {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  cliente_id?: number | null;
  permisos?: string[];
  foto?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthLoading: boolean;
  sessionWarningVersion: number;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthLoginResult>;
  logout: () => void;
  hasPermission: (module: string, action?: string) => boolean;
}

export interface AuthLoginResult {
  success: boolean;
  message?: string;
  status?: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizePermissions = (permissions: unknown): string[] => {
  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions);
      return normalizePermissions(parsed);
    } catch {
      return permissions
        .split(',')
        .map((permission) => permission.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(permissions)) return [];

  return permissions
    .filter((permission): permission is string => typeof permission === 'string')
    .map((permission) => permission.trim())
    .filter(Boolean);
};

const permissionAccessMap: Record<string, { modules: string[]; actions: Record<string, string[]> }> = {
  'Ver Dashboard': { modules: ['dashboard'], actions: { dashboard: ['view'] } },
  'Ver Usuarios': { modules: ['usuarios'], actions: { usuarios: ['view'] } },
  'Crear Usuarios': { modules: ['usuarios'], actions: { usuarios: ['create'] } },
  'Editar Usuarios': { modules: ['usuarios'], actions: { usuarios: ['edit'] } },
  'Eliminar Usuarios': { modules: ['usuarios'], actions: { usuarios: ['delete'] } },
  'Ver Roles': { modules: ['configuracion'], actions: { configuracion: ['view'] } },
  'Asignar Permisos': { modules: ['configuracion'], actions: { configuracion: ['edit'] } },
  'Ver Proveedores': { modules: ['compras'], actions: { compras: ['view'] } },
  'Crear Proveedores': { modules: ['compras'], actions: { compras: ['create'] } },
  'Editar Proveedores': { modules: ['compras'], actions: { compras: ['edit'] } },
  'Ver Compras': { modules: ['compras'], actions: { compras: ['view'] } },
  'Registrar Compras': { modules: ['compras'], actions: { compras: ['create'] } },
  'Anular Compras': { modules: ['compras'], actions: { compras: ['cancel'] } },
  'Ver Productos': { modules: ['compras'], actions: { compras: ['view'] } },
  'Crear Productos': { modules: ['compras'], actions: { compras: ['create'] } },
  'Editar Productos': { modules: ['compras'], actions: { compras: ['edit'] } },
  'Ver Categorías': { modules: ['compras'], actions: { compras: ['view'] } },
  'Crear Categorías': { modules: ['compras'], actions: { compras: ['create'] } },
  'Ver Insumos': { modules: ['produccion'], actions: { produccion: ['view'] } },
  'Entregar Insumos': { modules: ['produccion'], actions: { produccion: ['edit'] } },
  'Ver Producción': { modules: ['produccion'], actions: { produccion: ['view'] } },
  'Registrar Producción': { modules: ['produccion'], actions: { produccion: ['create'] } },
  'Ver Clientes': { modules: ['ventas'], actions: { ventas: ['view'] } },
  'Crear Clientes': { modules: ['ventas'], actions: { ventas: ['create'] } },
  'Editar Clientes': { modules: ['ventas'], actions: { ventas: ['edit'] } },
  'Ver Ventas': { modules: ['ventas'], actions: { ventas: ['view'] } },
  'Registrar Ventas': { modules: ['ventas'], actions: { ventas: ['create'] } },
  'Anular Ventas': { modules: ['ventas'], actions: { ventas: ['cancel'] } },
  'Ver Abonos': { modules: ['ventas'], actions: { ventas: ['view'] } },
  'Registrar Abonos': { modules: ['ventas'], actions: { ventas: ['create'] } },
  'Ver Pedidos': { modules: ['ventas'], actions: { ventas: ['view'] } },
  'Crear Pedidos': { modules: ['ventas'], actions: { ventas: ['create'] } },
  'Ver Domicilios': { modules: ['ventas'], actions: { ventas: ['view'] } },
  'Gestionar Domicilios': { modules: ['ventas'], actions: { ventas: ['edit'] } },
  'Ver Tienda': { modules: ['cliente'], actions: { 'cliente/tienda': ['view'] } },
  'Ver Mis Pedidos': { modules: ['cliente'], actions: { 'cliente/pedidos': ['view'] } },
  'Ver Mis Lista de Compras': { modules: ['cliente'], actions: { 'cliente/compras': ['view'] } },
  'Ver Mis Compras': { modules: ['cliente'], actions: { 'cliente/compras': ['view'] } },
  'Ver Mis Domicilios': { modules: ['cliente'], actions: { 'cliente/domicilios': ['view'] } },
};

const permissionsToAccessMap = (permissions: string[]) => {
  const modules = new Set<string>();
  const actions: Record<string, string[]> = {};

  permissions.forEach((permission) => {
    const access = permissionAccessMap[permission];
    if (!access) return;

    access.modules.forEach((moduleName) => {
      modules.add(moduleName);
    });

    Object.entries(access.actions).forEach(([moduleName, moduleActions]) => {
      if (!actions[moduleName]) {
        actions[moduleName] = [];
      }

      moduleActions.forEach((actionName) => {
        if (!actions[moduleName].includes(actionName)) {
          actions[moduleName].push(actionName);
        }
      });
    });
  });

  return { modules: Array.from(modules), actions };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [sessionExpiresAtMs, setSessionExpiresAtMs] = useState<number | null>(null);
  const [sessionWarningVersion, setSessionWarningVersion] = useState(0);

  const mapUser = (result: any): User | null => {
    if (!result?.id || !result?.email) {
      return null;
    }

    return {
      id: Number(result.id),
      email: result.email,
      nombre: result.nombre,
      apellido: result.apellido,
      rol: result.rol as UserRole,
      cliente_id: typeof result.cliente_id === 'number' ? result.cliente_id : (Number.isFinite(Number(result.cliente_id)) ? Number(result.cliente_id) : null),
      permisos: normalizePermissions(result.permisos),
    };
  };

  const resolveSessionExpiresAt = (result: any): number | null => {
    if (!result) return null;

    if (typeof result.session_expires_at === 'string') {
      const timestamp = Date.parse(result.session_expires_at);
      if (!Number.isNaN(timestamp)) {
        return timestamp;
      }
    }

    if (typeof result.expires_in_ms === 'number') {
      return Date.now() + result.expires_in_ms;
    }

    return null;
  };

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const result = await auth.me();
        if (isMounted) {
          setUser(mapUser(result));
          setSessionExpiresAtMs(resolveSessionExpiresAt(result));
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setSessionExpiresAtMs(null);
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeApiUnauthorized(() => {
      setUser(null);
      setSessionExpiresAtMs(null);
    });
  }, []);

  useEffect(() => {
    if (!user || !sessionExpiresAtMs) {
      return;
    }

    const millisecondsUntilExpiry = sessionExpiresAtMs - Date.now();
    if (millisecondsUntilExpiry <= 0) {
      setUser(null);
      setSessionExpiresAtMs(null);
      return;
    }

    const warningInMs = millisecondsUntilExpiry - 30_000;

    const warningTimer = setTimeout(
      () => {
        setSessionWarningVersion((current) => current + 1);
      },
      Math.max(0, warningInMs)
    );

    const expiryTimer = setTimeout(() => {
      auth.logout().catch(() => {
        // Session may already be expired server-side.
      });
      setUser(null);
      setSessionExpiresAtMs(null);
    }, millisecondsUntilExpiry);

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(expiryTimer);
    };
  }, [user?.id, sessionExpiresAtMs]);

  const login = async (email: string, password: string, rememberMe = false): Promise<AuthLoginResult> => {
    try {
      const result = await auth.login(email, password, rememberMe);
      const mappedUser = mapUser(result);
      if (mappedUser) {
        setUser(mappedUser);
        setSessionExpiresAtMs(resolveSessionExpiresAt(result));
        return {
          success: true,
          message: 'Inicio de sesión exitoso',
        };
      }
      return {
        success: false,
        message: 'No se pudo iniciar sesión con las credenciales proporcionadas',
      };
    } catch (error) {
      console.error('Error de login:', error);
      return {
        success: false,
        message:
          typeof (error as any)?.message === 'string' && (error as any).message.trim()
            ? (error as any).message
            : 'No se pudo iniciar sesión. Intenta nuevamente.',
        status: Number.isFinite(Number((error as any)?.status)) ? Number((error as any).status) : undefined,
      };
    }
  };

  const logout = () => {
    auth.logout().catch(() => {
      // Ensure local state is cleared even if backend logout fails.
    });
    setUser(null);
    setSessionExpiresAtMs(null);
  };

  const hasPermission = (module: string, action: string = 'view'): boolean => {
    if (!user) return false;

    if (module === 'perfil') {
      return true;
    }

    const permissions = permissionsToAccessMap(user.permisos || []);

    // Verificar si tiene acceso al módulo base
    const moduleBase = module.split('/')[0];
    if (!permissions.modules.includes(moduleBase)) return false;

    // Verificar acción específica
    const moduleActions = permissions.actions[module] || permissions.actions[moduleBase] || [];
    return moduleActions.includes(action);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthLoading, sessionWarningVersion, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}