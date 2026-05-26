import React, { useEffect, useState } from 'react';
import { Card } from '../Card';
import { Form, FormField, FormActions } from '../Form';
import { Button } from '../Button';
import { LogIn, UserPlus, KeyRound, ArrowLeft } from 'lucide-react';
import { Modal } from '../Modal';
import { AlertDialog } from '../AlertDialog';
import { useAuth } from '../AuthContext';
import { api, newPasswordPolicyMessage } from '../../services/api';

// Logo local - using favicon from public folder
const LOGO_URL = '/favicon/apple-touch-icon.png';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string, required = true): string | undefined {
  const v = String(email || '').trim();
  if (!v) return required ? 'El correo es obligatorio' : undefined;
  if (!EMAIL_RE.test(v)) return 'Ingresa un correo electrónico válido';
  return undefined;
}

function validateLoginPassword(password: string): string | undefined {
  if (!password) return 'La contraseña es obligatoria';
  return undefined;
}

function validateRegisterPassword(password: string): string | undefined {
  if (!password) return 'La contraseña es obligatoria';
  return newPasswordPolicyMessage(password) || undefined;
}

function validateName(value: string, label: string): string | undefined {
  const v = String(value || '').trim();
  if (!v) return `${label} es obligatorio`;
  if (v.length < 2) return `${label} debe tener al menos 2 caracteres`;
  return undefined;
}

function validateDocumento(value: string): string | undefined {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return 'El documento es obligatorio';
  if (digits.length < 6 || digits.length > 12) return 'El documento debe tener entre 6 y 12 dígitos';
  return undefined;
}

function validateTelefono(value: string): string | undefined {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return 'El teléfono es obligatorio';
  if (digits.length !== 10) return 'El teléfono debe tener exactamente 10 dígitos';
  return undefined;
}

function validateDireccion(value: string): string | undefined {
  const v = String(value || '').trim();
  if (!v) return 'La dirección es obligatoria';
  if (v.length < 5) return 'Ingresa una dirección más completa';
  return undefined;
}

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<void>;
  initialTab?: 'login' | 'register';
  onBackToLanding?: () => void;
}

export function Login({ onLogin, initialTab = 'login', onBackToLanding }: LoginProps) {
  const { register } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  
  // Estados para alertas
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'info' as 'warning' | 'info' | 'success' | 'danger',
    onConfirm: () => {}
  });
  
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));
  const fieldError = (field: string, message: string | undefined) =>
    touched[field] ? message : undefined;

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ 
    tipoDocumento: 'CC' as 'CC' | 'CE' | 'Pasaporte',
    numeroDocumento: '',
    nombre: '',
    apellido: '',
    direccion: '',
    telefono: '',
    email: '', 
    password: '', 
    confirmPassword: ''
  });
  const [registerDocumentoDuplicate, setRegisterDocumentoDuplicate] = useState('');
  const [registerEmailDuplicate, setRegisterEmailDuplicate] = useState('');

  const loginEmailErr = validateEmail(loginData.email);
  const loginPasswordErr = validateLoginPassword(loginData.password);
  const registerConfirmErr =
    registerData.confirmPassword.trim() &&
    registerData.password !== registerData.confirmPassword
      ? 'Las contraseñas no coinciden'
      : undefined;

  useEffect(() => {
    if (activeTab !== 'register') {
      setRegisterDocumentoDuplicate('');
      return;
    }

    const documento = String(registerData.numeroDocumento || '').replace(/\D/g, '');
    if (documento.length < 6 || documento.length > 12) {
      setRegisterDocumentoDuplicate('');
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const availability = await api.auth.checkRegisterAvailability({ documento });
        if (!cancelled) {
          setRegisterDocumentoDuplicate(
            availability.documentoExists
              ? 'Este documento ya está registrado. Usa otro número o inicia sesión con tu cuenta existente.'
              : ''
          );
        }
      } catch {
        if (!cancelled) {
          setRegisterDocumentoDuplicate('');
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, registerData.numeroDocumento]);

  useEffect(() => {
    if (activeTab !== 'register') {
      setRegisterEmailDuplicate('');
      return;
    }

    const email = String(registerData.email || '').trim().toLowerCase();
    if (!email || validateEmail(email)) {
      setRegisterEmailDuplicate('');
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const availability = await api.auth.checkRegisterAvailability({ email });
        if (!cancelled) {
          setRegisterEmailDuplicate(
            availability.emailExists
              ? 'Este correo ya está registrado. Usa otro correo o inicia sesión con tu cuenta existente.'
              : ''
          );
        }
      } catch {
        if (!cancelled) {
          setRegisterEmailDuplicate('');
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, registerData.email]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched((prev) => ({ ...prev, loginEmail: true, loginPassword: true }));
    if (loginEmailErr || loginPasswordErr) return;

    try {
      await onLogin(loginData.email, loginData.password);

      setAlertState({
        isOpen: true,
        title: 'Bienvenido',
        description: 'Inicio de sesión exitoso',
        type: 'success',
        onConfirm: () => {}
      });

      setTimeout(() => {
        setAlertState(prev => ({ ...prev, isOpen: false }));
      }, 2000);
    } catch (error: any) {
      // Bloqueo por demasiados intentos: el backend devuelve status 429 con mensaje claro.
      const status = Number(error?.status || 0);
      const code = String(error?.code || '');
      const details = (error && typeof error === 'object' ? (error as any).details : null) || {};
      const isBlocked = status === 429 || details?.blocked === true;

      if (isBlocked) {
        const minutos = Number(details?.remainingMinutes || details?.blockMinutes || 5);
        setAlertState({
          isOpen: true,
          title: 'Acceso bloqueado temporalmente',
          description:
            error.message ||
            `Has superado el número permitido de intentos de inicio de sesión. Tu acceso está bloqueado por seguridad. Inténtalo nuevamente dentro de ${minutos} minutos.`,
          type: 'warning',
          onConfirm: () => {},
        });
        return;
      }

      if (status === 403 || code === 'INACTIVE_ACCOUNT') {
        setAlertState({
          isOpen: true,
          title: 'Cuenta inactiva',
          description:
            error.message ||
            'Tu cuenta está inactiva. Comunícate con los administradores de la aplicación para reactivar el acceso.',
          type: 'warning',
          onConfirm: () => {},
        });
        return;
      }

      if (status === 401 || code === 'INVALID_CREDENTIALS') {
        setAlertState({
          isOpen: true,
          title: 'Credenciales no válidas',
          description:
            error.message ||
            'No encontramos un usuario activo con esas credenciales. Verifica tus datos o regístrate en la aplicación.',
          type: 'danger',
          onConfirm: () => {},
        });
        return;
      }

      setAlertState({
        isOpen: true,
        title: 'Error de autenticación',
        description: error.message || 'No fue posible completar el inicio de sesión.',
        type: 'danger',
        onConfirm: () => {}
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      regTipoDocumento: true,
      regNumeroDocumento: true,
      regNombre: true,
      regApellido: true,
      regDireccion: true,
      regTelefono: true,
      regEmail: true,
      regPassword: true,
      regConfirmPassword: true,
    });

    const regErrors = [
      registerDocumentoDuplicate || validateDocumento(registerData.numeroDocumento),
      validateName(registerData.nombre, 'El nombre'),
      validateName(registerData.apellido, 'El apellido'),
      validateDireccion(registerData.direccion),
      validateTelefono(registerData.telefono),
      registerEmailDuplicate || validateEmail(registerData.email),
      validateRegisterPassword(registerData.password),
      registerConfirmErr,
    ].filter(Boolean);
    if (regErrors.length > 0) return;

    try {
      await register(registerData);

      setAlertState({
        isOpen: true,
        title: 'Registro exitoso',
        description: `¡Bienvenido ${registerData.nombre} ${registerData.apellido}!\n\nTu cuenta de cliente ha sido creada exitosamente.`,
        type: 'success',
        onConfirm: () => {}
      });

      setTimeout(() => {
        setAlertState(prev => ({ ...prev, isOpen: false }));
      }, 2000);
    } catch (error: any) {
      setAlertState({
        isOpen: true,
        title: 'Error en el registro',
        description: error.message || 'Error al registrar usuario',
        type: 'danger',
        onConfirm: () => {}
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched((prev) => ({ ...prev, resetEmail: true }));
    if (validateEmail(resetEmail)) return;

    try {
      await api.auth.requestPasswordReset(resetEmail);
      setAlertState({
        isOpen: true, 
        title: 'Enlace enviado',
        description: `Se ha enviado un enlace de restablecimiento de contraseña a ${resetEmail}`,
        type: 'success',
        onConfirm: () => {
          setIsResetPasswordOpen(false);
          setResetEmail('');
        }
      });
    } catch (error: any) {
      setAlertState({
        isOpen: true,
        title: 'Error',
        description: error.message || 'No fue posible enviar el enlace',
        type: 'danger',
        onConfirm: () => {}
      });
    }
  };

  return (
    <div className="relative min-h-dvh w-full">
      {/* Fondo fijo: evita franja blanca al hacer scroll (min-h-screen + items-center en móvil) */}
      <div className="fixed inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=1920&h=1080&fit=crop"
          alt="Background"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/80 to-black/90" />
      </div>

      <div className="relative z-10 flex min-h-dvh w-full flex-col items-center justify-start px-6 py-8 sm:justify-center sm:py-10">
      <div
        className={`w-full transition-[max-width] ${activeTab === 'register' ? 'max-w-2xl' : 'max-w-md'}`}
      >
        {onBackToLanding && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onBackToLanding}
              className="flex items-center gap-2 text-white hover:text-white/80 transition-colors bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden />
              <span>Volver al inicio</span>
            </button>
          </div>
        )}

        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl mb-4 shadow-lg overflow-hidden">
            <img
              src={LOGO_URL}
              alt="Grandma's Liqueurs Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-white mb-2">Grandma's Liqueurs</h1>
          <p className="text-white/80">Bienvenido</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white/10 backdrop-blur-sm p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('login')}
            className={`flex-1 px-4 py-2 rounded-md transition-colors ${
              activeTab === 'login'
                ? 'bg-white shadow-sm text-primary'
                : 'text-white hover:text-white/80'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`flex-1 px-4 py-2 rounded-md transition-colors ${
              activeTab === 'register'
                ? 'bg-white shadow-sm text-primary'
                : 'text-white hover:text-white/80'
            }`}
          >
            Registrarse
          </button>
        </div>

        {activeTab === 'login' && (
          <>
            <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <LogIn className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3>Bienvenido</h3>
                  <p className="text-sm text-muted-foreground">Ingresa tus credenciales</p>
                </div>
              </div>

              <Form onSubmit={handleLogin} noValidate>
                <FormField
                  label="Correo Electrónico"
                  name="email"
                  type="email"
                  value={loginData.email}
                  onChange={(value) => {
                    markTouched('loginEmail');
                    setLoginData({ ...loginData, email: value as string });
                  }}
                  placeholder="usuario@example.com"
                  required
                  error={fieldError('loginEmail', loginEmailErr)}
                />
                
                <FormField
                  label="Contraseña"
                  name="password"
                  type="password"
                  value={loginData.password}
                  onChange={(value) => {
                    markTouched('loginPassword');
                    setLoginData({ ...loginData, password: value as string });
                  }}
                  placeholder="••••••••"
                  required
                  error={fieldError('loginPassword', loginPasswordErr)}
                />

                <FormActions>
                  <Button
                    type="submit"
                    className="w-full"
                    icon={<LogIn className="w-5 h-5" />}
                    disabled={Boolean(loginEmailErr || loginPasswordErr)}
                  >
                    Iniciar Sesión
                  </Button>
                </FormActions>
              </Form>

              {/* Enlace de restablecer contraseña */}
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setIsResetPasswordOpen(true)}
                  className="text-sm text-primary hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </div>

          </>
        )}

        {activeTab === 'register' && (
          <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary/10 rounded-lg">
                <UserPlus className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3>Crear Cuenta</h3>
                <p className="text-sm text-muted-foreground">Completa el formulario de registro</p>
              </div>
            </div>

            <Form onSubmit={handleRegister} noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <FormField
                  label="Tipo de Documento"
                  name="tipoDocumento"
                  type="select"
                  value={registerData.tipoDocumento}
                  onChange={(value) => {
                    markTouched('regTipoDocumento');
                    setRegisterData({ ...registerData, tipoDocumento: value as any });
                  }}
                  options={[
                    { value: 'CC', label: 'Cédula de Ciudadanía' },
                    { value: 'CE', label: 'Cédula de Extranjería' },
                    { value: 'Pasaporte', label: 'Pasaporte' }
                  ]}
                  required
                />

                <FormField
                  label="Número de Documento"
                  name="numeroDocumento"
                  value={registerData.numeroDocumento}
                  onChange={(value) => {
                    markTouched('regNumeroDocumento');
                    setRegisterDocumentoDuplicate('');
                    setRegisterData({ ...registerData, numeroDocumento: value as string });
                  }}
                  placeholder="Ingresa tu documento"
                  required
                  inputDigitRule="documento6to12"
                  hideAutoHelper
                  error={fieldError('regNumeroDocumento', registerDocumentoDuplicate || validateDocumento(registerData.numeroDocumento))}
                />

                <FormField
                  label="Nombre"
                  name="nombre"
                  value={registerData.nombre}
                  onChange={(value) => {
                    markTouched('regNombre');
                    setRegisterData({ ...registerData, nombre: value as string });
                  }}
                  placeholder="Juan"
                  required
                  error={fieldError('regNombre', validateName(registerData.nombre, 'El nombre'))}
                />
                
                <FormField
                  label="Apellido"
                  name="apellido"
                  value={registerData.apellido}
                  onChange={(value) => {
                    markTouched('regApellido');
                    setRegisterData({ ...registerData, apellido: value as string });
                  }}
                  placeholder="Pérez"
                  required
                  error={fieldError('regApellido', validateName(registerData.apellido, 'El apellido'))}
                />

                <FormField
                  label="Dirección"
                  name="direccion"
                  value={registerData.direccion}
                  onChange={(value) => {
                    markTouched('regDireccion');
                    setRegisterData({ ...registerData, direccion: value as string });
                  }}
                  placeholder="Calle 104 # 79D - 65"
                  required
                  error={fieldError('regDireccion', validateDireccion(registerData.direccion))}
                />

                <FormField
                  label="Teléfono"
                  name="telefono"
                  value={registerData.telefono}
                  onChange={(value) => {
                    markTouched('regTelefono');
                    setRegisterData({ ...registerData, telefono: value as string });
                  }}
                  placeholder="3001234567"
                  required
                  inputDigitRule="telefono10"
                  hideAutoHelper
                  error={fieldError('regTelefono', validateTelefono(registerData.telefono))}
                />

                <FormField
                  label="Correo Electrónico"
                  name="email"
                  type="email"
                  value={registerData.email}
                  onChange={(value) => {
                    markTouched('regEmail');
                    setRegisterEmailDuplicate('');
                    setRegisterData({ ...registerData, email: value as string });
                  }}
                  placeholder="usuario@example.com"
                  required
                  error={fieldError('regEmail', registerEmailDuplicate || validateEmail(registerData.email))}
                />

                <FormField
                  label="Contraseña"
                  name="password"
                  type="password"
                  value={registerData.password}
                  onChange={(value) => {
                    markTouched('regPassword');
                    setRegisterData({ ...registerData, password: value as string });
                  }}
                  placeholder="••••••••"
                  required
                  error={fieldError('regPassword', validateRegisterPassword(registerData.password))}
                  helperText="Mínimo 8 caracteres, una mayúscula, una minúscula y un número."
                />

                <FormField
                  label="Confirmar Contraseña"
                  name="confirmPassword"
                  type="password"
                  value={registerData.confirmPassword}
                  onChange={(value) => {
                    markTouched('regConfirmPassword');
                    setRegisterData({ ...registerData, confirmPassword: value as string });
                  }}
                  placeholder="••••••••"
                  required
                  error={fieldError('regConfirmPassword', registerConfirmErr)}
                />

                <div className="sm:col-span-2 pt-2">
                  <FormActions>
                    <Button
                      type="submit"
                      className="w-full"
                      icon={<UserPlus className="w-5 h-5" />}
                      disabled={Boolean(
                        registerDocumentoDuplicate ||
                        registerEmailDuplicate ||
                        validateDocumento(registerData.numeroDocumento) ||
                        validateName(registerData.nombre, 'El nombre') ||
                        validateName(registerData.apellido, 'El apellido') ||
                        validateDireccion(registerData.direccion) ||
                        validateTelefono(registerData.telefono) ||
                        validateEmail(registerData.email) ||
                        validateRegisterPassword(registerData.password) ||
                        registerConfirmErr
                      )}
                    >
                      Crear Cuenta
                    </Button>
                  </FormActions>
                </div>
              </div>
            </Form>
          </div>
        )}

        <div className="text-center mt-6 text-sm text-white/80">
          <p>Calle 104 # 79D – 65, Medellín, Laureles</p>
          <p>Tel: 324 610 2339</p>
        </div>
      </div>
      </div>

      {/* Modal de Restablecer Contraseña */}
      <Modal
        isOpen={isResetPasswordOpen}
        onClose={() => {
          setIsResetPasswordOpen(false);
          setResetEmail('');
        }}
        title="Restablecer Contraseña"
        size="md"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary/10 rounded-lg">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña
            </p>
          </div>
        </div>

        <Form onSubmit={handleResetPassword} noValidate>
          <FormField
            label="Correo Electrónico"
            name="resetEmail"
            type="email"
            value={resetEmail}
            onChange={(value) => {
              markTouched('resetEmail');
              setResetEmail(value as string);
            }}
            placeholder="usuario@example.com"
            required
            error={fieldError('resetEmail', validateEmail(resetEmail))}
          />

          <FormActions>
            <Button variant="outline" onClick={() => {
              setIsResetPasswordOpen(false);
              setResetEmail('');
            }}>
              Cancelar
            </Button>
            <Button
              type="submit"
              icon={<KeyRound className="w-5 h-5" />}
              disabled={Boolean(validateEmail(resetEmail))}
            >
              Enviar Enlace
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
        confirmText="Entendido"
        showCancel={false}
      />
    </div>
  );
}