import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Eye, Edit, Trash2, X } from 'lucide-react';
import { AlertDialog } from '../../AlertDialog';
import { api } from '../../../services/api';
import type { Usuario } from '../../../services/types';
import { toast } from '../../AlertDialog';

type RolCatalogo = { id: number; nombre: string; estado: string };

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<RolCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEstadoModalOpen, setIsEstadoModalOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState<Usuario | null>(null);
  const [usuarioEstadoPendiente, setUsuarioEstadoPendiente] = useState<{
    usuario: Usuario;
    nuevoEstado: 'activo' | 'inactivo';
  } | null>(null);
  const [motivoEstado, setMotivoEstado] = useState('');
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [showPasswordNote, setShowPasswordNote] = useState(true);
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'info' as 'warning' | 'info' | 'success' | 'danger',
    onConfirm: () => {}
  });
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    tipoDocumento: 'CC' as 'CC' | 'CE' | 'Pasaporte',
    numeroDocumento: '',
    direccion: '',
    email: '',
    telefono: '',
    password: '',
    rol: '',
    estado: 'activo' as 'activo' | 'inactivo'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filtroRol, setFiltroRol] = useState<string>('Todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todos');
  const [isSavingUsuario, setIsSavingUsuario] = useState(false);

  // Debounce de búsqueda para evitar saturar API
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Cargar usuarios
  useEffect(() => {
    cargarUsuarios({
      q: searchDebounced.length >= 2 ? searchDebounced : '',
      rol: filtroRol,
      estado: filtroEstado,
    });
  }, [searchDebounced, filtroRol, filtroEstado, roles]);

  useEffect(() => {
    api.roles
      .getAll()
      .then((data: unknown) => {
        const rows = Array.isArray(data) ? data : [];
        setRoles(
          rows.map((r: Record<string, unknown>) => ({
            id: Number(r.id),
            nombre: String(r.nombre ?? '').trim(),
            estado: String(r.estado ?? 'Activo').trim(),
          }))
        );
      })
      .catch(() => {
        setRoles([]);
        toast.error('No se pudieron cargar los roles');
      });
  }, []);

  const cargarUsuarios = async (opts: { q?: string; rol?: string; estado?: string } = {}) => {
    const q = opts.q ?? '';
    const rol = opts.rol ?? 'Todos';
    const estado = opts.estado ?? 'Todos';
    try {
      setLoading(true);
      const rolId = rol !== 'Todos' ? roles.find((r) => r.nombre === rol)?.id : undefined;
      const estados = estado === 'Todos' ? '' : estado;
      const data = await api.usuarios.getAll({
        q,
        rol_id: rolId ? String(rolId) : '',
        estados,
        exclude_clientes: 'true',
      });
      setUsuarios(data);
    } catch (error: any) {
      toast.error('No se pudieron cargar los usuarios', {
        description: error?.message || 'Verifique su conexión e intente nuevamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Roles válidos para usuarios del sistema (excluye 'Cliente' porque se gestiona desde Clientes).
  const rolesAsignables = roles.filter(
    (r) => r.nombre && r.nombre.toLowerCase() !== 'cliente'
  );
  const rolesActivos = rolesAsignables.filter((r) => r.estado.toLowerCase() !== 'inactivo');

  const opcionesRolModal = (() => {
    const base = rolesActivos.map((r) => ({ value: r.nombre, label: r.nombre }));
    if (selectedUsuario?.rol && !base.some((o) => o.value === selectedUsuario.rol)) {
      return [...base, { value: selectedUsuario.rol, label: `${selectedUsuario.rol} (rol actual)` }];
    }
    return base;
  })();

  // Validaciones en tiempo real
  const validarEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validarTelefono = (telefono: string) => {
    const d = String(telefono || '').replace(/\D/g, '');
    return d.length === 10;
  };

  const validarDocumento = (documento: string) => {
    const d = String(documento || '').replace(/\D/g, '').length;
    return d >= 6 && d <= 12;
  };

  const validarPassword = (password: string) => {
    if (password.length < 8) return false;
    const tieneMayuscula = /[A-Z]/.test(password);
    const tieneMinuscula = /[a-z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    return tieneMayuscula && tieneMinuscula && tieneNumero;
  };

  // Filtro defensivo: aunque el backend ya excluye clientes, evitamos que
  // se muestren si por algún motivo llegaran en la respuesta.
  const usuariosFiltrados = useMemo(
    () =>
      usuarios.filter((u) => String(u.rol || '').toLowerCase() !== 'cliente'),
    [usuarios]
  );

  // ----- Validacion en vivo de duplicados (documento, telefono, email) -----
  const docNormU = String(formData.numeroDocumento || '').replace(/\D/g, '');
  const telNormU = String(formData.telefono || '').replace(/\D/g, '');
  const emailNormU = String(formData.email || '').trim().toLowerCase();

  const documentoDuplicadoU = useMemo(() => {
    if (docNormU.length < 6 || docNormU.length > 12) return '';
    const dup = usuarios.some(
      (u) =>
        (!selectedUsuario || u.id !== selectedUsuario.id) &&
        String(u.numeroDocumento || '').replace(/\D/g, '') === docNormU
    );
    return dup
      ? 'Este número de documento ya está registrado para otro usuario. Use otro o edite el existente.'
      : '';
  }, [usuarios, docNormU, selectedUsuario]);

  const telefonoDuplicadoU = useMemo(() => {
    if (telNormU.length !== 10) return '';
    const dup = usuarios.some(
      (u) =>
        (!selectedUsuario || u.id !== selectedUsuario.id) &&
        String(u.telefono || '').replace(/\D/g, '') === telNormU
    );
    return dup
      ? 'Este teléfono ya está registrado para otro usuario. Use uno distinto.'
      : '';
  }, [usuarios, telNormU, selectedUsuario]);

  const emailDuplicadoU = useMemo(() => {
    if (!emailNormU) return '';
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormU);
    if (!valid) return '';
    const dup = usuarios.some(
      (u) =>
        (!selectedUsuario || u.id !== selectedUsuario.id) &&
        String(u.email || '').trim().toLowerCase() === emailNormU
    );
    return dup
      ? 'Este correo ya está registrado para otro usuario. Use uno distinto.'
      : '';
  }, [usuarios, emailNormU, selectedUsuario]);

  const columns: Column[] = [
    {
      key: 'tipoDocumento',
      label: 'Tipo Doc.',
      render: (tipoDocumento: string) => tipoDocumento
    },
    {
      key: 'numeroDocumento',
      label: 'Documento'
    },
    {
      key: 'nombre',
      label: 'Nombre Completo',
      render: (_: any, row: Usuario) => `${row.nombre} ${row.apellido}`
    },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'rol', label: 'Rol' },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: any, row: Usuario) => (
        <select
          value={row.estado}
          onChange={(e) => handleEstadoChange(row, e.target.value as 'activo' | 'inactivo')}
          className="px-3 py-1 rounded-full text-xs border-0 cursor-pointer"
          style={{
            backgroundColor: row.estado === 'activo' ? '#dcfce7' : '#fee2e2',
            color: row.estado === 'activo' ? '#166534' : '#991b1b'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      )
    }
  ];

  const handleEstadoChange = (usuario: Usuario, nuevoEstado: 'activo' | 'inactivo') => {
    if (usuario.estado === nuevoEstado) return;
    setUsuarioEstadoPendiente({ usuario, nuevoEstado });
    setMotivoEstado('');
    setIsEstadoModalOpen(true);
  };

  const confirmarCambioEstado = async () => {
    if (!usuarioEstadoPendiente) return;

    const motivoTrim = motivoEstado.trim();
    if (motivoTrim.length < 10) {
      toast.warning('Motivo demasiado corto', {
        description: `Escribe al menos 10 caracteres explicando el motivo del cambio (actual: ${motivoTrim.length}).`,
      });
      return;
    }
    if (motivoTrim.length > 50) {
      toast.warning('Motivo demasiado largo', {
        description: `El motivo no puede superar los 50 caracteres (actual: ${motivoTrim.length}).`,
      });
      return;
    }

    try {
      await api.usuarios.changeEstado(
        usuarioEstadoPendiente.usuario.id,
        usuarioEstadoPendiente.nuevoEstado,
        motivoTrim
      );

      toast.success(
        usuarioEstadoPendiente.nuevoEstado === 'activo' ? 'Usuario activado' : 'Usuario inactivado',
        {
          description: `${usuarioEstadoPendiente.usuario.nombre} ${usuarioEstadoPendiente.usuario.apellido} ahora está ${
            usuarioEstadoPendiente.nuevoEstado === 'activo' ? 'activo' : 'inactivo'
          }.`,
        }
      );

      setIsEstadoModalOpen(false);
      setMotivoEstado('');
      setUsuarioEstadoPendiente(null);
      cargarUsuarios({
        q: searchDebounced.length >= 2 ? searchDebounced : '',
        rol: filtroRol,
        estado: filtroEstado,
      });
    } catch (error: any) {
      toast.error('No se pudo cambiar el estado', {
        description: error?.message || 'Ocurrió un error al actualizar el estado del usuario.',
      });
      cargarUsuarios({
        q: searchDebounced.length >= 2 ? searchDebounced : '',
        rol: filtroRol,
        estado: filtroEstado,
      });
    }
  };

  const handleAdd = () => {
    setSelectedUsuario(null);
    setFormData({
      nombre: '',
      apellido: '',
      tipoDocumento: 'CC',
      numeroDocumento: '',
      direccion: '',
      email: '',
      telefono: '',
      password: '',
      rol: rolesActivos[0]?.nombre ?? '',
      estado: 'activo'
    });
    setShowPasswordNote(true);
    setIsModalOpen(true);
  };

  const handleEdit = (usuario: Usuario) => {
    if (usuario.estado === 'inactivo') {
      toast.warning('Usuario inactivo', {
        description: 'No se puede editar un usuario inactivo. Reactivelo primero.',
      });
      return;
    }
    setSelectedUsuario(usuario);
    setFormData({
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      tipoDocumento: usuario.tipoDocumento,
      numeroDocumento: usuario.numeroDocumento,
      direccion: usuario.direccion,
      email: usuario.email,
      telefono: usuario.telefono,
      password: '', // No mostramos la contraseña actual
      rol: usuario.rol,
      estado: usuario.estado
    });
    setIsModalOpen(true);
  };

  const handleDelete = (usuario: Usuario) => {
    // Verificar si el usuario está activo
    if (usuario.estado === 'activo') {
      toast.warning('Advertencia de eliminación', {
        description: 'Está intentando eliminar un usuario activo. Se recomienda inactivarlo antes de eliminarlo.'
      });
    }

    setSelectedUsuario(usuario);
    setMotivoEliminacion('');
    setAlertState({
      isOpen: true,
      title: 'Confirmar eliminación',
      description: '',
      type: 'danger',
      onConfirm: () => {}
    });
  };

  const confirmarEliminacion = async () => {
    if (!selectedUsuario) return;

    // Validar motivo
    if (motivoEliminacion.length < 10 || motivoEliminacion.length > 50) {
      toast.error('Error de validación', {
        description: 'El motivo debe tener entre 10 y 50 caracteres'
      });
      return;
    }

    try {
      await api.usuarios.delete(selectedUsuario.id, motivoEliminacion);

      toast.success('Usuario eliminado', {
        description: 'El usuario ha sido eliminado exitosamente'
      });

      setAlertState({ isOpen: false, title: '', description: '', type: 'info', onConfirm: () => {} });
      setMotivoEliminacion('');
      setSelectedUsuario(null);
      cargarUsuarios();
    } catch (error: any) {
      toast.error('Error al eliminar usuario', { description: error.message });
    }
  };

  const handleView = async (usuario: Usuario) => {
    setSelectedUsuario(usuario);
    setIsDetailModalOpen(true);
    try {
      const detalle = await api.usuarios.getFullDetail(usuario.id);
      setSelectedUsuario((current) => (current?.id === usuario.id ? detalle : current));
    } catch (error: any) {
      toast.error('No se pudo cargar el detalle del usuario', {
        description: error?.message || 'Intente nuevamente en unos segundos.',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingUsuario) return;

    if (!formData.rol?.trim()) {
      toast.error('Seleccione un rol', {
        description:
          rolesActivos.length === 0
            ? 'No hay roles activos en el sistema. Cree un rol en Gestión de roles.'
            : 'Elija un rol de la lista.',
      });
      return;
    }

    // Validaciones
    if (!validarEmail(formData.email)) {
      toast.error('Email inválido', {
        description: 'Por favor ingrese un email válido'
      });
      return;
    }

    if (!validarTelefono(formData.telefono)) {
      toast.error('Teléfono inválido', {
        description: 'Debe contener exactamente 10 dígitos.',
      });
      return;
    }

    if (!validarDocumento(formData.numeroDocumento)) {
      toast.error('Documento inválido', {
        description: 'El documento debe tener entre 6 y 12 dígitos.',
      });
      return;
    }

    if (documentoDuplicadoU) {
      toast.error('Documento duplicado', { description: documentoDuplicadoU });
      return;
    }
    if (telefonoDuplicadoU) {
      toast.error('Teléfono duplicado', { description: telefonoDuplicadoU });
      return;
    }
    if (emailDuplicadoU) {
      toast.error('Correo duplicado', { description: emailDuplicadoU });
      return;
    }

    if (!selectedUsuario && !validarPassword(formData.password)) {
      toast.error('Contraseña inválida', {
        description: 'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y números'
      });
      return;
    }

    // Validar contraseña en edición si se ingresó
    if (selectedUsuario && formData.password && !validarPassword(formData.password)) {
      toast.error('Contraseña inválida', {
        description: 'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y números'
      });
      return;
    }

    try {
      setIsSavingUsuario(true);
      if (selectedUsuario) {
        // Actualizar
        const updates: any = { ...formData };
        if (!formData.password) {
          delete updates.password; // No actualizar contraseña si está vacía
        }

        await api.usuarios.update(selectedUsuario.id, updates, 'Actualización de datos');

        toast.success('Usuario actualizado exitosamente', {
          description: `Los datos de ${formData.nombre} ${formData.apellido} han sido actualizados correctamente.`
        });
      } else {
        // Crear
        await api.usuarios.create(formData);

        toast.success('Usuario creado exitosamente', {
          description: `Se ha enviado un email de bienvenida a ${formData.email}`
        });
      }

      setIsModalOpen(false);
      cargarUsuarios();
    } catch (error: any) {
      toast.error(selectedUsuario ? 'Error al actualizar usuario' : 'Error al crear usuario', {
        description: error.message
      });
    } finally {
      setIsSavingUsuario(false);
    }
  };

  // Mostrar el spinner SOLO en la carga inicial (cuando aún no hay datos).
  // En recargas posteriores (al filtrar/buscar) mantenemos la UI montada para no
  // perder el foco del input de búsqueda mientras el usuario sigue escribiendo.
  if (loading && usuarios.length === 0 && !searchQuery && filtroRol === 'Todos' && filtroEstado === 'Todos') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Usuarios</h2>
          <p className="text-muted-foreground">Administra los usuarios del sistema</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Usuario
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-border p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar ..."
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="Todos">Filtrar por rol</option>
              {rolesAsignables.map((r) => (
                <option key={r.id} value={r.nombre}>
                  {r.nombre}
                </option>
              ))}
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[120px]"
            >
              <option value="Todos">Filtrar por estado</option>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setFiltroRol('Todos');
                setFiltroEstado('Todos');
              }}
              className="px-4"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={usuariosFiltrados}
        actions={[
          {
            label: 'Ver',
            icon: <Eye className="w-4 h-4" />,
            onClick: handleView,
            variant: 'default'
          },
          {
            label: 'Editar',
            icon: <Edit className="w-4 h-4" />,
            onClick: handleEdit,
            variant: 'default',
            disabled: (row: Usuario) => row.estado === 'inactivo',
            disabledTitle: 'No se puede editar un usuario inactivo. Reactivelo primero.',
          },
          {
            label: 'Eliminar',
            icon: <Trash2 className="w-4 h-4" />,
            onClick: handleDelete,
            variant: 'danger'
          }
        ]}
      />

      {/* Modal de Nuevo/Editar Usuario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedUsuario ? 'Editar Usuario' : 'Nuevo Usuario'}
      >
        <Form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Nombre"
              name="nombre"
              value={formData.nombre}
              onChange={(value) => setFormData({ ...formData, nombre: value as string })}
              placeholder="Ej: Juan"
              required
            />

            <FormField
              label="Apellido"
              name="apellido"
              value={formData.apellido}
              onChange={(value) => setFormData({ ...formData, apellido: value as string })}
              placeholder="Ej: Pérez"
              required
            />
          </div>

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
                { value: 'Pasaporte', label: 'Pasaporte' }
              ]}
              required
            />

            <FormField
              label="Número de Documento"
              name="numeroDocumento"
              value={formData.numeroDocumento}
              onChange={(value) => setFormData({ ...formData, numeroDocumento: value as string })}
              placeholder="Ej: 1032456789"
              required
              inputDigitRule="documento6to12"
              hideAutoHelper
              error={documentoDuplicadoU || undefined}
            />
          </div>

          <FormField
            label="Dirección"
            name="direccion"
            value={formData.direccion}
            onChange={(value) => setFormData({ ...formData, direccion: value as string })}
            placeholder="Ej: Calle 10 #45-67, Medellín"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(value) => setFormData({ ...formData, email: value as string })}
              placeholder="ejemplo@email.com"
              required
              error={emailDuplicadoU || undefined}
            />

            <FormField
              label="Teléfono"
              name="telefono"
              value={formData.telefono}
              onChange={(value) => setFormData({ ...formData, telefono: value as string })}
              placeholder="3001234567"
              required
              inputDigitRule="telefono10"
              hideAutoHelper
              error={telefonoDuplicadoU || undefined}
            />
          </div>

          <FormField
            label={selectedUsuario ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
            name="password"
            type="password"
            value={formData.password}
            onChange={(value) => setFormData({ ...formData, password: value as string })}
            placeholder="Mínimo 8 caracteres"
            required={!selectedUsuario}
            minLength={8}
          />

          {showPasswordNote ? (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-blue-700">
                  <strong>Nota:</strong> La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y números para mayor seguridad.
                </p>
                <button
                  type="button"
                  onClick={() => setShowPasswordNote(false)}
                  className="rounded-md p-1 text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-900"
                  aria-label="Cerrar nota informativa"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Rol"
              name="rol"
              type="select"
              value={formData.rol}
              onChange={(value) => setFormData({ ...formData, rol: String(value ?? '') })}
              options={opcionesRolModal}
              selectPlaceholder={opcionesRolModal.length === 0}
              required
            />
            {opcionesRolModal.length === 0 && (
              <p className="text-sm text-muted-foreground -mt-2">
                No hay roles activos disponibles. Cree o active roles en la sección de gestión de roles.
              </p>
            )}

            <FormField
              label="Estado"
              name="estado"
              type="select"
              value={formData.estado}
              onChange={(value) => setFormData({ ...formData, estado: value as any })}
              options={[
                { value: 'activo', label: 'Activo' },
                { value: 'inactivo', label: 'Inactivo' }
              ]}
              required
            />
          </div>

          <FormActions>
            <Button variant="outline" disabled={isSavingUsuario} onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSavingUsuario}>
              {isSavingUsuario
                ? 'Guardando...'
                : `${selectedUsuario ? 'Actualizar' : 'Crear'} Usuario`}
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de Detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedUsuario(null);
        }}
        title={`Detalle de Usuario`}
        size="lg"
      >
        {selectedUsuario && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Nombre Completo</p>
                <p className="font-medium">{selectedUsuario.nombre} {selectedUsuario.apellido}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Documento</p>
                <p className="font-medium">{selectedUsuario.tipoDocumento} {selectedUsuario.numeroDocumento}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{selectedUsuario.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Teléfono</p>
                <p className="font-medium">{selectedUsuario.telefono}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Dirección</p>
                <p className="font-medium">{selectedUsuario.direccion}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rol</p>
                <p className="font-medium">{selectedUsuario.rol}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedUsuario.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedUsuario.estado === 'activo' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Último inicio de sesión</p>
                <p className="font-medium">
                  {selectedUsuario.ultimoInicioSesion
                    ? new Date(selectedUsuario.ultimoInicioSesion).toLocaleString('es-CO')
                    : 'Sin registros'}
                </p>
              </div>
            </div>

            {/* Historial de cambios */}
            {selectedUsuario.historialCambios && selectedUsuario.historialCambios.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium mb-3">Historial de Cambios</h4>
                <div className="space-y-2">
                  {selectedUsuario.historialCambios.map((cambio, index) => (
                    <div key={index} className="p-3 bg-accent/30 rounded-lg text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium">{cambio.accion}</span>
                        <span className="text-muted-foreground text-xs">
                          {new Date(cambio.fecha).toLocaleString('es-CO')}
                        </span>
                      </div>
                      {cambio.motivo && (
                        <p className="text-muted-foreground">{cambio.motivo}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedUsuario(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Cambio de Estado */}
      <Modal
        isOpen={isEstadoModalOpen}
        onClose={() => {
          setIsEstadoModalOpen(false);
          setMotivoEstado('');
          setUsuarioEstadoPendiente(null);
        }}
        title="Cambiar Estado de Usuario"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Está a punto de cambiar el estado del usuario{' '}
            <strong>
              {usuarioEstadoPendiente?.usuario.nombre} {usuarioEstadoPendiente?.usuario.apellido}
            </strong>{' '}
            a{' '}
            <strong>
              {usuarioEstadoPendiente?.nuevoEstado === 'activo' ? 'Activo' : 'Inactivo'}
            </strong>
            .
          </p>

          <FormField
            label="Motivo del cambio"
            name="motivo"
            type="textarea"
            value={motivoEstado}
            onChange={(value) => setMotivoEstado(value as string)}
            placeholder="Ingrese el motivo del cambio de estado (10-50 caracteres)"
            required
            minLength={10}
            maxLength={50}
          />

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setIsEstadoModalOpen(false);
                setMotivoEstado('');
                setUsuarioEstadoPendiente(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarCambioEstado}>
              Confirmar Cambio
            </Button>
          </FormActions>
        </div>
      </Modal>

      {/* AlertDialog de Eliminación */}
      <Modal
        isOpen={alertState.isOpen}
        onClose={() => {
          setAlertState({ isOpen: false, title: '', description: '', type: 'info', onConfirm: () => {} });
          setMotivoEliminacion('');
          setSelectedUsuario(null);
        }}
        title="Confirmar Eliminación de Usuario"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>¡Advertencia!</strong> Está a punto de eliminar al usuario{' '}
              <strong>{selectedUsuario?.nombre} {selectedUsuario?.apellido}</strong>.
            </p>
            <p className="text-sm text-red-700 mt-2">
              Esta acción no se puede deshacer.
            </p>
          </div>

          {/* Warning adicional para usuario activo */}
          {selectedUsuario?.estado === 'activo' && (
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-700">
                <strong>⚠️ Advertencia:</strong> Este usuario está activo. Se recomienda inactivarlo antes de eliminarlo para evitar problemas con registros asociados.
              </p>
            </div>
          )}

          <FormField
            label="Motivo de la eliminación"
            name="motivoEliminacion"
            type="textarea"
            value={motivoEliminacion}
            onChange={(value) => setMotivoEliminacion(value as string)}
            placeholder="Ingrese el motivo de la eliminación (10-50 caracteres)"
            required
            minLength={10}
            maxLength={50}
          />

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setAlertState({ isOpen: false, title: '', description: '', type: 'info', onConfirm: () => {} });
                setMotivoEliminacion('');
                setSelectedUsuario(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarEliminacion}>
              Confirmar Eliminación
            </Button>
          </FormActions>
        </div>
      </Modal>
    </div>
  );
}

