import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, FileText, KeyRound, Mail, MapPin, Phone, Upload, User } from 'lucide-react';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { toast } from '../AlertDialog';
import { api } from '../../services/api';
import { UserData, validateImageFile } from '../hooks/landingShared';

interface ProfileModalProps {
  isOpen: boolean;
  user?: UserData;
  onClose: () => void;
  onOpenChangePassword: () => void;
}

const ALLOWED_FOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FOTO_BYTES = 2 * 1024 * 1024;

export function ProfileModal({
  isOpen,
  user,
  onClose,
  onOpenChangePassword,
}: ProfileModalProps) {
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  useEffect(() => {
    if (!isOpen || !user?.email) {
      return;
    }

    let cancelled = false;
    const loadFoto = async () => {
      try {
        const me = await api.auth.me();
        const cliente = await api.clientes.getByUsuarioId(Number(me.id));
        if (!cancelled) {
          setFotoPreview(cliente.foto || null);
        }
      } catch (error) {
        if (!cancelled) {
          setFotoPreview(null);
        }
        if (import.meta.env.DEV) {
          console.error('No se pudo cargar la foto de perfil', error);
        }
      }
    };

    loadFoto();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.email]);

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Validar imagen con lógica flexible (MIME type O extensión)
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error('Archivo rechazado', { description: validation.error || 'No se puede procesar esta imagen.' });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setFotoPreview(localPreview);
    setIsUploadingFoto(true);

    try {
      const fotoUrl = await api.clientes.uploadProfilePhoto(file);
      setFotoPreview(fotoUrl);
      toast.success('Foto actualizada', { description: 'Tu foto de perfil se guardó correctamente.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la foto de perfil.';
      toast.error('Foto no guardada', { description: message });
      if (import.meta.env.DEV) {
        console.error('Error al subir foto de perfil', error);
      }
    } finally {
      setIsUploadingFoto(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mi Perfil" size="lg">
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-accent/50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {fotoPreview ? (
                <img
                  src={fotoPreview}
                  alt="Foto de perfil"
                  className="h-16 w-16 rounded-2xl object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
                  <User className="h-8 w-8" />
                </div>
              )}
              <div>
                <h3 className="text-lg sm:text-xl">
                  {user?.nombre} {user?.apellido}
                </h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <div className="mt-2 inline-flex items-center rounded-full bg-white px-3 py-1 text-xs text-primary shadow-sm">
                  Cuenta {user?.rol}
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Resumen</p>
              <p className="text-sm text-foreground">Datos principales de tu cuenta y contacto</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              ref={fotoInputRef}
              id="profileModalFotoInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFotoChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              disabled={isUploadingFoto}
              onClick={() => fotoInputRef.current?.click()}
              icon={<Upload className="w-4 h-4" />}
            >
              Seleccionar foto
            </Button>
            <p className="text-xs text-muted-foreground">JPG, PNG o WEBP. Máximo 2 MB.</p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 border-b border-border/60 pb-4 sm:pb-5">
              <div className="rounded-lg bg-primary/10 p-2">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Correo electrónico</p>
                <p className="text-sm">{user?.email || 'No registrado'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-b border-border/60 pb-4 sm:pb-5">
              <div className="rounded-lg bg-primary/10 p-2">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Teléfono</p>
                <p className="text-sm">{user?.telefono || 'No registrado'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-b border-border/60 pb-4 sm:pb-5">
              <div className="rounded-lg bg-primary/10 p-2">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Documento</p>
                <p className="text-sm">
                  {user?.tipoDocumento && user?.numeroDocumento
                    ? `${user.tipoDocumento} ${user.numeroDocumento}`
                    : 'No registrado'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-b border-border/60 pb-4 sm:pb-5">
              <div className="rounded-lg bg-primary/10 p-2">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rol</p>
                <p className="text-sm">{user?.rol || 'Cliente'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dirección</p>
                <p className="text-sm">{user?.direccion || 'No registrada'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <Button
            onClick={onOpenChangePassword}
            variant="outline"
            className="w-full"
            icon={<KeyRound className="w-5 h-5" />}
          >
            Cambiar Contraseña
          </Button>
        </div>
      </div>
    </Modal>
  );
}
