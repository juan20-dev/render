import React, { useEffect, useMemo, useState } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Form, FormField, FormActions, FieldError, FieldHelper } from '../../Form';
import { Plus, Shield, Check, X } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';

interface Role {
  id: number;
  nombre: string;
  descripcion: string;
  permisos: string[];
  estado: 'Activo' | 'Inactivo';
  usuarios: number;
}

// Lista de todos los permisos disponibles en el sistema
const todosLosPermisos = [
  // Dashboard
  { modulo: 'Dashboard', permiso: 'Ver Dashboard' },
  
  // Usuarios
  { modulo: 'Usuarios', permiso: 'Ver Usuarios' },
  { modulo: 'Usuarios', permiso: 'Crear Usuarios' },
  { modulo: 'Usuarios', permiso: 'Editar Usuarios' },
  { modulo: 'Usuarios', permiso: 'Eliminar Usuarios' },
  
  // Roles
  { modulo: 'Configuración', permiso: 'Ver Roles' },
  { modulo: 'Configuración', permiso: 'Asignar Permisos' },
  
  // Compras
  { modulo: 'Compras', permiso: 'Ver Proveedores' },
  { modulo: 'Compras', permiso: 'Crear Proveedores' },
  { modulo: 'Compras', permiso: 'Editar Proveedores' },
  { modulo: 'Compras', permiso: 'Ver Compras' },
  { modulo: 'Compras', permiso: 'Registrar Compras' },
  { modulo: 'Compras', permiso: 'Anular Compras' },
  { modulo: 'Compras', permiso: 'Ver Productos' },
  { modulo: 'Compras', permiso: 'Crear Productos' },
  { modulo: 'Compras', permiso: 'Editar Productos' },
  { modulo: 'Compras', permiso: 'Ver Categorías' },
  { modulo: 'Compras', permiso: 'Crear Categorías' },
  
  // Producción
  { modulo: 'Producción', permiso: 'Ver Insumos' },
  { modulo: 'Producción', permiso: 'Entregar Insumos' },
  { modulo: 'Producción', permiso: 'Ver Producción' },
  { modulo: 'Producción', permiso: 'Registrar Producción' },
  
  // Ventas
  { modulo: 'Ventas', permiso: 'Ver Clientes' },
  { modulo: 'Ventas', permiso: 'Crear Clientes' },
  { modulo: 'Ventas', permiso: 'Editar Clientes' },
  { modulo: 'Ventas', permiso: 'Ver Ventas' },
  { modulo: 'Ventas', permiso: 'Registrar Ventas' },
  { modulo: 'Ventas', permiso: 'Anular Ventas' },
  { modulo: 'Ventas', permiso: 'Ver Abonos' },
  { modulo: 'Ventas', permiso: 'Registrar Abonos' },
  { modulo: 'Ventas', permiso: 'Ver Pedidos' },
  { modulo: 'Ventas', permiso: 'Crear Pedidos' },
  { modulo: 'Ventas', permiso: 'Ver Domicilios' },
  { modulo: 'Ventas', permiso: 'Gestionar Domicilios' },
];

const moduloPorPermiso = (permiso: string) => {
  const p = permiso.toLowerCase();
  if (p.includes('dashboard')) return 'Dashboard';
  if (p.includes('usuarios') || p.includes('roles') || p.includes('permisos')) return 'Usuarios';
  if (p.includes('proveedor') || p.includes('compra') || p.includes('producto') || p.includes('categor')) return 'Compras';
  if (p.includes('insumo') || p.includes('producci')) return 'Producción';
  if (p.includes('cliente') || p.includes('venta') || p.includes('abono') || p.includes('pedido') || p.includes('domicilio')) return 'Ventas';
  return 'Otros';
};

export function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState<string>('Todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todos');
  const [filtroModuloPermisos, setFiltroModuloPermisos] = useState<string>('Todos');
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    estado: 'Activo' as 'Activo' | 'Inactivo',
    permisos: [] as string[]
  });
  // Estado de validación inline para el campo "Nombre del Rol".
  const [nombreError, setNombreError] = useState<string>('');
  const { showAlert, AlertComponent } = useAlertDialog();

  // Valida el nombre del rol localmente con mensajes claros para el usuario.
  // Devuelve string vacío si es válido, o el mensaje a mostrar.
  const validarNombreRol = (nombreRaw: string, idActual?: number): string => {
    const nombre = nombreRaw.trim();
    if (!nombre) return 'El nombre del rol es obligatorio.';
    if (nombre.length < 3) return `Faltan ${3 - nombre.length} carácter(es). Mínimo 3.`;
    if (nombre.length > 50) return 'El nombre no puede superar los 50 caracteres.';
    if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s_\-]+$/.test(nombre)) {
      return 'Solo se permiten letras, números, espacios, guiones (-) o guion bajo (_).';
    }
    const repetido = roles.some(
      (r) => r.nombre.toLowerCase() === nombre.toLowerCase() && r.id !== idActual
    );
    if (repetido) return `Ya existe un rol con el nombre "${nombre}". Elija un nombre diferente.`;
    return '';
  };

  const cargarRoles = async () => {
    try {
      setLoading(true);
      const data = await api.roles.getAll();
      const mapped = (Array.isArray(data) ? data : []).map((r: any) => ({
        id: Number(r.id),
        nombre: String(r.nombre || ''),
        descripcion: String(r.descripcion || ''),
        permisos: Array.isArray(r.permisos) ? r.permisos : [],
        estado: String(r.estado || 'Activo') === 'Inactivo' ? 'Inactivo' : 'Activo',
        usuarios: Number(r.usuarios ?? 0),
      })) as Role[];
      setRoles(mapped);
    } catch (error: any) {
      toast.error('Error al cargar roles', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarRoles();
  }, []);

  const columns: Column[] = [
    { key: 'nombre', label: 'Rol' },
    { key: 'descripcion', label: 'Descripción' },
    { 
      key: 'permisos', 
      label: 'Permisos Asignados',
      render: (permisos: string[]) => (
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-primary/10 text-primary rounded-full">
            {permisos.length} permisos
          </span>
        </div>
      )
    },
    { 
      key: 'usuarios', 
      label: 'Usuarios',
      render: (value: number) => `${value} usuario${value !== 1 ? 's' : ''}`
    },
    { 
      key: 'estado', 
      label: 'Estado',
      render: (estado: string, role: Role) => (
        <select
          value={estado}
          onChange={(e) => handleEstadoChange(role.id, e.target.value as 'Activo' | 'Inactivo')}
          className="px-3 py-1 rounded-full text-xs border-0 cursor-pointer"
          style={{
            backgroundColor: estado === 'Activo' ? '#dcfce7' : '#fee2e2',
            color: estado === 'Activo' ? '#166534' : '#991b1b',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
      )
    }
  ];

  const handleEstadoChange = async (id: number, nuevoEstado: 'Activo' | 'Inactivo') => {
    try {
      const rol = roles.find((r) => r.id === id);
      if (!rol) return;
      await api.roles.update(id, {
        nombre: rol.nombre,
        descripcion: rol.descripcion,
        estado: nuevoEstado,
      });
      toast.success('Estado del rol actualizado');
      await cargarRoles();
    } catch (error: any) {
      toast.error('No se pudo actualizar el estado', { description: error.message });
      await cargarRoles();
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();

    const errorNombre = validarNombreRol(formData.nombre);
    if (errorNombre) {
      setNombreError(errorNombre);
      toast.warning('Revise el nombre del rol', { description: errorNombre });
      return;
    }
    if (formData.descripcion.trim().length < 10) {
      toast.warning('Descripción demasiado corta', {
        description: 'La descripción del rol debe tener al menos 10 caracteres.',
      });
      return;
    }
    if (formData.permisos.length === 0) {
      toast.warning('Asigne al menos un permiso', {
        description: 'Cada rol debe tener al menos un permiso seleccionado.',
      });
      return;
    }

    try {
      const created = await api.roles.create({
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim(),
        estado: formData.estado,
        permisos: formData.permisos,
      });
      if (created?.id && formData.permisos.length > 0) {
        await api.roles.updatePermisos(Number(created.id), formData.permisos, 'Asignación inicial de permisos');
      }
      toast.success('Rol creado exitosamente', {
        description: `El rol "${formData.nombre.trim()}" se registró correctamente.`,
      });
      setIsCreateModalOpen(false);
      setNombreError('');
      setFormData({ nombre: '', descripcion: '', estado: 'Activo', permisos: [] });
      await cargarRoles();
    } catch (error: any) {
      toast.error('No se pudo crear el rol', {
        description: error?.message || 'Ocurrió un error inesperado al guardar el rol.',
      });
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    const errorNombre = validarNombreRol(formData.nombre, selectedRole.id);
    if (errorNombre) {
      setNombreError(errorNombre);
      toast.warning('Revise el nombre del rol', { description: errorNombre });
      return;
    }
    if (formData.descripcion.trim().length < 10) {
      toast.warning('Descripción demasiado corta', {
        description: 'La descripción del rol debe tener al menos 10 caracteres.',
      });
      return;
    }

    try {
      await api.roles.update(selectedRole.id, {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim(),
        estado: formData.estado,
      });
      toast.success('Cambios guardados', {
        description: `Los datos del rol "${formData.nombre.trim()}" se actualizaron correctamente.`,
      });
      setIsEditModalOpen(false);
      setSelectedRole(null);
      setNombreError('');
      setFormData({ nombre: '', descripcion: '', estado: 'Activo', permisos: [] });
      await cargarRoles();
    } catch (error: any) {
      toast.error('No se pudo actualizar el rol', {
        description: error?.message || 'Ocurrió un error inesperado al guardar los cambios.',
      });
    }
  };

  const handleEdit = (role: Role) => {
    setSelectedRole(role);
    setFormData({ nombre: role.nombre, descripcion: role.descripcion, estado: role.estado, permisos: role.permisos });
    setIsEditModalOpen(true);
  };

  const handleDelete = (role: Role) => {
    if (role.usuarios > 0) {
      showAlert({
        title: 'No se puede eliminar',
        description: `No se puede eliminar el rol ${role.nombre} porque tiene ${role.usuarios} usuario(s) asignado(s).`,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }
    showAlert({
      title: '¿Eliminar rol?',
      description: `¿Está seguro de eliminar el rol ${role.nombre}?`,
      type: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      onConfirm: () => {
        api.roles
          .delete(role.id, 'Eliminación desde panel de roles')
          .then(() => {
            toast.success('Rol eliminado');
            cargarRoles();
          })
          .catch((error: any) => {
            toast.error('No se pudo eliminar el rol', { description: error.message });
          });
      }
    });
  };

  const handleView = (role: Role) => {
    setSelectedRole(role);
    setIsDetailModalOpen(true);
  };

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role);
    setSelectedPermissions(role.permisos);
    setFiltroModuloPermisos('Todos');
    setIsPermissionsModalOpen(true);
  };

  const togglePermission = (permiso: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permiso)
        ? prev.filter(p => p !== permiso)
        : [...prev, permiso]
    );
  };

  const handleSavePermissions = async () => {
    if (selectedRole) {
      try {
        await api.roles.updatePermisos(
          selectedRole.id,
          selectedPermissions,
          `Actualización de permisos para rol ${selectedRole.nombre}`
        );
        toast.success('Permisos actualizados');
        setIsPermissionsModalOpen(false);
        await cargarRoles();
      } catch (error: any) {
        toast.error('No se pudieron actualizar permisos', { description: error.message });
      }
    }
  };

  // Filtrar roles
  const rolesFiltrados = roles.filter(rol => {
    const matchBusqueda = busqueda.length === 0 ||
      busqueda.length >= 2 &&
      (rol.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
       rol.descripcion.toLowerCase().includes(busqueda.toLowerCase()));

    const matchRol = filtroRol === 'Todos' || rol.nombre === filtroRol;
    const matchEstado = filtroEstado === 'Todos' || rol.estado === filtroEstado;

    return matchBusqueda && matchRol && matchEstado;
  });

  const permisosDisponibles = useMemo(() => {
    const backendPerms = roles.flatMap((r) => r.permisos || []);
    const fallback = todosLosPermisos.map((p) => p.permiso);
    return [...new Set([...backendPerms, ...fallback])].sort((a, b) => a.localeCompare(b));
  }, [roles]);

  // Agrupar permisos por módulo
  const permisosPorModulo = useMemo(
    () =>
      permisosDisponibles.reduce((acc, permiso) => {
        const modulo = moduloPorPermiso(permiso);
        if (!acc[modulo]) acc[modulo] = [];
        acc[modulo].push(permiso);
        return acc;
      }, {} as { [key: string]: string[] }),
    [permisosDisponibles]
  );

  // Solo mostramos el spinner a pantalla completa en la carga inicial.
  // Si ya hay datos en pantalla, mantenemos la UI montada para que la
  // barra de búsqueda no pierda el foco mientras el usuario escribe.
  if (loading && roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando roles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {AlertComponent}
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Roles</h2>
          <p className="text-muted-foreground">Administra los roles y sus permisos en el sistema</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={() => setIsCreateModalOpen(true)}>
          Nuevo Rol
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-border p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar... (mín. 2, máx. 50 caracteres)"
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[160px] text-gray-500"
            >
              <option value="Todos">Filtrar por rol</option>
              <option value="Administrador">Administrador</option>
              <option value="Asesor">Asesor</option>
              <option value="Productor">Productor</option>
              <option value="Repartidor">Repartidor</option>
              <option value="Cliente">Cliente</option>
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px] text-gray-500"
            >
              <option value="Todos">Filtrar por estado</option>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
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
        data={rolesFiltrados}
        actions={[
          commonActions.view(handleView),
          {
            label: 'Gestionar Permisos',
            icon: <Shield className="w-4 h-4" />,
            onClick: handleManagePermissions,
            variant: 'default'
          },
          commonActions.edit(handleEdit),
          commonActions.delete(handleDelete)
        ]}
      />

      {/* Modal de Crear Rol */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNombreError('');
          setFormData({ nombre: '', descripcion: '', estado: 'Activo', permisos: [] });
        }}
        title="Crear Nuevo Rol"
        size="lg"
      >
        <Form onSubmit={handleCreateRole}>
          <div>
            <label className="block text-sm font-medium mb-2">
              Nombre del Rol <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, nombre: value });
                setNombreError(validarNombreRol(value));
              }}
              placeholder="Ej: Supervisor, Contador, etc. (3 a 50 caracteres)"
              maxLength={50}
              minLength={3}
              className={`w-full px-4 py-2 bg-input-background border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                nombreError
                  ? 'border-destructive ring-1 ring-destructive/20 focus:ring-destructive'
                  : 'border-border focus:ring-ring'
              }`}
              required
            />
            <div className="mt-1.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {nombreError ? (
                  <FieldError>{nombreError}</FieldError>
                ) : (
                  <FieldHelper>Debe tener entre 3 y 50 caracteres.</FieldHelper>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap pt-1">{formData.nombre.length}/50</span>
            </div>
          </div>

          <FormField
            label="Estado"
            name="estado"
            type="select"
            value={formData.estado}
            onChange={(value) => setFormData({ ...formData, estado: value as 'Activo' | 'Inactivo' })}
            options={[
              { value: 'Activo', label: 'Activo' },
              { value: 'Inactivo', label: 'Inactivo' }
            ]}
            required
          />

          <FormField
            label="Descripción"
            name="descripcion"
            type="textarea"
            value={formData.descripcion}
            onChange={(value) => setFormData({ ...formData, descripcion: value as string })}
            rows={3}
            required
          />

          {/* Permisos Asignables */}
          <div className="space-y-3">
            <label className="block">Permisos Asignables</label>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-3">
              <span className="text-sm">Permisos seleccionados: <strong>{formData.permisos.length}</strong> de {permisosDisponibles.length}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ ...formData, permisos: permisosDisponibles })}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ ...formData, permisos: [] })}
                >
                  Ninguno
                </Button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-3 border border-border rounded-lg p-3">
              {Object.entries(permisosPorModulo).map(([modulo, permisos]) => (
                <div key={modulo}>
                  <h4 className="text-sm text-primary mb-2">{modulo}</h4>
                  <div className="grid grid-cols-1 gap-2 mb-3">
                    {permisos.map((permiso) => {
                      const isSelected = formData.permisos.includes(permiso);
                      return (
                        <label
                          key={permiso}
                          className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setFormData({
                                ...formData,
                                permisos: isSelected
                                  ? formData.permisos.filter(p => p !== permiso)
                                  : [...formData.permisos, permiso]
                              });
                            }}
                            className="w-4 h-4 text-primary"
                          />
                          <span className="text-sm">{permiso}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                setFormData({ nombre: '', descripcion: '', estado: 'Activo', permisos: [] });
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Crear Rol
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de Editar Rol */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedRole(null);
          setNombreError('');
          setFormData({ nombre: '', descripcion: '', estado: 'Activo', permisos: [] });
        }}
        title={`Editar Rol - ${selectedRole?.nombre}`}
        size="md"
      >
        <Form onSubmit={handleUpdateRole}>
          <div>
            <label className="block text-sm font-medium mb-2">
              Nombre del Rol <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, nombre: value });
                setNombreError(validarNombreRol(value, selectedRole?.id));
              }}
              placeholder="Ej: Supervisor, Contador, etc. (3 a 50 caracteres)"
              maxLength={50}
              minLength={3}
              className={`w-full px-4 py-2 bg-input-background border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                nombreError
                  ? 'border-destructive ring-1 ring-destructive/20 focus:ring-destructive'
                  : 'border-border focus:ring-ring'
              }`}
              required
            />
            <div className="mt-1.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {nombreError ? (
                  <FieldError>{nombreError}</FieldError>
                ) : (
                  <FieldHelper>Debe tener entre 3 y 50 caracteres.</FieldHelper>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap pt-1">{formData.nombre.length}/50</span>
            </div>
          </div>

          <FormField
            label="Estado"
            name="estado"
            type="select"
            value={formData.estado}
            onChange={(value) => setFormData({ ...formData, estado: value as 'Activo' | 'Inactivo' })}
            options={[
              { value: 'Activo', label: 'Activo' },
              { value: 'Inactivo', label: 'Inactivo' }
            ]}
            required
          />

          <FormField
            label="Descripción"
            name="descripcion"
            type="textarea"
            value={formData.descripcion}
            onChange={(value) => setFormData({ ...formData, descripcion: value as string })}
            rows={3}
            required
          />

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-700">
              Para gestionar los permisos de este rol, usa el botón "Gestionar Permisos" en la tabla principal.
            </p>
          </div>

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setSelectedRole(null);
                setFormData({ nombre: '', descripcion: '', estado: 'Activo', permisos: [] });
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Guardar Cambios
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de Detalle */}
      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedRole(null);
        }}
        title={`Detalle de Rol - ${selectedRole?.nombre}`}
        size="lg"
      >
        {selectedRole && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Nombre del Rol</p>
                <p>{selectedRole.nombre}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedRole.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedRole.estado}
                </span>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Descripción</p>
                <p>{selectedRole.descripcion}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usuarios Asignados</p>
                <p>{selectedRole.usuarios} usuario{selectedRole.usuarios !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Permisos Asignados</p>
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs">
                  {selectedRole.permisos.length} permisos
                </span>
              </div>
            </div>

            <div className="p-4 bg-accent/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">Lista de Permisos</p>
              {selectedRole.permisos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedRole.permisos.map((permiso) => (
                    <div key={permiso} className="flex items-center gap-2 p-2 bg-background rounded border">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-sm">{permiso}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sin permisos asignados</p>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedRole(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Gestión de Permisos */}
      <Modal
        isOpen={isPermissionsModalOpen}
        onClose={() => {
          setIsPermissionsModalOpen(false);
          setFiltroModuloPermisos('Todos');
        }}
        title={`Gestionar Permisos - ${selectedRole?.nombre}`}
        size="lg"
      >
        <div className="space-y-6">
          <div className="p-4 bg-accent rounded-lg">
            <p className="text-sm text-muted-foreground">
              Selecciona los permisos que deseas asignar al rol <strong>{selectedRole?.nombre}</strong>.
              Los permisos activos están marcados con una palomita verde.
            </p>
          </div>

          <div className="space-y-4">
            {/* Contador de permisos */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span>Permisos seleccionados: <strong>{selectedPermissions.length}</strong> de {permisosDisponibles.length}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPermissions(permisosDisponibles)}
                >
                  Seleccionar Todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPermissions([])}
                >
                  Quitar Todos
                </Button>
              </div>
            </div>

            {/* Botones de filtro por módulo */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFiltroModuloPermisos('Todos')}
                className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                  filtroModuloPermisos === 'Todos'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroModuloPermisos('Dashboard')}
                className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                  filtroModuloPermisos === 'Dashboard'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setFiltroModuloPermisos('Usuarios')}
                className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                  filtroModuloPermisos === 'Usuarios'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                }`}
              >
                Usuarios
              </button>
              <button
                onClick={() => setFiltroModuloPermisos('Configuración')}
                className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                  filtroModuloPermisos === 'Configuración'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                }`}
              >
                Configuración
              </button>
              <button
                onClick={() => setFiltroModuloPermisos('Compras')}
                className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                  filtroModuloPermisos === 'Compras'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                }`}
              >
                Compras
              </button>
              <button
                onClick={() => setFiltroModuloPermisos('Producción')}
                className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                  filtroModuloPermisos === 'Producción'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                }`}
              >
                Producción
              </button>
              <button
                onClick={() => setFiltroModuloPermisos('Ventas')}
                className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                  filtroModuloPermisos === 'Ventas'
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                }`}
              >
                Ventas
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {Object.entries(permisosPorModulo)
              .filter(([modulo]) => filtroModuloPermisos === 'Todos' || modulo === filtroModuloPermisos)
              .map(([modulo, permisos]) => (
                <Card key={modulo}>
                  <h4 className="mb-3 text-primary">{modulo}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {permisos.map((permiso) => {
                      const isSelected = selectedPermissions.includes(permiso);
                      return (
                        <button
                          key={permiso}
                          onClick={() => togglePermission(permiso)}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className={`flex items-center justify-center w-5 h-5 rounded border-2 ${
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={isSelected ? 'text-foreground' : 'text-muted-foreground'}>
                            {permiso}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              ))}
          </div>

          <div className="flex gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => {
              setIsPermissionsModalOpen(false);
              setFiltroModuloPermisos('Todos');
            }} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSavePermissions} className="flex-1">
              Guardar Permisos
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}