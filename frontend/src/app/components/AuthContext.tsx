import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../services/api';
import { routeAllowsAccess } from '../services/routePermissions';

export type UserRole = 'Administrador' | 'Asesor' | 'Productor' | 'Repartidor' | 'Cliente';

export interface User {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  permisos?: string[];
  clienteId?: number;
  foto?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  telefono?: string;
  direccion?: string;
  estado?: 'activo' | 'inactivo';
  idleTimeoutMs?: number;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: any) => Promise<boolean>;
  logout: () => Promise<void>;
  hasPermission: (module: string, action?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    api.auth
      .me()
      .then((me: any) => {
        if (!mounted || !me) return;
        setUser(me as User);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const userData = await api.auth.login(email, password);
      setUser(userData as User);
      return true;
    } catch (error) {
      // Re-lanzamos el error para que la pantalla de Login pueda diferenciar
      // entre credenciales incorrectas, cuenta inactiva o bloqueo por intentos.
      console.error('Error en login:', error);
      throw error;
    }
  };

  const register = async (data: any): Promise<boolean> => {
    try {
      const newUser = await api.auth.register(data);
      if (newUser) {
        setUser(newUser as User);
      } else {
        const me = await api.auth.me();
        setUser(me as User);
      }
      return true;
    } catch (error) {
      console.error('Error en registro:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Error en logout:', error);
    } finally {
      api.roles.clearCache();
      setUser(null);
    }
  };

  const hasPermission = (module: string, _action: string = 'view'): boolean => {
    if (!user) return false;
    const permisos = Array.isArray(user.permisos) ? user.permisos : [];
    return routeAllowsAccess(module, permisos, user.rol);
  };

  return <AuthContext.Provider value={{ user, login, register, logout, hasPermission }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
