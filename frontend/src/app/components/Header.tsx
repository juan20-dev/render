import React, { useState, useEffect } from 'react';
import { User, LogOut, KeyRound, Mail, Phone, MapPin, FileText, CreditCard, Info, X } from 'lucide-react';
import { Modal } from './Modal';
import { Form, FormField, FormActions, FieldSuccess } from './Form';
import { api, newPasswordPolicyMessage } from '../services/api';
import { Button } from './Button';
import { AlertDialog, toast } from './AlertDialog';

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
  currentPath?: string;
  userName?: string;
  userRole?: string;
  userData?: UserData;
  onLogout?: () => void;
}

const managementGuides: Record<string, string> = {
  '/configuracion/roles': 'Organiza los permisos del sistema desde los roles antes de asignarlos a los usuarios.',
  '/usuarios/roles': 'Organiza los permisos del sistema desde los roles antes de asignarlos a los usuarios.',
  '/usuarios/usuarios': 'Gestiona usuarios, datos personales, estado de la cuenta y control de acceso en un solo lugar.',
  '/usuarios/accesos': 'Usa esta gestión para validar credenciales, cambiar contraseñas y apoyar procesos de recuperación.',
  '/compras/proveedores': 'Registra proveedores y mantén al día sus datos para facilitar compras y reposición.',
  '/compras/compras': 'Crea compras, revisa su estado y confirma la recepción para actualizar el inventario.',
  '/compras/productos': 'Administra catálogo, precios, stock y estado de los productos disponibles en el sistema.',
  '/compras/categorias': 'Agrupa los productos por categoría para mejorar la organización y la búsqueda del catálogo.',
  '/produccion/produccion': 'Crea y sigue órdenes de producción controlando pedido vinculado, productor e insumos usados.',
  '/produccion/entrega-insumos': 'Registra cada entrega de insumos al productor para mantener trazabilidad del inventario.',
  '/produccion/insumos': 'Consulta existencias, movimientos recientes y responsables para evitar faltantes en producción.',
  '/ventas/clientes': 'Mantén actualizados los datos de los clientes para agilizar ventas, pedidos y domicilios.',
  '/ventas/ventas': 'Registra ventas directas o por pedido y verifica el impacto en stock, cliente y pago.',
  '/ventas/abonos': 'Consulta y registra abonos asociados a pedidos para dar seguimiento claro a los pagos parciales.',
  '/ventas/pedidos': 'Gestiona pedidos desde su creación hasta su cierre con control de productos, pago y entrega.',
  '/ventas/domicilios': 'Cuando un domicilio se completa, también se sincronizan automáticamente el pedido, la venta y el abono vinculados.',
};

export function Header({ title, currentPath = '', userName = 'Usuario', userRole = 'Rol', userData, onLogout }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [isGuideVisible, setIsGuideVisible] = useState(false);
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
  const samePasswordErr =
    passwordData.currentPassword.trim() &&
    passwordData.newPassword.trim() &&
    passwordData.currentPassword === passwordData.newPassword
      ? 'La nueva contraseña debe ser diferente a la actual.'
      : '';
  const confirmErr =
    passwordData.confirmPassword.trim() && passwordData.newPassword !== passwordData.confirmPassword
      ? 'Las contraseñas nuevas no coinciden.'
      : '';
  const currentErr =
    passwordData.currentPassword.trim() && currentPwdOk === false ? 'La contraseña actual no es correcta.' : '';

  const passwordSubmitDisabled =
    !!newPwdErr ||
    !!samePasswordErr ||
    !!confirmErr ||
    !!currentErr ||
    isPasswordSubmitting ||
    currentPwdOk !== true ||
    !passwordData.currentPassword.trim() ||
    !passwordData.newPassword.trim() ||
    !passwordData.confirmPassword.trim();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordSubmitDisabled) return;

    try {
      setIsPasswordSubmitting(true);
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
      const rawMsg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña';
      const msg =
        rawMsg.includes('ultimas 3')
          ? 'La nueva contraseña no puede coincidir con ninguna de tus últimas 3 contraseñas.'
          : rawMsg.includes('debe ser diferente a la contraseña actual')
            ? 'La nueva contraseña no puede ser igual a tu contraseña actual.'
            : rawMsg;
      toast.error(msg);
    } finally {
      setIsPasswordSubmitting(false);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentPath || !managementGuides[currentPath]) {
      setIsGuideVisible(false);
      return;
    }
    const storageKey = `grandmas:guide:dismissed:${currentPath}`;
    setIsGuideVisible(window.sessionStorage.getItem(storageKey) !== '1');
  }, [currentPath]);

  const handleDismissGuide = () => {
    if (typeof window !== 'undefined' && currentPath) {
      window.sessionStorage.setItem(`grandmas:guide:dismissed:${currentPath}`, '1');
    }
    setIsGuideVisible(false);
  };

  const currentGuide = managementGuides[currentPath];

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
      {currentGuide && isGuideVisible ? (
        <div className="border-b border-blue-200 bg-blue-50 px-3 py-3 sm:px-4 md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>{currentGuide}</p>
            </div>
            <button
              type="button"
              onClick={handleDismissGuide}
              className="rounded-md p-1 text-blue-700 transition-colors hover:bg-blue-100"
              aria-label="Cerrar mensaje de ayuda"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

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
            error={passwordData.newPassword.trim() ? samePasswordErr || newPwdErr || undefined : undefined}
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
              <strong>Nota:</strong> Mínimo 8 caracteres, una mayúscula, una minúscula, un número y no repetir la actual ni ninguna de las últimas 3 contraseñas.
            </p>
          </div>

          <FormActions>
            <Button variant="outline" disabled={isPasswordSubmitting} onClick={() => {
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
              {isPasswordSubmitting ? 'Cambiando...' : 'Cambiar Contraseña'}
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