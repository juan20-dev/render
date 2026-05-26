import React, { useState, useEffect } from 'react';
import { Card } from '../../Card';
import { Form, FormField, FormActions, FieldSuccess } from '../../Form';
import { Button } from '../../Button';
import { LogIn, Lock, Mail } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { api, newPasswordPolicyMessage } from '../../../services/api';
import { toast } from '../../AlertDialog';

export function Accesos() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'change-password' | 'reset'>('login');
  
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [changePasswordData, setChangePasswordData] = useState({ 
    currentPassword: '', 
    newPassword: '', 
    confirmPassword: '' 
  });
  const [currentPwdOk, setCurrentPwdOk] = useState<boolean | null>(null);
  const [resetData, setResetData] = useState({ email: '' });

  useEffect(() => {
    if (activeTab !== 'change-password') {
      setCurrentPwdOk(null);
      return;
    }
    const pwd = changePasswordData.currentPassword.trim();
    if (!pwd || !user?.id) {
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
  }, [activeTab, changePasswordData.currentPassword, user?.id]);

  const newPwdErr = newPasswordPolicyMessage(changePasswordData.newPassword);
  const confirmErr =
    changePasswordData.confirmPassword.trim() && changePasswordData.newPassword !== changePasswordData.confirmPassword
      ? 'Las contraseñas nuevas no coinciden.'
      : '';
  const currentErr =
    changePasswordData.currentPassword.trim() && currentPwdOk === false ? 'La contraseña actual no es correcta.' : '';

  const passwordSubmitDisabled =
    !!newPwdErr ||
    !!confirmErr ||
    !!currentErr ||
    currentPwdOk !== true ||
    !changePasswordData.currentPassword.trim() ||
    !changePasswordData.newPassword.trim() ||
    !changePasswordData.confirmPassword.trim();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Iniciando sesión...');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordSubmitDisabled) {
      toast.error('Completa y corrige los campos antes de continuar.');
      return;
    }
    try {
      await api.auth.changePassword(
        changePasswordData.currentPassword,
        changePasswordData.newPassword,
        changePasswordData.confirmPassword
      );
      toast.success('Contraseña actualizada');
      setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setCurrentPwdOk(null);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña';
      const msg =
        rawMsg.includes('ultimas 3')
          ? 'La nueva contraseña no puede coincidir con ninguna de tus últimas 3 contraseñas.'
          : rawMsg.includes('debe ser diferente a la contraseña actual')
            ? 'La nueva contraseña no puede ser igual a tu contraseña actual.'
            : rawMsg;
      toast.error(msg);
    }
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Se ha enviado un enlace de recuperación a ${resetData.email}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2>Gestión de Accesos</h2>
        <p className="text-muted-foreground">Administra el acceso y seguridad del sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('login')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'login' 
              ? 'border-primary text-primary' 
              : 'border-transparent hover:text-primary'
          }`}
        >
          Iniciar Sesión
        </button>
        <button
          onClick={() => setActiveTab('change-password')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'change-password' 
              ? 'border-primary text-primary' 
              : 'border-transparent hover:text-primary'
          }`}
        >
          Cambiar Contraseña
        </button>
        <button
          onClick={() => setActiveTab('reset')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'reset' 
              ? 'border-primary text-primary' 
              : 'border-transparent hover:text-primary'
          }`}
        >
          Restablecer Contraseña
        </button>
      </div>

      <div className="max-w-2xl">
        {activeTab === 'login' && (
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary/10 rounded-lg">
                <LogIn className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3>Iniciar Sesión</h3>
                <p className="text-sm text-muted-foreground">Ingresa tus credenciales de acceso</p>
              </div>
            </div>

            <Form onSubmit={handleLogin}>
              <FormField
                label="Correo Electrónico"
                name="email"
                type="email"
                value={loginData.email}
                onChange={(value) => setLoginData({ ...loginData, email: value as string })}
                placeholder="usuario@example.com"
                required
              />
              
              <FormField
                label="Contraseña"
                name="password"
                type="password"
                value={loginData.password}
                onChange={(value) => setLoginData({ ...loginData, password: value as string })}
                placeholder="••••••••"
                required
              />

              <FormActions>
                <Button type="submit" className="w-full">
                  Iniciar Sesión
                </Button>
              </FormActions>
            </Form>
          </Card>
        )}

        {activeTab === 'change-password' && (
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3>Cambiar Contraseña</h3>
                <p className="text-sm text-muted-foreground">Actualiza tu contraseña de acceso</p>
              </div>
            </div>

            <Form onSubmit={handleChangePassword}>
              <FormField
                label="Contraseña Actual"
                name="currentPassword"
                type="password"
                value={changePasswordData.currentPassword}
                onChange={(value) => setChangePasswordData({ ...changePasswordData, currentPassword: value as string })}
                placeholder="••••••••"
                required
                error={currentErr}
              />
              {changePasswordData.currentPassword.trim() && currentPwdOk === true ? (
                <FieldSuccess>Contraseña actual verificada.</FieldSuccess>
              ) : null}
              
              <FormField
                label="Nueva Contraseña"
                name="newPassword"
                type="password"
                value={changePasswordData.newPassword}
                onChange={(value) => setChangePasswordData({ ...changePasswordData, newPassword: value as string })}
                placeholder="••••••••"
                required
                error={changePasswordData.newPassword.trim() ? newPwdErr || undefined : undefined}
              />
              
              <FormField
                label="Confirmar Nueva Contraseña"
                name="confirmPassword"
                type="password"
                value={changePasswordData.confirmPassword}
                onChange={(value) => setChangePasswordData({ ...changePasswordData, confirmPassword: value as string })}
                placeholder="••••••••"
                required
                error={confirmErr || undefined}
              />

              <FormActions>
                <Button type="submit" className="w-full" disabled={passwordSubmitDisabled}>
                  Cambiar Contraseña
                </Button>
              </FormActions>
            </Form>
          </Card>
        )}

        {activeTab === 'reset' && (
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3>Restablecer Contraseña</h3>
                <p className="text-sm text-muted-foreground">Envía un enlace de recuperación por email</p>
              </div>
            </div>

            <Form onSubmit={handleReset}>
              <FormField
                label="Correo Electrónico"
                name="email"
                type="email"
                value={resetData.email}
                onChange={(value) => setResetData({ email: value as string })}
                placeholder="usuario@example.com"
                required
              />

              <div className="p-4 bg-accent rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Se enviará un enlace de recuperación al correo electrónico especificado. 
                  El enlace será válido por 24 horas.
                </p>
              </div>

              <FormActions>
                <Button type="submit" className="w-full">
                  Enviar Enlace de Recuperación
                </Button>
              </FormActions>
            </Form>
          </Card>
        )}
      </div>
    </div>
  );
}
