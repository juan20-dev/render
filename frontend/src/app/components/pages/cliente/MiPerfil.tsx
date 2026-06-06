import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Form, FormField, FormActions, FieldSuccess } from '../../Form';
import { User, Mail, Phone, MapPin, Upload, Lock } from 'lucide-react';
import { toast } from '../../AlertDialog';
import { Modal } from '../../Modal';
import { api, newPasswordPolicyMessage } from '../../../services/api';
import { useAuth } from '../../AuthContext';
import { validateImageFile } from '../../hooks/landingShared';

interface PerfilCliente {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion: string;
  tipoDocumento: 'CC' | 'CE' | 'Pasaporte';
  numeroDocumento: string;
  foto?: string;
}

const ALLOWED_FOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FOTO_BYTES = 2 * 1024 * 1024;

export function MiPerfil() {
  const { user } = useAuth();
  const fotoInputRef = useRef<HTMLInputElement>(null);
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

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(perfil);
  const [fotoPreview, setFotoPreview] = useState<string | null>(perfil.foto || null);
  const [fotoArchivo, setFotoArchivo] = useState<File | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [currentPwdOk, setCurrentPwdOk] = useState<boolean | null>(null);

  const mapPerfilFromUser = (source: {
    nombre?: string;
    apellido?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    tipoDocumento?: string;
    numeroDocumento?: string;
    foto?: string;
  }): PerfilCliente => ({
    nombre: source.nombre || '',
    apellido: source.apellido || '',
    email: source.email || '',
    telefono: source.telefono || '',
    direccion: source.direccion || '',
    tipoDocumento: (source.tipoDocumento || 'CC') as PerfilCliente['tipoDocumento'],
    numeroDocumento: source.numeroDocumento || '',
    foto: source.foto,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await api.auth.me();
        let foto: string | undefined;
        try {
          const cliente = await api.clientes.getByUsuarioId(Number(me.id));
          foto = cliente.foto;
        } catch (clienteError) {
          if (import.meta.env.DEV) {
            console.error('No se pudo cargar la foto del cliente', clienteError);
          }
        }

        const p = mapPerfilFromUser({
          nombre: me.nombre,
          apellido: me.apellido,
          email: me.email,
          telefono: me.telefono,
          direccion: me.direccion,
          tipoDocumento: me.tipoDocumento,
          numeroDocumento: me.numeroDocumento,
          foto,
        });
        setPerfil(p);
        setFormData(p);
        setFotoPreview(foto || null);
      } catch {
        if (user) {
          const p = mapPerfilFromUser(user);
          setPerfil(p);
          setFormData(p);
          setFotoPreview(p.foto || null);
        }
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    const pwd = passwordData.currentPassword.trim();
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
  }, [passwordData.currentPassword, user?.id]);

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFotoArchivo(null);
      return;
    }
    // Validar imagen con lógica flexible (MIME type O extensión)
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error('Archivo rechazado', { description: validation.error || 'No se puede procesar esta imagen.' });
      e.target.value = '';
      return;
    }
    setFotoArchivo(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!user?.id) throw new Error('Sesión no disponible');
      await api.usuarios.update(Number(user.id), {
        nombre: formData.nombre,
        apellido: formData.apellido,
        tipoDocumento: formData.tipoDocumento,
        numeroDocumento: formData.numeroDocumento,
        direccion: formData.direccion,
        email: formData.email,
        telefono: formData.telefono,
      } as any);

      let nextFoto = perfil.foto;
      if (fotoArchivo) {
        try {
          nextFoto = await api.clientes.uploadProfilePhoto(fotoArchivo);
        } catch (uploadError: unknown) {
          const uploadMsg =
            uploadError instanceof Error ? uploadError.message : 'No se pudo guardar la foto de perfil.';
          toast.error('Foto no guardada', { description: uploadMsg });
          if (import.meta.env.DEV) {
            console.error('Error al subir foto de perfil', uploadError);
          }
          return;
        }
      }

      const updated = { ...formData, foto: nextFoto };
      setPerfil(updated);
      setFormData(updated);
      setFotoPreview(nextFoto || null);
      setFotoArchivo(null);
      setIsEditing(false);
      toast.success('Perfil actualizado', {
        description: 'Tu información fue actualizada exitosamente.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el perfil.';
      toast.error('Error al actualizar el perfil', { description: message });
      if (import.meta.env.DEV) {
        console.error('Error al actualizar perfil', error);
      }
    }
  };

  const handleCancelEdit = () => {
    setFormData(perfil);
    setFotoPreview(perfil.foto || null);
    setFotoArchivo(null);
    setIsEditing(false);
  };

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
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setCurrentPwdOk(null);
    } catch (error: unknown) {
      const rawMsg = error instanceof Error ? error.message : 'No se pudo cambiar la contraseña';
      const msg =
        rawMsg.includes('ultimas 3')
          ? 'La nueva contraseña no puede coincidir con ninguna de tus últimas 3 contraseñas.'
          : rawMsg.includes('debe ser diferente a la contraseña actual')
            ? 'La nueva contraseña no puede ser igual a tu contraseña actual.'
            : rawMsg;
      toast.error(msg);
    }
  };

  const renderFoto = () =>
    fotoPreview ? (
      <img src={fotoPreview} alt="Foto de perfil" className="w-32 h-32 rounded-full object-cover border-4 border-border" />
    ) : (
      <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center border-4 border-border">
        <User className="w-16 h-16 text-primary" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Mi Perfil</h2>
          <p className="text-muted-foreground">Gestiona tu información personal</p>
        </div>
        {!isEditing && (
          <div className="flex gap-3">
            <Button variant="outline" icon={<Lock className="w-5 h-5" />} onClick={() => setIsChangePasswordOpen(true)}>
              Cambiar Contraseña
            </Button>
            <Button onClick={() => setIsEditing(true)}>Editar Perfil</Button>
          </div>
        )}
      </div>

      {!isEditing ? (
        <Card>
          <div className="flex items-start gap-6">
            <div className="relative">{renderFoto()}</div>

            <div className="flex-1 space-y-4">
              <div>
                <h3>{perfil.nombre} {perfil.apellido}</h3>
                <p className="text-muted-foreground">Cliente</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-start gap-3"><Mail className="w-5 h-5 text-primary mt-0.5" /><div><p className="text-sm text-muted-foreground">Correo Electrónico</p><p>{perfil.email}</p></div></div>
                <div className="flex items-start gap-3"><Phone className="w-5 h-5 text-primary mt-0.5" /><div><p className="text-sm text-muted-foreground">Teléfono</p><p>{perfil.telefono}</p></div></div>
                <div className="flex items-start gap-3 col-span-2"><MapPin className="w-5 h-5 text-primary mt-0.5" /><div><p className="text-sm text-muted-foreground">Dirección</p><p>{perfil.direccion}</p></div></div>
                <div className="flex items-start gap-3"><User className="w-5 h-5 text-primary mt-0.5" /><div><p className="text-sm text-muted-foreground">Tipo de Documento</p><p>{perfil.tipoDocumento}</p></div></div>
                <div className="flex items-start gap-3"><User className="w-5 h-5 text-primary mt-0.5" /><div><p className="text-sm text-muted-foreground">Número de Documento</p><p>{perfil.numeroDocumento}</p></div></div>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <Form onSubmit={handleSaveChanges}>
            <div className="mb-6">
              <label className="block mb-3">Foto de Perfil</label>
              <div className="flex items-center gap-6">
                {renderFoto()}
                <div className="flex-1 space-y-2">
                  <input
                    ref={fotoInputRef}
                    id="perfilFotoInput"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFotoChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fotoInputRef.current?.click()}
                    icon={<Upload className="w-4 h-4" />}
                  >
                    Seleccionar foto
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG, PNG o WEBP. Máximo 2 MB.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Nombre" name="nombre" value={formData.nombre} onChange={(value) => setFormData({ ...formData, nombre: value as string })} placeholder="Juan" required />
              <FormField label="Apellido" name="apellido" value={formData.apellido} onChange={(value) => setFormData({ ...formData, apellido: value as string })} placeholder="Pérez" required />
            </div>
            <FormField label="Correo Electrónico" name="email" type="email" value={formData.email} onChange={(value) => setFormData({ ...formData, email: value as string })} placeholder="usuario@example.com" required />
            <FormField label="Teléfono" name="telefono" value={formData.telefono} onChange={(value) => setFormData({ ...formData, telefono: value as string })} placeholder="3001234567" required inputDigitRule="telefono10" />
            <FormField label="Dirección" name="direccion" type="textarea" value={formData.direccion} onChange={(value) => setFormData({ ...formData, direccion: value as string })} placeholder="Dirección completa" rows={2} required />

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Tipo de Documento" name="tipoDocumento" type="select" value={formData.tipoDocumento} onChange={(value) => setFormData({ ...formData, tipoDocumento: value as PerfilCliente['tipoDocumento'] })} options={[{ value: 'CC', label: 'Cédula de Ciudadanía' }, { value: 'CE', label: 'Cédula de Extranjería' }, { value: 'Pasaporte', label: 'Pasaporte' }]} required />
              <FormField label="Número de Documento" name="numeroDocumento" value={formData.numeroDocumento} onChange={(value) => setFormData({ ...formData, numeroDocumento: value as string })} placeholder="Entre 6 y 12 dígitos" required inputDigitRule="documento6to12" />
            </div>

            <FormActions>
              <Button variant="outline" onClick={handleCancelEdit}>Cancelar</Button>
              <Button type="submit">Guardar Cambios</Button>
            </FormActions>
          </Form>
        </Card>
      )}

      <Modal isOpen={isChangePasswordOpen} onClose={() => { setIsChangePasswordOpen(false); setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' }); setCurrentPwdOk(null); }} title="Cambiar Contraseña" size="md">
        <Form onSubmit={handleChangePassword}>
          <FormField label="Contraseña Actual" name="currentPassword" type="password" value={passwordData.currentPassword} onChange={(value) => setPasswordData({ ...passwordData, currentPassword: value as string })} placeholder="••••••••" required error={currentErr} />
          {passwordData.currentPassword.trim() && currentPwdOk === true ? (
            <FieldSuccess>Contraseña actual verificada.</FieldSuccess>
          ) : null}
          <FormField label="Nueva Contraseña" name="newPassword" type="password" value={passwordData.newPassword} onChange={(value) => setPasswordData({ ...passwordData, newPassword: value as string })} placeholder="••••••••" required error={passwordData.newPassword.trim() ? newPwdErr || undefined : undefined} />
          <FormField label="Confirmar Nueva Contraseña" name="confirmPassword" type="password" value={passwordData.confirmPassword} onChange={(value) => setPasswordData({ ...passwordData, confirmPassword: value as string })} placeholder="••••••••" required error={confirmErr || undefined} />
          <div className="p-4 bg-accent rounded-lg mb-4"><p className="text-xs text-muted-foreground">Mínimo 8 caracteres, una mayúscula, una minúscula, un número y no repetir la actual ni ninguna de las últimas 3 contraseñas.</p></div>
          <FormActions>
            <Button variant="outline" onClick={() => { setIsChangePasswordOpen(false); setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' }); setCurrentPwdOk(null); }}>Cancelar</Button>
            <Button type="submit" disabled={passwordSubmitDisabled} icon={<Lock className="w-5 h-5" />}>Cambiar Contraseña</Button>
          </FormActions>
        </Form>
      </Modal>
    </div>
  );
}
