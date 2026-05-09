import React, { useState, useEffect } from 'react';
import { Settings, User, LogOut, KeyRound, Mail, Phone, MapPin, FileText, CreditCard } from 'lucide-react';
import { Modal } from './Modal';
import { Form, FormField, FormActions, FieldSuccess } from './Form';
import { api, newPasswordPolicyMessage } from '../services/api';
import { toast } from 'sonner';
import { Button } from './Button';
import { AlertDialog } from './AlertDialog';

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

interface HeaderProps {
  title: string;
  userName?: string;
  userRole?: string;
  userData?: UserData;
  onLogout?: () => void;
}

export function Header({ title, userName = 'Usuario', userRole = 'Rol', userData, onLogout }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [currentPwdOk, setCurrentPwdOk] = useState<boolean | null>(null);
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'info' as 'warning' | 'info' | 'success' | 'danger',
    onConfirm: () => {}
  });

  useEffect(() => {
    const pwd = passwordData.currentPassword.trim();
    if (!pwd) {
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
  }, [passwordData.currentPassword]);

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
    <>
      <header className="bg-white border-b border-border px-3 sm:px-4 md:px-6 py-3 md:py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl truncate">{title}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-border">
              <div className="text-right hidden sm:block">
                <p className="text-sm">{userName}</p>
                <p className="text-xs text-muted-foreground">{userRole}</p>
              </div>
              <button
                onClick={() => setIsProfileOpen(true)}
                className="p-2 hover:bg-accent rounded-lg transition-colors flex-shrink-0"
                title="Mi perfil"
              >
                <User className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <button
              onClick={handleLogoutClick}
              className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors flex-shrink-0"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </header>

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
                  <p className="text-sm">{userData?.nombre} {userData?.apellido}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Correo electrónico</p>
                  <p className="text-sm">{userData?.email}</p>
                </div>
              </div>

              {userData?.tipoDocumento && userData?.numeroDocumento && (
                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Documento</p>
                    <p className="text-sm">{userData.tipoDocumento} {userData.numeroDocumento}</p>
                  </div>
                </div>
              )}

              {userData?.telefono && (
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Teléfono</p>
                    <p className="text-sm">{userData.telefono}</p>
                  </div>
                </div>
              )}

              {userData?.direccion && (
                <div className="flex items-start gap-3 md:col-span-2">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Dirección</p>
                    <p className="text-sm">{userData.direccion}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Rol</p>
                  <p className="text-sm">{userData?.rol}</p>
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

      {/* AlertDialog para cambio de contraseña */}
      <AlertDialog
        isOpen={alertState.isOpen}
        onClose={() => setAlertState({ ...alertState, isOpen: false })}
        onConfirm={alertState.onConfirm}
        title={alertState.title}
        description={alertState.description}
        type={alertState.type}
        confirmText="Entendido"
        showCancel={false}
      />

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
    </>
  );
}