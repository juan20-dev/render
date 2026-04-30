import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Form, FormField, FormActions } from '../../Form';
import { Plus, Shield, Check, RotateCcw, Search } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { roles as rolesAPI } from '../../../services/api';

interface Role {
  id: string;
  nombre: string;
  descripcion: string;
  permisos: string[];
  estado: 'Activo' | 'Inactivo';
  usuarios: number;
  usuarios_activos?: number;
  created_at?: string;
  updated_at?: string;
}

interface RoleAuditEntry {
  id: number;
  rol_id: number;
  accion: 'CREATE' | 'UPDATE' | 'DELETE';
  usuario_id?: number | null;
  usuario_nombre?: string | null;
  usuario_apellido?: string | null;
  cambios: {
    before?: any;
    after?: any;
    changedFields?: Record<string, { before: any; after: any }>;
  };
  created_at: string;
}

interface StateChangeRequest {
  roleId: string;
  roleName: string;
  currentState: 'Activo' | 'Inactivo';
  nextState: 'Activo' | 'Inactivo';
  assignedUsers: number;
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

  // Cliente (portal)
  { modulo: 'Cliente', permiso: 'Ver Dashboard' },
  { modulo: 'Cliente', permiso: 'Ver Tienda' },
  { modulo: 'Cliente', permiso: 'Ver Mis Pedidos' },
  { modulo: 'Cliente', permiso: 'Ver Mis Lista de Compras' },
  { modulo: 'Cliente', permiso: 'Ver Mis Domicilios' },
  
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

const CLIENTE_ROL_NOMBRE = 'cliente';
const CLIENTE_PERMISOS_FIJOS = [
  'Ver Dashboard',
  'Ver Tienda',
  'Ver Mis Pedidos',
  'Ver Mis Lista de Compras',
  'Ver Mis Domicilios',
];
const PERMISOS_CRITICOS = new Set([
  'Ver Dashboard',
  'Ver Usuarios',
  'Crear Usuarios',
  'Editar Usuarios',
  'Eliminar Usuarios',
  'Ver Roles',
  'Asignar Permisos',
  'Ver Proveedores',
  'Crear Proveedores',
  'Editar Proveedores',
  'Ver Compras',
  'Registrar Compras',
  'Anular Compras',
  'Ver Productos',
  'Crear Productos',
  'Editar Productos',
  'Ver Categorías',
  'Crear Categorías',
  'Ver Insumos',
  'Entregar Insumos',
  'Ver Producción',
  'Registrar Producción',
  'Ver Clientes',
  'Crear Clientes',
  'Editar Clientes',
  'Ver Ventas',
  'Registrar Ventas',
  'Anular Ventas',
  'Ver Abonos',
  'Registrar Abonos',
  'Ver Pedidos',
  'Crear Pedidos',
  'Ver Domicilios',
  'Gestionar Domicilios',
]);

const isClienteRoleName = (roleName?: string) =>
  typeof roleName === 'string' && roleName.trim().toLowerCase() === CLIENTE_ROL_NOMBRE;

const isAdminRoleName = (roleName?: string) =>
  typeof roleName === 'string' && roleName.trim().toLowerCase() === 'administrador';

const sanitizePermissionsByRoleName = (roleName: string | undefined, permissions: string[]) => {
  if (isClienteRoleName(roleName)) {
    const filtered = permissions.filter((permiso) => CLIENTE_PERMISOS_FIJOS.includes(permiso));
    return filtered.length > 0 ? filtered : [...CLIENTE_PERMISOS_FIJOS];
  }

  return permissions;
};

export function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    estado: 'Activo' as 'Activo' | 'Inactivo'
  });
  const [createFormData, setCreateFormData] = useState({
    nombre: '',
    descripcion: '',
    estado: 'Activo' as 'Activo' | 'Inactivo'
  });
  const [createPermissions, setCreatePermissions] = useState<string[]>([]);
  const [createNameError, setCreateNameError] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [roleAudit, setRoleAudit] = useState<RoleAuditEntry[]>([]);
  const [loadingRoleAudit, setLoadingRoleAudit] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingStateChange, setPendingStateChange] = useState<StateChangeRequest | null>(null);
  const [stateChangeReason, setStateChangeReason] = useState('');
  const [stateChangeSaving, setStateChangeSaving] = useState(false);
  const [createModuleFilter, setCreateModuleFilter] = useState('Todos');
  const [editModuleFilter, setEditModuleFilter] = useState('Todos');
  const [manageModuleFilter, setManageModuleFilter] = useState('Todos');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('Todos');
  const [roleStateFilter, setRoleStateFilter] = useState<'Todos' | 'Activo' | 'Inactivo'>('Todos');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonError, setDeleteReasonError] = useState('');
  const [deletingRole, setDeletingRole] = useState(false);
  const { showAlert, AlertComponent } = useAlertDialog();

  const resetCreateForm = () => {
    setCreateFormData({
      nombre: '',
      descripcion: '',
      estado: 'Activo'
    });
    setCreatePermissions([]);
    setCreateNameError('');
    setCreateModuleFilter('Todos');
  };

  const resetEditForm = () => {
    setSelectedRole(null);
    setFormData({ nombre: '', descripcion: '', estado: 'Activo' });
    setEditPermissions([]);
    setEditNameError('');
    setEditModuleFilter('Todos');
  };

  const resetRoleFilters = () => {
    setRoleSearchQuery('');
    setRoleFilter('Todos');
    setRoleStateFilter('Todos');
  };

  const normalizeRoleName = (value: string) => value.trim().toLowerCase();

  const isRoleNameInUse = (name: string, currentRoleId?: string) => {
    const normalizedName = normalizeRoleName(name);

    if (!normalizedName) return false;

    return roles.some((role) => {
      if (currentRoleId && role.id === currentRoleId) return false;
      return normalizeRoleName(role.nombre) === normalizedName;
    });
  };

  const validateRoleName = (name: string, currentRoleId?: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) return 'El nombre del rol es obligatorio.';
    if (trimmedName.length < 3) return 'El nombre del rol debe tener al menos 3 caracteres.';
    if (isRoleNameInUse(trimmedName, currentRoleId)) return 'Ya existe un rol con ese nombre.';

    return '';
  };

  const formatDateTime = (value?: string) => {
    if (!value) return 'Sin registro';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Sin registro';

    return parsed.toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const actionLabelMap: Record<string, string> = {
    CREATE: 'Creacion',
    UPDATE: 'Actualizacion',
    DELETE: 'Eliminacion',
  };

  const moduloPorPermiso = React.useMemo(
    () =>
      new Map<string, string>(
        todosLosPermisos.map(({ modulo, permiso }) => [permiso, modulo])
      ),
    []
  );

  const getPermissionRemovalError = (permissions: string[], permiso: string) => {
    if (!permissions.includes(permiso)) return '';

    if (permissions.length <= 1) {
      return 'Cada rol debe mantener al menos un permiso asignado.';
    }

    return '';
  };

  const validatePermissionsCount = (permissions: string[]) =>
    permissions.length > 0 ? '' : 'Cada rol debe mantener al menos un permiso asignado.';

  const createNameValidation = validateRoleName(createFormData.nombre);
  const editNameValidation = validateRoleName(formData.nombre, selectedRole?.id);
  const createStepOneValid =
    Boolean(createFormData.nombre.trim()) &&
    Boolean(createFormData.descripcion.trim()) &&
    Boolean(createFormData.estado) &&
    !createNameValidation;
  const editFormValid =
    Boolean(formData.nombre.trim()) &&
    Boolean(formData.descripcion.trim()) &&
    Boolean(formData.estado) &&
    !editNameValidation;
  const createCanSubmit = createStepOneValid && createPermissions.length > 0;
  const editCanSubmit = editFormValid && editPermissions.length > 0;
  const isCreatingClienteRole = isClienteRoleName(createFormData.nombre);
  const isEditingClienteRole = isClienteRoleName(formData.nombre);
  const isManagingClienteRole = isClienteRoleName(selectedRole?.nombre);

  const shouldConfirmCriticalPermission = (permiso: string) => {
    return PERMISOS_CRITICOS.has(permiso);
  };

  const getCriticalPermissionMessage = (permiso: string, action: 'agregar' | 'quitar') => {
    const modulo = moduloPorPermiso.get(permiso) || 'General';
    return `Vas a ${action} el permiso "${permiso}" del modulo ${modulo}. ¿Deseas continuar?`;
  };

  const validateDeleteReason = (reason: string) => {
    const trimmed = reason.trim();
    if (!trimmed) return 'El motivo de eliminación es obligatorio.';
    if (trimmed.length < 10) return 'El motivo debe tener al menos 10 caracteres.';
    if (trimmed.length > 200) return 'El motivo no puede superar los 200 caracteres.';
    return '';
  };

  const loadRoleAudit = async (roleId: string) => {
    try {
      setLoadingRoleAudit(true);
      const audit = await rolesAPI.getAuditById(Number(roleId));
      setRoleAudit(Array.isArray(audit) ? audit : []);
    } catch (error) {
      console.error('Error cargando auditoria del rol:', error);
      setRoleAudit([]);
    } finally {
      setLoadingRoleAudit(false);
    }
  };

  const toggleCreatePermission = (permiso: string) => {
    if (isCreatingClienteRole && !CLIENTE_PERMISOS_FIJOS.includes(permiso)) return;

    const isSelected = createPermissions.includes(permiso);

    if (isSelected) {
      const error = getPermissionRemovalError(createPermissions, permiso);
      if (error) {
        showAlert({
          title: 'Regla de permisos',
          description: error,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        return;
      }
    }

    const applyToggle = () => {
      setCreatePermissions((prev) =>
        prev.includes(permiso) ? prev.filter((item) => item !== permiso) : [...prev, permiso]
      );
    };

    if (shouldConfirmCriticalPermission(permiso)) {
      showAlert({
        title: 'Confirmar permiso critico',
        description: getCriticalPermissionMessage(permiso, isSelected ? 'quitar' : 'agregar'),
        type: 'warning',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        onConfirm: applyToggle
      });
      return;
    }

    applyToggle();
  };

  const toggleEditPermission = (permiso: string) => {
    if (isEditingClienteRole && !CLIENTE_PERMISOS_FIJOS.includes(permiso)) return;

    const isSelected = editPermissions.includes(permiso);

    if (isSelected) {
      const error = getPermissionRemovalError(editPermissions, permiso);
      if (error) {
        showAlert({
          title: 'Regla de permisos',
          description: error,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        return;
      }
    }

    const applyToggle = () => {
      setEditPermissions((prev) =>
        prev.includes(permiso) ? prev.filter((item) => item !== permiso) : [...prev, permiso]
      );
    };

    if (shouldConfirmCriticalPermission(permiso)) {
      showAlert({
        title: 'Confirmar permiso critico',
        description: getCriticalPermissionMessage(permiso, isSelected ? 'quitar' : 'agregar'),
        type: 'warning',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        onConfirm: applyToggle
      });
      return;
    }

    applyToggle();
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoadError(null);
      const data = await rolesAPI.getAll();
      const list = Array.isArray(data) ? data : (data && Array.isArray((data as any).data) ? (data as any).data : []);
      const normalized = list.map((r: any) => ({
        id: r?.id?.toString?.() ?? String(Math.random()),
        nombre: typeof r?.nombre === 'string' ? r.nombre : '',
        descripcion: typeof r?.descripcion === 'string' ? r.descripcion : '',
        permisos: Array.isArray(r?.permisos) ? r.permisos : [],
        estado: r?.estado === 'Inactivo' ? 'Inactivo' : 'Activo',
        usuarios: typeof r?.usuarios === 'number' ? r.usuarios : Number(r?.usuarios) || 0,
        usuarios_activos: typeof r?.usuarios_activos === 'number' ? r.usuarios_activos : Number(r?.usuarios_activos) || 0,
        created_at: r?.created_at ?? undefined,
        updated_at: r?.updated_at ?? undefined,
      } as Role));
      setRoles(normalized);
    } catch (error) {
      console.error('Error cargando roles:', error);
      setRoles([]);
      setLoadError('No fue posible cargar los roles. Revisa la consola para más detalles.');
      try {
        showAlert({
          title: 'Error cargando roles',
          description: 'No fue posible cargar la lista de roles. Intenta de nuevo o revisa la consola.',
          type: 'danger',
          confirmText: 'Cerrar'
        });
      } catch (e) {
        // fall back silently if alert system isn't available
      }
    }
  };

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
      render: (value: number, role: Role) => (
        <div className="space-y-1">
          <p>{value} usuario{value !== 1 ? 's' : ''}</p>
          <p className="text-xs text-muted-foreground">
            {role.usuarios_activos ?? 0} activo{(role.usuarios_activos ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
      )
    },
    { 
      key: 'estado', 
      label: 'Estado',
      render: (estado: string, role: Role) => (
        <select
          value={estado}
          onChange={(e) => handleEstadoChangeRequest(role, e.target.value as 'Activo' | 'Inactivo')}
          className={`min-h-8 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
      )
    },
    {
      key: 'updated_at',
      label: 'Ultima modificacion',
      render: (value: string) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(value)}</span>
      )
    }
  ];

  const handleEstadoChangeRequest = async (role: Role, nuevoEstado: 'Activo' | 'Inactivo') => {
    if (nuevoEstado === role.estado) return;

    // Refrescar siempre antes de validar para evitar conteos desactualizados
    await loadRoles();

    const freshRole = await rolesAPI.getById(Number(role.id)) as Role | null;
    const assignedUsers = freshRole?.usuarios ?? role.usuarios ?? 0;

    if (nuevoEstado === 'Inactivo' && assignedUsers > 0) {
      showAlert({
        title: 'No se puede desactivar',
        description: `El rol "${role.nombre}" tiene ${assignedUsers} usuario${assignedUsers !== 1 ? 's' : ''} activo${assignedUsers !== 1 ? 's' : ''} asignado${assignedUsers !== 1 ? 's' : ''}. Reasigna o elimina esos usuarios del rol antes de cambiar su estado.`,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    setPendingStateChange({
      roleId: role.id,
      roleName: role.nombre,
      currentState: role.estado,
      nextState: nuevoEstado,
      assignedUsers
    });
    setStateChangeReason('');
  };

  const handleConfirmStateChange = async () => {
    if (!pendingStateChange) return;

    const shouldRefreshAudit = selectedRole?.id === pendingStateChange.roleId;

    try {
      setStateChangeSaving(true);
      await rolesAPI.update(Number(pendingStateChange.roleId), {
        estado: pendingStateChange.nextState,
        motivo: stateChangeReason.trim() || undefined,
      });
      await loadRoles();

      const refreshedRole = await rolesAPI.getById(Number(pendingStateChange.roleId));
      if (refreshedRole) {
        setSelectedRole((prev) => (prev && prev.id === pendingStateChange.roleId ? refreshedRole : prev));
      }

      if (shouldRefreshAudit) {
        await loadRoleAudit(pendingStateChange.roleId);
      }

      setPendingStateChange(null);
      setStateChangeReason('');

      showAlert({
        title: 'Estado actualizado',
        description: `El rol ${pendingStateChange.roleName} cambió a ${pendingStateChange.nextState} correctamente.${stateChangeReason.trim() ? ` Motivo registrado: ${stateChangeReason.trim()}.` : ''}`,
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } catch (error) {
      console.error('Error cambiando estado:', error);
      showAlert({
        title: 'Error',
        description: (error as any)?.message || 'No se pudo cambiar el estado del rol',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } finally {
      setStateChangeSaving(false);
    }
  };

  const handleCancelStateChange = () => {
    setPendingStateChange(null);
    setStateChangeReason('');
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();

    setCreateNameError(createNameValidation);

    const nombreNormalizado = createFormData.nombre.trim();
    const nameValidationError = validateRoleName(nombreNormalizado);

    setCreateNameError(nameValidationError);

    if (nameValidationError) {
      showAlert({
        title: 'Nombre requerido',
        description: nameValidationError,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    const createPermissionsToSave = sanitizePermissionsByRoleName(createFormData.nombre, createPermissions);
    const permissionsValidationError = validatePermissionsCount(createPermissionsToSave);
    if (permissionsValidationError) {
      showAlert({
        title: 'Permisos requeridos',
        description: permissionsValidationError,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    try {
      const newRole = {
        nombre: nombreNormalizado,
        descripcion: createFormData.descripcion,
        permisos: createPermissionsToSave,
        estado: createFormData.estado
      };
      await rolesAPI.create(newRole);
      await loadRoles();
      setIsCreateModalOpen(false);
      resetCreateForm();
      showAlert({
        title: 'Éxito',
        description: 'Rol creado correctamente',
        type: 'success',
        confirmText: 'Aceptar',
        onConfirm: () => {}
      });
    } catch (error) {
      console.error('Error creando rol:', error);
      showAlert({
        title: 'Error',
          description: (error as any)?.message || 'No se pudo crear el rol',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole) {
      setEditNameError(editNameValidation);

      const nombreNormalizado = formData.nombre.trim();
      const nameValidationError = validateRoleName(nombreNormalizado, selectedRole.id);

      setEditNameError(nameValidationError);

      if (nameValidationError) {
        showAlert({
          title: 'Nombre requerido',
          description: nameValidationError,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        return;
      }

      const permissionsValidationError = validatePermissionsCount(editPermissions);
      const editPermissionsToSave = sanitizePermissionsByRoleName(formData.nombre, editPermissions);
      const normalizedPermissionsValidationError = validatePermissionsCount(editPermissionsToSave);
      if (permissionsValidationError || normalizedPermissionsValidationError) {
        showAlert({
          title: 'Permisos requeridos',
          description: permissionsValidationError || normalizedPermissionsValidationError,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        return;
      }

      try {
        await rolesAPI.update(Number(selectedRole.id), {
          nombre: nombreNormalizado,
          descripcion: formData.descripcion,
          estado: formData.estado,
          permisos: editPermissionsToSave,
        });
        await loadRoles();
        setIsEditModalOpen(false);
        setSelectedRole(null);
        setFormData({ nombre: '', descripcion: '', estado: 'Activo' });
        setEditPermissions([]);
        setEditNameError('');
        showAlert({
          title: 'Éxito',
          description: 'Rol actualizado correctamente',
          type: 'success',
          confirmText: 'Aceptar',
          onConfirm: () => {}
        });
      } catch (error) {
        console.error('Error actualizando rol:', error);
        showAlert({
          title: 'Error',
          description: (error as any)?.message || 'No se pudo actualizar el rol',
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      }
    }
  };

  const handleEdit = (role: Role) => {
    if (role.estado !== 'Activo') {
      showAlert({
        title: 'Rol desactivado',
        description: 'No puedes editar un rol desactivado. Actívalo primero para modificarlo.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    setSelectedRole(role);
    setFormData({ nombre: role.nombre, descripcion: role.descripcion, estado: role.estado || 'Activo' });
    setEditPermissions(sanitizePermissionsByRoleName(role.nombre, Array.isArray(role.permisos) ? role.permisos : []));
    setEditNameError('');
    setEditModuleFilter('Todos');
    loadRoleAudit(role.id);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (role: Role) => {
    if (isAdminRoleName(role?.nombre)) {
      showAlert({
        title: 'Rol protegido',
        description: 'El rol Administrador es primordial y no se puede eliminar.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    // Refrescar antes de validar para evitar conteos desactualizados
    await loadRoles();

    const freshRole = await rolesAPI.getById(Number(role.id)) as Role | null;
    const assignedUsers = freshRole?.usuarios ?? role.usuarios ?? 0;

    if (assignedUsers > 0) {
      showAlert({
        title: 'No se puede eliminar',
        description: `No se puede eliminar el rol "${role.nombre}" porque tiene ${assignedUsers} usuario${assignedUsers !== 1 ? 's' : ''} asignado${assignedUsers !== 1 ? 's' : ''}. Reasígnalos antes de eliminar el rol.`,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    setRoleToDelete(role);
    setDeleteReason('');
    setDeleteReasonError('');
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roleToDelete) return;

    const reasonError = validateDeleteReason(deleteReason);
    setDeleteReasonError(reasonError);
    if (reasonError) return;

    try {
      setDeletingRole(true);
      await rolesAPI.delete(Number(roleToDelete.id), { motivo: deleteReason.trim() });
      await loadRoles();

      setIsDeleteModalOpen(false);
      setRoleToDelete(null);
      setDeleteReason('');
      setDeleteReasonError('');

      showAlert({
        title: 'Rol eliminado',
        description: `El rol ${roleToDelete.nombre} fue eliminado correctamente. Motivo registrado: ${deleteReason.trim()}.`,
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } catch (error) {
      console.error('Error eliminando rol:', error);
      showAlert({
        title: 'Error al eliminar',
        description: (error as any)?.message || 'No se pudo eliminar el rol',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } finally {
      setDeletingRole(false);
    }
  };

  const handleView = (role: Role) => {
    setSelectedRole(role);
    loadRoleAudit(role.id);
    setIsDetailModalOpen(true);
  };

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role);
    setSelectedPermissions(sanitizePermissionsByRoleName(role.nombre, Array.isArray(role.permisos) ? role.permisos : []));
    setManageModuleFilter('Todos');
    loadRoleAudit(role.id);
    setIsPermissionsModalOpen(true);
  };

  const togglePermission = (permiso: string) => {
    if (isManagingClienteRole && !CLIENTE_PERMISOS_FIJOS.includes(permiso)) return;

    const isSelected = selectedPermissions.includes(permiso);

    if (isSelected) {
      const error = getPermissionRemovalError(selectedPermissions, permiso);
      if (error) {
        showAlert({
          title: 'Regla de permisos',
          description: error,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        return;
      }
    }

    const applyToggle = () => {
      setSelectedPermissions((prev) =>
        prev.includes(permiso) ? prev.filter((item) => item !== permiso) : [...prev, permiso]
      );
    };

    if (shouldConfirmCriticalPermission(permiso)) {
      showAlert({
        title: 'Confirmar permiso critico',
        description: getCriticalPermissionMessage(permiso, isSelected ? 'quitar' : 'agregar'),
        type: 'warning',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        onConfirm: applyToggle
      });
      return;
    }

    applyToggle();
  };

  const handleSavePermissions = async () => {
    if (selectedRole) {
      const permissionsToSave = sanitizePermissionsByRoleName(selectedRole.nombre, selectedPermissions);
      const permissionsValidationError = validatePermissionsCount(permissionsToSave);
      if (permissionsValidationError) {
        showAlert({
          title: 'Permisos requeridos',
          description: permissionsValidationError,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        return;
      }

      try {
        await rolesAPI.updatePermissions(Number(selectedRole.id), { permisos: permissionsToSave });
        await loadRoles();
        setIsPermissionsModalOpen(false);
        showAlert({
          title: 'Éxito',
          description: 'Permisos actualizados correctamente',
          type: 'success',
          confirmText: 'Aceptar',
          onConfirm: () => {}
        });
      } catch (error) {
        console.error('Error guardando permisos:', error);
        showAlert({
          title: 'Error',
          description: (error as any)?.message || 'No se pudieron guardar los permisos',
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      }
    }
  };

  // Agrupar permisos por módulo
  const permisosPorModulo = React.useMemo(() => {
    const grouped = todosLosPermisos.reduce((acc, { modulo, permiso }) => {
      if (!acc[modulo]) acc[modulo] = [];
      acc[modulo].push(permiso);
      return acc;
    }, {} as { [key: string]: string[] });

    Object.keys(grouped).forEach((modulo) => {
      grouped[modulo] = [...grouped[modulo]].sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      );
    });

    return grouped;
  }, []);

  const modulosOrdenados = React.useMemo(
    () =>
      Object.keys(permisosPorModulo).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      ),
    [permisosPorModulo]
  );

  const getFilteredModuleEntries = (moduleFilter: string) =>
    modulosOrdenados
      .filter((modulo) => moduleFilter === 'Todos' || modulo === moduleFilter)
      .map((modulo) => [modulo, permisosPorModulo[modulo]] as const);

  const createModuleEntries = getFilteredModuleEntries(createModuleFilter)
    .map(([modulo, permisos]) => [
      modulo,
      isCreatingClienteRole ? permisos.filter((permiso) => CLIENTE_PERMISOS_FIJOS.includes(permiso)) : permisos,
    ] as const)
    .filter(([, permisos]) => permisos.length > 0);

  const editModuleEntries = getFilteredModuleEntries(editModuleFilter)
    .map(([modulo, permisos]) => [
      modulo,
      isEditingClienteRole ? permisos.filter((permiso) => CLIENTE_PERMISOS_FIJOS.includes(permiso)) : permisos,
    ] as const)
    .filter(([, permisos]) => permisos.length > 0);
  const manageModuleEntries = getFilteredModuleEntries(manageModuleFilter)
    .map(([modulo, permisos]) => [
      modulo,
      isManagingClienteRole ? permisos.filter((permiso) => CLIENTE_PERMISOS_FIJOS.includes(permiso)) : permisos,
    ] as const)
    .filter(([, permisos]) => permisos.length > 0);

  const createAvailablePermissions = createModuleEntries.flatMap(([, permisos]) => permisos);
  const editAvailablePermissions = editModuleEntries.flatMap(([, permisos]) => permisos);
  const manageAvailablePermissions = manageModuleEntries.flatMap(([, permisos]) => permisos);

  useEffect(() => {
    if (isCreatingClienteRole) {
      setCreatePermissions([...CLIENTE_PERMISOS_FIJOS]);
    }
  }, [isCreatingClienteRole]);

  useEffect(() => {
    if (isEditingClienteRole) {
      setEditPermissions([...CLIENTE_PERMISOS_FIJOS]);
    }
  }, [isEditingClienteRole]);

  useEffect(() => {
    if (isManagingClienteRole) {
      setSelectedPermissions([...CLIENTE_PERMISOS_FIJOS]);
    }
  }, [isManagingClienteRole]);

  const roleFilterOptions = React.useMemo(() => {
    const uniqueRoles = Array.from(new Set(roles.map((role) => role.nombre))).sort((left, right) =>
      left.localeCompare(right, 'es', { sensitivity: 'base' })
    );

    return ['Todos', ...uniqueRoles];
  }, [roles]);

  const filteredRoles = React.useMemo(() => {
    const normalizedQuery = roleSearchQuery.trim().toLowerCase();

    return roles.filter((role) => {
      const matchesSearch =
        !normalizedQuery ||
        role.nombre.toLowerCase().includes(normalizedQuery) ||
        role.descripcion.toLowerCase().includes(normalizedQuery) ||
        role.estado.toLowerCase().includes(normalizedQuery);
      const matchesRole = roleFilter === 'Todos' || role.nombre === roleFilter;
      const matchesState = roleStateFilter === 'Todos' || role.estado === roleStateFilter;
      return matchesSearch && matchesRole && matchesState;
    });
  }, [roles, roleSearchQuery, roleFilter, roleStateFilter]);

  const createHasErrors = !createCanSubmit;
  const editHasErrors = !editCanSubmit;

  return (
    <div className="space-y-6">
      {AlertComponent}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Gestión de Roles</h2>
          <p className="text-muted-foreground">Administra los roles y sus permisos en el sistema</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={() => setIsCreateModalOpen(true)}>
          Nuevo Rol
        </Button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
          {loadError}
        </div>
      )}

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={roleSearchQuery}
              onChange={(event) => setRoleSearchQuery(event.target.value)}
              placeholder="Buscar rol por nombre, descripción o estado..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={resetRoleFilters}
            disabled={!roleSearchQuery.trim() && roleFilter === 'Todos' && roleStateFilter === 'Todos'}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          <select
            value={roleStateFilter}
            onChange={(event) => setRoleStateFilter(event.target.value as 'Todos' | 'Activo' | 'Inactivo')}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="Todos">Estado (todos)</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {roleFilterOptions.map((role) => (
              <option key={role} value={role}>
                {role === 'Todos' ? 'Rol (todos)' : role}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredRoles}
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
          resetCreateForm();
        }}
        title="Crear Nuevo Rol"
        size="lg"
        contentClassName="!p-2.5 sm:!p-3"
        footer={
          <FormActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                resetCreateForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="create-role-form"
              disabled={createHasErrors}
            >
              Crear Rol
            </Button>
          </FormActions>
        }
      >
        <Form
          id="create-role-form"
          className="space-y-3"
          onSubmit={handleCreateRole}
          noValidate
          style={{ zoom: 0.9 }}
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]">
            <FormField
              label="Nombre del Rol"
              name="nombre"
              value={createFormData.nombre}
              onChange={(value) => {
                const nextName = value as string;
                setCreateFormData((prev) => ({ ...prev, nombre: nextName }));
                setCreateNameError(validateRoleName(nextName));
              }}
              placeholder="Ej: Supervisor de bodega"
              required
            />

            <FormField
              label="Estado"
              name="estado"
              type="select"
              value={createFormData.estado}
              onChange={(value) => setCreateFormData((prev) => ({ ...prev, estado: value as 'Activo' | 'Inactivo' }))}
              options={[
                { value: 'Activo', label: 'Activo' },
                { value: 'Inactivo', label: 'Inactivo' }
              ]}
              showEmptyOption={false}
              required
            />
          </div>

          <FormField
            label="Descripción"
            name="descripcion"
            type="textarea"
            value={createFormData.descripcion}
            onChange={(value) => setCreateFormData((prev) => ({ ...prev, descripcion: value as string }))}
            rows={3}
            required
          />

          {createNameError ? <p className="text-sm text-destructive">{createNameError}</p> : null}

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span>Permisos seleccionados: <strong>{createPermissions.length}</strong> de {createAvailablePermissions.length}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setCreatePermissions([...createAvailablePermissions])}
              >
                Seleccionar Todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setCreatePermissions(isCreatingClienteRole ? [...CLIENTE_PERMISOS_FIJOS] : [])}
                disabled={isCreatingClienteRole}
              >
                Quitar Todos
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Filtrar por módulo</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={createModuleFilter === 'Todos' ? 'primary' : 'outline'}
                onClick={() => setCreateModuleFilter('Todos')}
              >
                Todos
              </Button>
              {modulosOrdenados.map((modulo) => (
                <Button
                  key={modulo}
                  type="button"
                  size="sm"
                  variant={createModuleFilter === modulo ? 'primary' : 'outline'}
                  onClick={() => setCreateModuleFilter(modulo)}
                >
                  {modulo}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {createModuleEntries.map(([modulo, permisos]) => (
              <Card key={modulo}>
                <h4 className="mb-3 text-primary">{modulo}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {permisos.map((permiso) => {
                    const isSelected = createPermissions.includes(permiso);
                    return (
                      <button
                        key={permiso}
                        type="button"
                        onClick={() => toggleCreatePermission(permiso)}
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
        </Form>
      </Modal>

      {/* Modal de Cambio de Estado */}
      <Modal
        isOpen={Boolean(pendingStateChange)}
        onClose={handleCancelStateChange}
        title={`Confirmar cambio de estado - ${pendingStateChange?.roleName}`}
        size="md"
        footer={
          pendingStateChange ? (
            <FormActions>
              <Button type="button" variant="outline" onClick={handleCancelStateChange} disabled={stateChangeSaving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleConfirmStateChange} disabled={stateChangeSaving}>
                Confirmar
              </Button>
            </FormActions>
          ) : null
        }
      >
        {pendingStateChange && (
          <div className="space-y-4">
            <div className="p-4 bg-accent/50 rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">
                Vas a cambiar el estado de <strong>{pendingStateChange.roleName}</strong> de{' '}
                <strong>{pendingStateChange.currentState}</strong> a <strong>{pendingStateChange.nextState}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Usuarios asignados: <strong>{pendingStateChange.assignedUsers}</strong>
              </p>
            </div>

            <FormField
              label="Motivo opcional"
              name="motivo-estado"
              type="textarea"
              value={stateChangeReason}
              onChange={(value) => setStateChangeReason(value as string)}
              placeholder="Ej: reorganizacion del equipo, cambio temporal, ajuste operativo"
              rows={3}
            />

          </div>
        )}
      </Modal>

      {/* Modal de Eliminación de Rol */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setRoleToDelete(null);
          setDeleteReason('');
          setDeleteReasonError('');
        }}
        title={`Eliminar Rol - ${roleToDelete?.nombre}`}
        size="md"
        footer={
          <FormActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setRoleToDelete(null);
                setDeleteReason('');
                setDeleteReasonError('');
              }}
            >
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={deletingRole}>
              Confirmar eliminación
            </Button>
          </FormActions>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30">
            <p className="text-sm text-destructive">
              Advertencia: esta acción eliminará el rol de forma permanente. Verifica que realmente deseas continuar.
            </p>
          </div>

          <FormField
            label="Motivo eliminación"
            name="motivo-eliminacion"
            type="textarea"
            value={deleteReason}
            onChange={(value) => {
              const nextReason = value as string;
              setDeleteReason(nextReason);
              setDeleteReasonError(validateDeleteReason(nextReason));
            }}
            placeholder="Describe por qué se elimina este rol (10 a 200 caracteres)"
            rows={4}
            required
          />
          {deleteReasonError ? <p className="text-sm text-destructive">{deleteReasonError}</p> : null}

        </div>
      </Modal>

      {/* Modal de Editar Rol */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          resetEditForm();
        }}
        title={`Editar Rol - ${selectedRole?.nombre}`}
        size="lg"
        contentClassName="!p-2.5 sm:!p-3"
        footer={
          <FormActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                resetEditForm();
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" form="edit-role-form" disabled={editHasErrors}>
              Guardar Cambios
            </Button>
          </FormActions>
        }
      >
        <Form
          id="edit-role-form"
          className="space-y-3"
          onSubmit={handleUpdateRole}
          style={{ zoom: 0.9 }}
        >

          <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]">
            <FormField
              label="Nombre del Rol"
              name="nombre"
              type="text"
              value={formData.nombre}
              onChange={(value) => {
                const nextName = value as string;
                setFormData((prev) => ({ ...prev, nombre: nextName }));
                setEditNameError(validateRoleName(nextName, selectedRole?.id));
              }}
              placeholder="Ej: Supervisor de bodega"
              required
            />

            <FormField
              label="Estado"
              name="estado"
              type="select"
              value={formData.estado}
              onChange={(value) => setFormData((prev) => ({ ...prev, estado: value as 'Activo' | 'Inactivo' }))}
              options={[
                { value: 'Activo', label: 'Activo' },
                { value: 'Inactivo', label: 'Inactivo' }
              ]}
              required
            />
          </div>

          <FormField
            label="Descripción"
            name="descripcion"
            type="textarea"
            value={formData.descripcion}
            onChange={(value) => setFormData((prev) => ({ ...prev, descripcion: value as string }))}
            rows={4}
            required
          />

          {editNameError ? <p className="text-sm text-destructive">{editNameError}</p> : null}

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span>Permisos seleccionados: <strong>{editPermissions.length}</strong> de {editAvailablePermissions.length}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setEditPermissions([...editAvailablePermissions])}
              >
                Seleccionar Todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setEditPermissions(isEditingClienteRole ? [...CLIENTE_PERMISOS_FIJOS] : [])}
                disabled={isEditingClienteRole}
              >
                Quitar Todos
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Filtrar por módulo</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={editModuleFilter === 'Todos' ? 'primary' : 'outline'}
                onClick={() => setEditModuleFilter('Todos')}
              >
                Todos
              </Button>
              {modulosOrdenados.map((modulo) => (
                <Button
                  key={modulo}
                  type="button"
                  size="sm"
                  variant={editModuleFilter === modulo ? 'primary' : 'outline'}
                  onClick={() => setEditModuleFilter(modulo)}
                >
                  {modulo}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {editModuleEntries.map(([modulo, permisos]) => (
              <Card key={modulo}>
                <h4 className="mb-3 text-primary">{modulo}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {permisos.map((permiso) => {
                    const isSelected = editPermissions.includes(permiso);
                    return (
                      <button
                        key={permiso}
                        type="button"
                        onClick={() => toggleEditPermission(permiso)}
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
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Ultima modificacion</p>
                <p>{formatDateTime(selectedRole.updated_at)}</p>
              </div>
            </div>

            <div className="p-4 bg-accent/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">Lista de Permisos</p>
              {selectedRole.permisos.length > 0 ? (
                <div className="max-h-[calc(var(--app-vh,1vh)*50)] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {selectedRole.permisos.map((permiso) => (
                      <div key={permiso} className="flex items-center gap-2 p-2 bg-background rounded border">
                        <Check className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="text-sm break-words">{permiso}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sin permisos asignados</p>
              )}
            </div>

            <div className="p-4 bg-accent/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">Auditoria de cambios</p>
              {loadingRoleAudit ? (
                <p className="text-sm text-muted-foreground">Cargando auditoria...</p>
              ) : roleAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No hay cambios registrados para este rol.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {roleAudit.map((entry) => (
                    <div key={entry.id} className="p-3 bg-background rounded border text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{actionLabelMap[entry.accion] || entry.accion}</p>
                        <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {entry.usuario_nombre || entry.usuario_apellido
                          ? `Usuario: ${entry.usuario_nombre || ''} ${entry.usuario_apellido || ''}`.trim()
                          : 'Usuario: Sistema'}
                      </p>
                    </div>
                  ))}
                </div>
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
        onClose={() => setIsPermissionsModalOpen(false)}
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

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span>Permisos seleccionados: <strong>{selectedPermissions.length}</strong> de {manageAvailablePermissions.length}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedPermissions([...manageAvailablePermissions])}
              >
                Seleccionar Todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedPermissions(isManagingClienteRole ? [...CLIENTE_PERMISOS_FIJOS] : [])}
                disabled={isManagingClienteRole}
              >
                Quitar Todos
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Filtrar por módulo</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={manageModuleFilter === 'Todos' ? 'primary' : 'outline'}
                onClick={() => setManageModuleFilter('Todos')}
              >
                Todos
              </Button>
              {modulosOrdenados.map((modulo) => (
                <Button
                  key={modulo}
                  type="button"
                  size="sm"
                  variant={manageModuleFilter === modulo ? 'primary' : 'outline'}
                  onClick={() => setManageModuleFilter(modulo)}
                >
                  {modulo}
                </Button>
              ))}
            </div>
          </div>

          <div
            className={`space-y-3 overflow-y-auto pr-1 ${
              manageModuleFilter === 'Todos'
                ? 'max-h-[calc(var(--app-vh,1vh)*50)]'
                : 'max-h-[calc(var(--app-vh,1vh)*100-300px)] sm:max-h-[calc(var(--app-vh,1vh)*100-320px)]'
            }`}
          >
            {manageModuleEntries.map(([modulo, permisos]) => (
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
            <Button variant="outline" onClick={() => setIsPermissionsModalOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSavePermissions} className="flex-1" disabled={selectedPermissions.length === 0}>
              Guardar Permisos
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}