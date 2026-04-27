import React, { useEffect, useState } from 'react';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Form, FormField, FormActions } from '../../Form';
import { User, Mail, Phone, MapPin, Upload, Lock } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { Modal } from '../../Modal';
import { useAuth } from '../../AuthContext';
import { clientes as clientesAPI } from '../../../services/api';

interface PerfilCliente {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion: string;
  tipoDocumento: 'CC' | 'CE' | 'TI' | 'Pasaporte';
  numeroDocumento: string;
  foto?: string;
}

const normalizeTipoDocumento = (value: unknown): PerfilCliente['tipoDocumento'] => {
  const normalized = String(value || '').trim();
  if (normalized === 'CE' || normalized === 'TI' || normalized === 'Pasaporte') return normalized;
  return 'CC';
};

export function MiPerfil() {
  const { user, isAuthLoading } = useAuth();
  const [perfil, setPerfil] = useState<PerfilCliente>({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    direccion: '',
    tipoDocumento: 'CC',
    numeroDocumento: '',
    foto: undefined
  });
  const [loadingPerfil, setLoadingPerfil] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(perfil);
  const [fotoPreview, setFotoPreview] = useState<string | null>(perfil.foto || null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const { showAlert, AlertComponent } = useAlertDialog();
  const roleLabel = user?.rol || 'Sin rol asignado';

  useEffect(() => {
    const loadPerfil = async () => {
      if (!user) {
        setLoadingPerfil(false);
        return;
      }

      try {
        setLoadingPerfil(true);
        const clienteData = user.cliente_id
          ? await clientesAPI.getByUsuarioId(user.id)
          : null;
        const nextPerfil: PerfilCliente = {
          nombre: clienteData?.nombre || user.nombre || '',
          apellido: clienteData?.apellido || user.apellido || '',
          email: clienteData?.email || user.email || '',
          telefono: clienteData?.telefono || '',
          direccion: clienteData?.direccion || '',
          tipoDocumento: normalizeTipoDocumento(clienteData?.tipo_documento || clienteData?.tipoDocumento),
          numeroDocumento: clienteData?.documento || clienteData?.numeroDocumento || '',
          foto: clienteData?.foto_url || user.foto || undefined,
        };

        setPerfil(nextPerfil);
        setFormData(nextPerfil);
        setFotoPreview(nextPerfil.foto || null);
      } catch (error) {
        console.error('Error al cargar el perfil:', error);
        const fallbackPerfil: PerfilCliente = {
          nombre: user.nombre || '',
          apellido: user.apellido || '',
          email: user.email || '',
          telefono: '',
          direccion: '',
          tipoDocumento: 'CC',
          numeroDocumento: '',
          foto: user.foto || undefined
        };
        setPerfil(fallbackPerfil);
        setFormData(fallbackPerfil);
        setFotoPreview(fallbackPerfil.foto || null);
      } finally {
        setLoadingPerfil(false);
      }
    };

    void loadPerfil();
  }, [user]);

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveChanges = (e: React.FormEvent) => {
    e.preventDefault();
    setPerfil({ ...formData, foto: fotoPreview || formData.foto });
    setIsEditing(false);
    
    showAlert({
      title: 'Perfil actualizado',
      description: 'Tu información ha sido actualizada exitosamente',
      type: 'success',
      confirmText: 'Entendido',
      onConfirm: () => {}
    });
  };

  const handleCancelEdit = () => {
    setFormData(perfil);
    setFotoPreview(perfil.foto || null);
    setIsEditing(false);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showAlert({
        title: 'Error',
        description: 'Las contraseñas no coinciden',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      showAlert({
        title: 'Error',
        description: 'La contraseña debe tener al menos 6 caracteres',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    showAlert({
      title: 'Contraseña actualizada',
      description: 'Tu contraseña ha sido cambiada exitosamente',
      type: 'success',
      confirmText: 'Entendido',
      onConfirm: () => {
        setIsChangePasswordOpen(false);
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {AlertComponent}
      
      <div className="flex items-center justify-between">
        <div>
          <h2>Mi Perfil</h2>
          <p className="text-muted-foreground">Gestiona tu información personal</p>
        </div>
        {!isEditing && (
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              icon={<Lock className="w-5 h-5" />}
              onClick={() => setIsChangePasswordOpen(true)}
            >
              Cambiar Contraseña
            </Button>
            <Button onClick={() => setIsEditing(true)}>
              Editar Perfil
            </Button>
          </div>
        )}
      </div>

      {isAuthLoading || loadingPerfil ? (
        <Card>
          <p className="text-muted-foreground">Cargando perfil...</p>
        </Card>
      ) : !isEditing ? (
        <>
          {/* Vista de Perfil */}
          <Card>
            <div className="flex items-start gap-6">
              <div className="relative">
                {fotoPreview ? (
                  <img 
                    src={fotoPreview} 
                    alt="Foto de perfil" 
                    className="w-32 h-32 rounded-full object-cover border-4 border-border"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center border-4 border-border">
                    <User className="w-16 h-16 text-primary" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <h3>{perfil.nombre} {perfil.apellido}</h3>
                  <p className="text-muted-foreground">{roleLabel}</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Correo Electrónico</p>
                      <p>{perfil.email}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Teléfono</p>
                      <p>{perfil.telefono}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 col-span-2">
                    <MapPin className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Dirección</p>
                      <p>{perfil.direccion}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Tipo de Documento</p>
                      <p>{perfil.tipoDocumento}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Número de Documento</p>
                      <p>{perfil.numeroDocumento}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Estadísticas del Cliente */}
          <div className="grid grid-cols-3 gap-6">
            <Card>
              <div className="text-center">
                <p className="text-3xl text-primary mb-2">12</p>
                <p className="text-sm text-muted-foreground">Pedidos Realizados</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <p className="text-3xl text-primary mb-2">$1,245,000</p>
                <p className="text-sm text-muted-foreground">Total Comprado</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <p className="text-3xl text-primary mb-2">2</p>
                <p className="text-sm text-muted-foreground">Pedidos Pendientes</p>
              </div>
            </Card>
          </div>
        </>
      ) : (
        // Formulario de Edición
        <Card>
          <Form onSubmit={handleSaveChanges}>
            {/* Foto de perfil */}
            <div className="mb-6">
              <label className="block mb-3">Foto de Perfil</label>
              <div className="flex items-center gap-6">
                {fotoPreview ? (
                  <img 
                    src={fotoPreview} 
                    alt="Preview" 
                    className="w-32 h-32 rounded-full object-cover border-4 border-border"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center border-4 border-border">
                    <Upload className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFotoChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.querySelector('input[type="file"]')?.click()}
                    icon={<Upload className="w-4 h-4" />}
                  >
                    Cambiar Foto
                  </Button>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Nombre"
                name="nombre"
                value={formData.nombre}
                onChange={(value) => setFormData({ ...formData, nombre: value as string })}
                placeholder="Juan"
                required
              />
              
              <FormField
                label="Apellido"
                name="apellido"
                value={formData.apellido}
                onChange={(value) => setFormData({ ...formData, apellido: value as string })}
                placeholder="Pérez"
                required
              />
            </div>

            <FormField
              label="Correo Electrónico"
              name="email"
              type="email"
              value={formData.email}
              onChange={(value) => setFormData({ ...formData, email: value as string })}
              placeholder="usuario@example.com"
              required
            />

            <FormField
              label="Teléfono"
              name="telefono"
              value={formData.telefono}
              onChange={(value) => setFormData({ ...formData, telefono: value as string })}
              placeholder="300 123 4567"
              required
            />

            <FormField
              label="Dirección"
              name="direccion"
              type="textarea"
              value={formData.direccion}
              onChange={(value) => setFormData({ ...formData, direccion: value as string })}
              placeholder="Dirección completa"
              rows={2}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Tipo de Documento"
                name="tipoDocumento"
                type="select"
                value={formData.tipoDocumento}
                onChange={(value) => setFormData({ ...formData, tipoDocumento: value as any })}
                options={[
                  { value: 'CC', label: 'Cédula de Ciudadanía' },
                  { value: 'CE', label: 'Cédula de Extranjería' },
                  { value: 'TI', label: 'Tarjeta de Identidad' },
                  { value: 'Pasaporte', label: 'Pasaporte' }
                ]}
                required
              />
              
              <FormField
                label="Número de Documento"
                name="numeroDocumento"
                value={formData.numeroDocumento}
                onChange={(value) => setFormData({ ...formData, numeroDocumento: value as string })}
                placeholder="1234567890"
                required
              />
            </div>

            <FormActions>
              <Button variant="outline" onClick={handleCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit">
                Guardar Cambios
              </Button>
            </FormActions>
          </Form>
        </Card>
      )}

      {/* Modal de Cambiar Contraseña */}
      <Modal
        isOpen={isChangePasswordOpen}
        onClose={() => {
          setIsChangePasswordOpen(false);
          setPasswordData({
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          });
        }}
        title="Cambiar Contraseña"
        size="md"
      >
        <Form onSubmit={handleChangePassword}>
          <FormField
            label="Contraseña Actual"
            name="currentPassword"
            type="password"
            value={passwordData.currentPassword}
            onChange={(value) => setPasswordData({ ...passwordData, currentPassword: value as string })}
            placeholder="••••••••"
            required
          />

          <FormField
            label="Nueva Contraseña"
            name="newPassword"
            type="password"
            value={passwordData.newPassword}
            onChange={(value) => setPasswordData({ ...passwordData, newPassword: value as string })}
            placeholder="••••••••"
            required
          />

          <FormField
            label="Confirmar Nueva Contraseña"
            name="confirmPassword"
            type="password"
            value={passwordData.confirmPassword}
            onChange={(value) => setPasswordData({ ...passwordData, confirmPassword: value as string })}
            placeholder="••••••••"
            required
          />

          <div className="p-4 bg-accent rounded-lg mb-4">
            <p className="text-xs text-muted-foreground">
              La contraseña debe tener al menos 6 caracteres.
            </p>
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => {
              setIsChangePasswordOpen(false);
              setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
              });
            }}>
              Cancelar
            </Button>
            <Button type="submit" icon={<Lock className="w-5 h-5" />}>
              Cambiar Contraseña
            </Button>
          </FormActions>
        </Form>
      </Modal>
    </div>
  );
}
