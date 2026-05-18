import React, { useState } from 'react';
import { Card } from '../Card';
import { Form, FormField, FormActions } from '../Form';
import { Button } from '../Button';
import { LogIn, UserPlus, KeyRound, ArrowLeft } from 'lucide-react';
import { Modal } from '../Modal';
import { AlertDialog } from '../AlertDialog';
import { useAuth } from '../AuthContext';
import { api } from '../../services/api';

// Logo local - using favicon from public folder
const LOGO_URL = '/favicon/apple-touch-icon.png';

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

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

      setAlertState({
        isOpen: true,
        title: 'Error de autenticación',
        description: error.message || 'Credenciales incorrectas. Por favor verifica tu email y contraseña.',
        type: 'danger',
        onConfirm: () => {}
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerData.password !== registerData.confirmPassword) {
      setAlertState({
        isOpen: true,
        title: 'Error en el registro',
        description: 'Las contraseñas no coinciden',
        type: 'danger',
        onConfirm: () => {}
      });
      return;
    }

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
                  <Button type="submit" className="w-full" icon={<LogIn className="w-5 h-5" />}>
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

            <Form onSubmit={handleRegister}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <FormField
                  label="Tipo de Documento"
                  name="tipoDocumento"
                  type="select"
                  value={registerData.tipoDocumento}
                  onChange={(value) => setRegisterData({ ...registerData, tipoDocumento: value as any })}
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
                  onChange={(value) => setRegisterData({ ...registerData, numeroDocumento: value as string })}
                  placeholder="Entre 6 y 12 dígitos"
                  required
                  inputDigitRule="documento6to12"
                />

                <FormField
                  label="Nombre"
                  name="nombre"
                  value={registerData.nombre}
                  onChange={(value) => setRegisterData({ ...registerData, nombre: value as string })}
                  placeholder="Juan"
                  required
                />
                
                <FormField
                  label="Apellido"
                  name="apellido"
                  value={registerData.apellido}
                  onChange={(value) => setRegisterData({ ...registerData, apellido: value as string })}
                  placeholder="Pérez"
                  required
                />

                <FormField
                  label="Dirección"
                  name="direccion"
                  value={registerData.direccion}
                  onChange={(value) => setRegisterData({ ...registerData, direccion: value as string })}
                  placeholder="Calle 104 # 79D - 65"
                  required
                />

                <FormField
                  label="Teléfono"
                  name="telefono"
                  value={registerData.telefono}
                  onChange={(value) => setRegisterData({ ...registerData, telefono: value as string })}
                  placeholder="3001234567"
                  required
                  inputDigitRule="telefono10"
                />

                <FormField
                  label="Correo Electrónico"
                  name="email"
                  type="email"
                  value={registerData.email}
                  onChange={(value) => setRegisterData({ ...registerData, email: value as string })}
                  placeholder="usuario@example.com"
                  required
                />

                <FormField
                  label="Contraseña"
                  name="password"
                  type="password"
                  value={registerData.password}
                  onChange={(value) => setRegisterData({ ...registerData, password: value as string })}
                  placeholder="••••••••"
                  required
                />

                <FormField
                  label="Confirmar Contraseña"
                  name="confirmPassword"
                  type="password"
                  value={registerData.confirmPassword}
                  onChange={(value) => setRegisterData({ ...registerData, confirmPassword: value as string })}
                  placeholder="••••••••"
                  required
                />

                <div className="sm:col-span-2 pt-2">
                  <FormActions>
                    <Button type="submit" className="w-full" icon={<UserPlus className="w-5 h-5" />}>
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

        <Form onSubmit={handleResetPassword}>
          <FormField
            label="Correo Electrónico"
            name="resetEmail"
            type="email"
            value={resetEmail}
            onChange={(value) => setResetEmail(value as string)}
            placeholder="usuario@example.com"
            required
          />

          <FormActions>
            <Button variant="outline" onClick={() => {
              setIsResetPasswordOpen(false);
              setResetEmail('');
            }}>
              Cancelar
            </Button>
            <Button type="submit" icon={<KeyRound className="w-5 h-5" />}>
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