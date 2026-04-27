import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Form, FormField, FormActions } from '../../Form';
import { User, Mail, Phone, MapPin, Upload, Lock } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { Modal } from '../../Modal';
import { useAuth } from '../../AuthContext';
import { auth, clientes as clientesAPI, pedidos as pedidosAPI, usuarios as usuariosAPI } from '../../../services/api';

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

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || !error) return undefined;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === 'number' ? maybeStatus : undefined;
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
    foto: undefined,
  });
  const [loadingPerfil, setLoadingPerfil] = useState(true);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [stats, setStats] = useState<{ pedidos: number; pendientes: number; totalComprado: number } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(perfil);
  const [fotoPreview, setFotoPreview] = useState<string | null>(perfil.foto || null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const usuario = (await usuariosAPI.getById(user.id)) as any;

        let clienteData: any = null;
        try {
          clienteData = await clientesAPI.getByUsuarioId(user.id);
        } catch (error) {
          const st = getHttpStatus(error);
          if (st !== 404) throw error;
        }

        const nextPerfil: PerfilCliente = {
          nombre: clienteData?.nombre || usuario?.nombre || user.nombre || '',
          apellido: clienteData?.apellido || usuario?.apellido || user.apellido || '',
          email: clienteData?.email || usuario?.email || user.email || '',
          telefono: clienteData?.telefono || usuario?.telefono || '',
          direccion: clienteData?.direccion || usuario?.direccion || '',
          tipoDocumento: normalizeTipoDocumento(clienteData?.tipo_documento || usuario?.tipo_documento),
          numeroDocumento: clienteData?.documento || usuario?.documento || '',
          foto: clienteData?.foto_url || usuario?.foto_url || undefined,
        };

        setClienteId(typeof clienteData?.id === 'number' ? clienteData.id : null);
        setPerfil(nextPerfil);
        setFormData(nextPerfil);
        setFotoPreview(nextPerfil.foto || null);

        if (clienteData?.id) {
          try {
            const pedidos = (await pedidosAPI.getByCliente(clienteData.id)) as any[];
            const list = Array.isArray(pedidos) ? pedidos : [];
            const pendientes = list.filter((p) =>
              ['Pendiente', 'En Proceso'].includes(String(p?.estado || ''))
            ).length;
            const totalComprado = list.reduce((acc, p) => acc + Number(p?.total || 0), 0);
            setStats({ pedidos: list.length, pendientes, totalComprado });
          } catch {
            setStats({ pedidos: 0, pendientes: 0, totalComprado: 0 });
          }
        } else {
          setStats(null);
        }
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
          foto: undefined,
        };
        setPerfil(fallbackPerfil);
        setFormData(fallbackPerfil);
        setFotoPreview(fallbackPerfil.foto || null);
        setClienteId(null);
        setStats(null);
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

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setSaving(true);
      await usuariosAPI.update(user.id, {
        nombre: formData.nombre,
        apellido: formData.apellido,
        email: formData.email,
        telefono: formData.telefono,
        direccion: formData.direccion,
        tipo_documento: formData.tipoDocumento,
        documento: formData.numeroDocumento,
      });

      if (clienteId) {
        const payload: Record<string, unknown> = {
          nombre: formData.nombre,
          apellido: formData.apellido,
          email: formData.email,
          telefono: formData.telefono,
          direccion: formData.direccion,
          tipoDocumento: formData.tipoDocumento,
          documento: formData.numeroDocumento,
        };
        if (fotoPreview && fotoPreview.startsWith('http')) {
          payload.foto_url = fotoPreview;
        }
        await clientesAPI.update(clienteId, payload);
      }

      const next = { ...formData, foto: fotoPreview || formData.foto };
      setPerfil(next);
      setIsEditing(false);
      showAlert({
        title: 'Perfil actualizado',
        description: 'Tu información se guardó correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } catch (error: any) {
      showAlert({
        title: 'No se pudo guardar',
        description: typeof error?.message === 'string' ? error.message : 'Intenta de nuevo.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setFormData(perfil);
    setFotoPreview(perfil.foto || null);
    setIsEditing(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showAlert({
        title: 'Error',
        description: 'Las contraseñas no coinciden',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      const res: any = await auth.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        confirmPassword: passwordData.confirmPassword,
      });
      if (res?.success === false) {
        throw new Error(res?.message || 'No se pudo cambiar la contraseña');
      }
      showAlert({
        title: 'Contraseña actualizada',
        description: 'Tu contraseña ha sido cambiada correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {
          setIsChangePasswordOpen(false);
          setPasswordData({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          });
        },
      });
    } catch (error: any) {
      showAlert({
        title: 'Error',
        description: typeof error?.message === 'string' ? error.message : 'No se pudo cambiar la contraseña.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    }
  };

  return (
    <div className="space-y-6">
      {AlertComponent}

      <div className="flex items-center justify-between">
        <div>
          <h2>Mi perfil</h2>
          <p className="text-muted-foreground">Gestiona tu información personal</p>
        </div>
        {!isEditing && (
          <div className="flex gap-3">
            <Button variant="outline" icon={<Lock className="w-5 h-5" />} onClick={() => setIsChangePasswordOpen(true)}>
              Cambiar contraseña
            </Button>
            <Button onClick={() => setIsEditing(true)}>Editar perfil</Button>
          </div>
        )}
      </div>

      {isAuthLoading || loadingPerfil ? (
        <Card>
          <p className="text-muted-foreground">Cargando perfil...</p>
        </Card>
      ) : !isEditing ? (
        <>
          <Card>
            <div className="flex items-start gap-6">
              <div className="relative">
                {fotoPreview ? (
                  <img
                    src={fotoPreview}
                    alt="Foto de perfil"
                    className="h-32 w-32 rounded-full border-4 border-border object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-border bg-primary/10">
                    <User className="h-16 w-16 text-primary" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <h3>
                    {perfil.nombre} {perfil.apellido}
                  </h3>
                  <p className="text-muted-foreground">{roleLabel}</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Correo electrónico</p>
                      <p>{perfil.email}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Teléfono</p>
                      <p>{perfil.telefono || '—'}</p>
                    </div>
                  </div>

                  <div className="col-span-2 flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Dirección</p>
                      <p>{perfil.direccion || '—'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Tipo de documento</p>
                      <p>{perfil.tipoDocumento}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Número de documento</p>
                      <p>{perfil.numeroDocumento || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {stats ? (
            <div className="grid grid-cols-3 gap-6">
              <Card>
                <div className="text-center">
                  <p className="mb-2 text-3xl text-primary">{stats.pedidos}</p>
                  <p className="text-sm text-muted-foreground">Pedidos realizados</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="mb-2 text-3xl text-primary">
                    ${stats.totalComprado.toLocaleString('es-CO')}
                  </p>
                  <p className="text-sm text-muted-foreground">Total pedidos (histórico)</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="mb-2 text-3xl text-primary">{stats.pendientes}</p>
                  <p className="text-sm text-muted-foreground">Pedidos pendientes / en proceso</p>
                </div>
              </Card>
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          <Form onSubmit={handleSaveChanges}>
            <div className="mb-6">
              <label className="mb-3 block">Foto de perfil</label>
              <div className="flex items-center gap-6">
                {fotoPreview ? (
                  <img
                    src={fotoPreview}
                    alt="Preview"
                    className="h-32 w-32 rounded-full border-4 border-border object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-border bg-muted">
                    <Upload className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <label className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFotoChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    icon={<Upload className="h-4 w-4" />}
                  >
                    Cambiar foto
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Solo se envía al servidor si la imagen es una URL (http/https). La vista previa local es solo
                    referencia.
                  </p>
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
              label="Correo electrónico"
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
                label="Tipo de documento"
                name="tipoDocumento"
                type="select"
                value={formData.tipoDocumento}
                onChange={(value) => setFormData({ ...formData, tipoDocumento: value as any })}
                options={[
                  { value: 'CC', label: 'Cédula de ciudadanía' },
                  { value: 'CE', label: 'Cédula de extranjería' },
                  { value: 'TI', label: 'Tarjeta de identidad' },
                  { value: 'Pasaporte', label: 'Pasaporte' },
                ]}
                required
              />

              <FormField
                label="Número de documento"
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
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </FormActions>
          </Form>
        </Card>
      )}

      <Modal
        isOpen={isChangePasswordOpen}
        onClose={() => {
          setIsChangePasswordOpen(false);
          setPasswordData({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          });
        }}
        title="Cambiar contraseña"
        size="md"
      >
        <Form onSubmit={handleChangePassword}>
          <FormField
            label="Contraseña actual"
            name="currentPassword"
            type="password"
            value={passwordData.currentPassword}
            onChange={(value) => setPasswordData({ ...passwordData, currentPassword: value as string })}
            placeholder="••••••••"
            required
          />

          <FormField
            label="Nueva contraseña"
            name="newPassword"
            type="password"
            value={passwordData.newPassword}
            onChange={(value) => setPasswordData({ ...passwordData, newPassword: value as string })}
            placeholder="Mínimo 8 caracteres, una mayúscula y un número"
            required
          />

          <FormField
            label="Confirmar nueva contraseña"
            name="confirmPassword"
            type="password"
            value={passwordData.confirmPassword}
            onChange={(value) => setPasswordData({ ...passwordData, confirmPassword: value as string })}
            placeholder="••••••••"
            required
          />

          <div className="mb-4 rounded-lg bg-accent p-4">
            <p className="text-xs text-muted-foreground">
              La contraseña debe cumplir las reglas de seguridad del sistema (mínimo 8 caracteres, mayúscula y
              número).
            </p>
          </div>

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setIsChangePasswordOpen(false);
                setPasswordData({
                  currentPassword: '',
                  newPassword: '',
                  confirmPassword: '',
                });
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" icon={<Lock className="h-5 w-5" />}>
              Cambiar contraseña
            </Button>
          </FormActions>
        </Form>
      </Modal>
    </div>
  );
}
