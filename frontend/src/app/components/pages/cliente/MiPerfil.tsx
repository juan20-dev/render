import React, { useEffect, useState } from 'react';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Form, FormField, FormActions, FieldSuccess } from '../../Form';
import { User, Mail, Phone, MapPin, Upload, Lock } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { Modal } from '../../Modal';
import { api, newPasswordPolicyMessage } from '../../../services/api';
import { useAuth } from '../../AuthContext';
import { toast } from 'sonner';

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

export function MiPerfil() {
  const { user } = useAuth();
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
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [currentPwdOk, setCurrentPwdOk] = useState<boolean | null>(null);

  const { showAlert, AlertComponent } = useAlertDialog();

  useEffect(() => {
    const load = async () => {
      try {
        const me = await api.auth.me();
        const full = await api.usuarios.getById(Number(me.id));
        const p: PerfilCliente = {
          nombre: full.nombre || '',
          apellido: full.apellido || '',
          email: full.email || '',
          telefono: full.telefono || '',
          direccion: full.direccion || '',
          tipoDocumento: (full.tipoDocumento || 'CC') as any,
          numeroDocumento: full.numeroDocumento || '',
          foto: undefined,
        };
        setPerfil(p);
        setFormData(p);
      } catch {
        if (user) {
          const p: PerfilCliente = {
            nombre: user.nombre || '',
            apellido: user.apellido || '',
            email: user.email || '',
            telefono: user.telefono || '',
            direccion: user.direccion || '',
            tipoDocumento: (user.tipoDocumento || 'CC') as any,
            numeroDocumento: user.numeroDocumento || '',
            foto: undefined,
          };
          setPerfil(p);
          setFormData(p);
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
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
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
      setPerfil({ ...formData, foto: fotoPreview || formData.foto });
      setIsEditing(false);
      showAlert({
        title: 'Perfil actualizado',
        description: 'Tu información ha sido actualizada exitosamente',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } catch (error: any) {
      showAlert({
        title: 'Error',
        description: error.message || 'No se pudo actualizar el perfil',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    }
  };

  const handleCancelEdit = () => {
    setFormData(perfil);
    setFotoPreview(perfil.foto || null);
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
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cambiar la contraseña');
      showAlert({ title: 'Error', description: error.message || 'No se pudo cambiar la contraseña', type: 'danger', confirmText: 'Entendido', onConfirm: () => {} });
    }
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
            <div className="relative">
              {fotoPreview ? (
                <img src={fotoPreview} alt="Foto de perfil" className="w-32 h-32 rounded-full object-cover border-4 border-border" />
              ) : (
                <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center border-4 border-border">
                  <User className="w-16 h-16 text-primary" />
                </div>
              )}
            </div>

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
                {fotoPreview ? (
                  <img src={fotoPreview} alt="Preview" className="w-32 h-32 rounded-full object-cover border-4 border-border" />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center border-4 border-border"><Upload className="w-12 h-12 text-muted-foreground" /></div>
                )}
                <label className="flex-1">
                  <input type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
                  <Button type="button" variant="outline" onClick={() => document.querySelector('input[type="file"]')?.click()} icon={<Upload className="w-4 h-4" />}>
                    Cambiar Foto
                  </Button>
                </label>
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
              <FormField label="Tipo de Documento" name="tipoDocumento" type="select" value={formData.tipoDocumento} onChange={(value) => setFormData({ ...formData, tipoDocumento: value as any })} options={[{ value: 'CC', label: 'Cédula de Ciudadanía' }, { value: 'CE', label: 'Cédula de Extranjería' }, { value: 'Pasaporte', label: 'Pasaporte' }]} required />
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
          <div className="p-4 bg-accent rounded-lg mb-4"><p className="text-xs text-muted-foreground">Mínimo 8 caracteres, una mayúscula, una minúscula y un número.</p></div>
          <FormActions>
            <Button variant="outline" onClick={() => { setIsChangePasswordOpen(false); setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' }); setCurrentPwdOk(null); }}>Cancelar</Button>
            <Button type="submit" disabled={passwordSubmitDisabled} icon={<Lock className="w-5 h-5" />}>Cambiar Contraseña</Button>
          </FormActions>
        </Form>
      </Modal>
    </div>
  );
}
