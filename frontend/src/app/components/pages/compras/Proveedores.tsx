import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Building2, User, Eye, Edit, Trash2, Star } from 'lucide-react';
import { api } from '../../../services/api';
import type { Proveedor } from '../../../services/types';
import { toast } from '../../AlertDialog';

export function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEstadoModalOpen, setIsEstadoModalOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [proveedorEstadoPendiente, setProveedorEstadoPendiente] = useState<{
    proveedor: Proveedor;
    nuevoEstado: 'activo' | 'inactivo';
  } | null>(null);
  const [motivoEstado, setMotivoEstado] = useState('');
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'info' as 'warning' | 'info' | 'success' | 'danger',
    onConfirm: () => {}
  });
  const [formData, setFormData] = useState({
    tipo: 'Juridica' as 'Natural' | 'Juridica',
    nombreRazonSocial: '',
    nombre: '',
    apellido: '',
    nit: '',
    telefono: '',
    email: '',
    direccion: '',
    preferente: false,
    estado: 'activo' as 'activo' | 'inactivo'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todos');
  const [filtroPreferente, setFiltroPreferente] = useState<string>('Todos');
  const [isSavingProveedor, setIsSavingProveedor] = useState(false);

  const sanitizeNitInput = (value: string) => {
    // Permite escribir desde teclado: números, guiones, comas, slash, asteriscos
    return String(value || '')
      .replace(/[^0-9,/*\-.\s]/g, '')
      .replace(/([,/*-]){2,}/g, '$1')
      .replace(/^[,/*-]+|[,/*-]+$/g, '')
      .slice(0, 30);
  };

  useEffect(() => {
    cargarProveedores();
  }, []);

  const cargarProveedores = async () => {
    try {
      setLoading(true);
      const data = await api.proveedores.getAll();
      setProveedores(data);
    } catch (error: any) {
      toast.error('Error al cargar proveedores', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Filtrar proveedores
  const proveedoresFiltrados = useMemo(() => (
    proveedores.filter(p => {
      const matchBusqueda = searchQuery.length < 2 ||
        p.nombreRazonSocial.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(p.nit || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchTipo = filtroTipo === 'Todos' || p.tipo === filtroTipo;
      const matchEstado = filtroEstado === 'Todos' ||
        (filtroEstado === 'Activo' && p.estado === 'activo') ||
        (filtroEstado === 'Inactivo' && p.estado === 'inactivo');
      const matchPreferente = filtroPreferente === 'Todos' ||
        (filtroPreferente === 'Si' && p.preferente) ||
        (filtroPreferente === 'No' && !p.preferente);

      return matchBusqueda && matchTipo && matchEstado && matchPreferente;
    })
  ), [proveedores, searchQuery, filtroTipo, filtroEstado, filtroPreferente]);

  const nitDigits = String(formData.nit || '').replace(/\D/g, '');
  const nitDuplicadoEnLista = useMemo(() => {
    if (selectedProveedor) return '';
    if (nitDigits.length < 6 || nitDigits.length > 15) return '';
    const dup = proveedores.some((p) => String(p.nit || '').replace(/\D/g, '') === nitDigits);
    return dup
      ? 'Este NIT o documento ya está en la lista de proveedores. Use otro número o edite el existente.'
      : '';
  }, [proveedores, nitDigits, selectedProveedor]);

  // Validacion en vivo: telefono y correo no pueden duplicarse entre proveedores activos.
  const telDigitsProv = String(formData.telefono || '').replace(/\D/g, '');
  const telefonoDuplicadoProv = useMemo(() => {
    if (telDigitsProv.length !== 10) return '';
    const dup = proveedores.some(
      (p) =>
        (!selectedProveedor || p.id !== selectedProveedor.id) &&
        String(p.telefono || '').replace(/\D/g, '') === telDigitsProv
    );
    return dup
      ? 'Este teléfono ya está registrado para otro proveedor. Use uno distinto.'
      : '';
  }, [proveedores, telDigitsProv, selectedProveedor]);

  const emailNormProv = String(formData.email || '').trim().toLowerCase();
  const emailDuplicadoProv = useMemo(() => {
    if (!emailNormProv) return '';
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormProv);
    if (!valid) return '';
    const dup = proveedores.some(
      (p) =>
        (!selectedProveedor || p.id !== selectedProveedor.id) &&
        String(p.email || '').trim().toLowerCase() === emailNormProv
    );
    return dup
      ? 'Este correo ya está registrado para otro proveedor. Use uno distinto.'
      : '';
  }, [proveedores, emailNormProv, selectedProveedor]);

  const columns: Column[] = [
    {
      key: 'tipo',
      label: 'Tipo',
      render: (tipo: string) => (
        <span className={`px-2 py-1 rounded text-xs ${
          tipo === 'Juridica' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {tipo === 'Juridica' ? <Building2 className="w-3 h-3 inline mr-1" /> : <User className="w-3 h-3 inline mr-1" />}
          {tipo === 'Juridica' ? 'Jurídica' : 'Natural'}
        </span>
      )
    },
    { key: 'nombreRazonSocial', label: 'Nombre/Razón Social' },
    { key: 'nit', label: 'NIT/Documento' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    {
      key: 'preferente',
      label: 'Preferente',
      render: (_: any, row: Proveedor) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePreferente(row);
          }}
          className={`px-3 py-1 rounded-full text-xs cursor-pointer transition-colors ${
            row.preferente
              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {row.preferente ? <Star className="w-3 h-3 inline mr-1 fill-current" /> : <Star className="w-3 h-3 inline mr-1" />}
          {row.preferente ? 'Sí' : 'No'}
        </button>
      )
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: any, row: Proveedor) => (
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

  const handleTogglePreferente = async (proveedor: Proveedor) => {
    try {
      await api.proveedores.togglePreferente(proveedor.id);
      toast.success('Preferencia actualizada', {
        description: `Proveedor ${!proveedor.preferente ? 'marcado como' : 'desmarcado de'} preferente`
      });
      cargarProveedores();
    } catch (error: any) {
      toast.error('Error al actualizar preferencia', { description: error.message });
    }
  };

  const handleEstadoChange = (proveedor: Proveedor, nuevoEstado: 'activo' | 'inactivo') => {
    if (proveedor.estado === nuevoEstado) return;
    setProveedorEstadoPendiente({ proveedor, nuevoEstado });
    setMotivoEstado('');
    setIsEstadoModalOpen(true);
  };

  const confirmarCambioEstado = async () => {
    if (!proveedorEstadoPendiente) return;
    const motivoTrim = motivoEstado.trim();

    if (motivoTrim.length < 10 || motivoTrim.length > 50) {
      toast.error('Error de validación', {
        description: 'El motivo debe tener entre 10 y 50 caracteres'
      });
      return;
    }

    try {
      await api.proveedores.changeEstado(
        proveedorEstadoPendiente.proveedor.id,
        proveedorEstadoPendiente.nuevoEstado,
        motivoTrim
      );

      toast.success('Estado actualizado', {
        description: `Proveedor ${
          proveedorEstadoPendiente.nuevoEstado === 'activo' ? 'activado' : 'inactivado'
        } exitosamente`
      });

      setIsEstadoModalOpen(false);
      setMotivoEstado('');
      setProveedorEstadoPendiente(null);
      cargarProveedores();
    } catch (error: any) {
      toast.error('Error al cambiar estado', { description: error.message });
      cargarProveedores();
    }
  };

  const handleAdd = () => {
    setSelectedProveedor(null);
    setFormData({
      tipo: 'Juridica',
      nombreRazonSocial: '',
      nombre: '',
      apellido: '',
      nit: '',
      telefono: '',
      email: '',
      direccion: '',
      preferente: false,
      estado: 'activo'
    });
    setIsModalOpen(true);
  };

  const handleEdit = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor);
    setFormData({
      tipo: proveedor.tipo,
      nombreRazonSocial: proveedor.tipo === 'Juridica' ? proveedor.nombreRazonSocial : '',
      nombre: proveedor.tipo === 'Natural' ? (proveedor.nombre ?? '').trim() : '',
      apellido: proveedor.tipo === 'Natural' ? (proveedor.apellido ?? '').trim() : '',
      nit: proveedor.nit,
      telefono: proveedor.telefono,
      email: proveedor.email,
      direccion: proveedor.direccion,
      preferente: proveedor.preferente,
      estado: proveedor.estado
    });
    setIsModalOpen(true);
  };

  const handleDelete = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor);
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
    if (!selectedProveedor) return;

    if (motivoEliminacion.length < 10 || motivoEliminacion.length > 50) {
      toast.error('Error de validación', {
        description: 'El motivo debe tener entre 10 y 50 caracteres'
      });
      return;
    }

    try {
      await api.proveedores.delete(selectedProveedor.id, motivoEliminacion);

      toast.success('Proveedor eliminado', {
        description: 'El proveedor ha sido eliminado exitosamente'
      });

      setAlertState({ isOpen: false, title: '', description: '', type: 'info', onConfirm: () => {} });
      setMotivoEliminacion('');
      setSelectedProveedor(null);
      cargarProveedores();
    } catch (error: any) {
      toast.error('Error al eliminar proveedor', { description: error.message });
    }
  };

  const handleView = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor);
    setIsDetailModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProveedor) return;

    if (formData.tipo === 'Juridica') {
      if (!formData.nombreRazonSocial.trim()) {
        toast.error('Datos incompletos', {
          description: 'Ingrese el nombre o razón social'
        });
        return;
      }
    } else {
      if (!formData.nombre.trim() || !formData.apellido.trim()) {
        toast.error('Datos incompletos', {
          description: 'Ingrese nombre y apellido del proveedor'
        });
        return;
      }
    }

    // Validaciones
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Email inválido', {
        description: 'Por favor ingrese un email válido'
      });
      return;
    }

    const telDigits = String(formData.telefono || '').replace(/\D/g, '');
    if (telDigits.length !== 10) {
      toast.error('Teléfono incompleto', {
        description: 'Ingrese exactamente 10 dígitos del teléfono.',
      });
      return;
    }

    if (nitDigits.length < 6 || nitDigits.length > 15) {
      toast.error('NIT o documento inválido', {
        description: 'El NIT/Documento debe tener entre 6 y 15 dígitos.',
      });
      return;
    }

    if (nitDuplicadoEnLista) {
      toast.error('Identificador duplicado', { description: nitDuplicadoEnLista });
      return;
    }
    if (telefonoDuplicadoProv) {
      toast.error('Teléfono duplicado', { description: telefonoDuplicadoProv });
      return;
    }
    if (emailDuplicadoProv) {
      toast.error('Correo duplicado', { description: emailDuplicadoProv });
      return;
    }

    try {
      setIsSavingProveedor(true);
      if (selectedProveedor) {
        await api.proveedores.update(selectedProveedor.id, formData, 'Actualización de datos');

        toast.success('Proveedor actualizado', {
          description: 'Los datos del proveedor han sido actualizados exitosamente'
        });
      } else {
        await api.proveedores.create(formData);

        toast.success('Proveedor creado', {
          description: 'El proveedor ha sido creado exitosamente'
        });
      }

      setIsModalOpen(false);
      cargarProveedores();
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (/telefono|teléfono/i.test(msg)) {
        toast.error('Teléfono no disponible', {
          description: 'Ese número ya está asignado a otro proveedor. Indique un teléfono distinto.',
        });
      } else if (/correo|email/i.test(msg)) {
        toast.error('Correo no disponible', { description: msg });
      } else if (/RUC|NIT|documento|ya existe|inactivo/i.test(msg)) {
        toast.error('Identificador duplicado', {
          description: msg.includes('inactivo')
            ? 'Ese NIT o documento corresponde a un proveedor inactivo. Reactive ese registro o use otro número.'
            : 'Ese NIT o documento ya pertenece a otro proveedor. Verifique el número o consulte el proveedor existente.',
        });
      } else {
        toast.error(selectedProveedor ? 'No se pudo actualizar el proveedor' : 'No se pudo crear el proveedor', {
          description: msg || 'Intente de nuevo o contacte al administrador.',
        });
      }
    } finally {
      setIsSavingProveedor(false);
    }
  };

  // Spinner solo en la carga inicial: en recargas la UI permanece para no perder foco al buscar.
  if (loading && proveedores.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando proveedores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Proveedores</h2>
          <p className="text-muted-foreground">Administra los proveedores del sistema</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Proveedor
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
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[120px]"
            >
              <option value="Todos">Filtrar por tipo</option>
              <option value="Juridica">Jurídica</option>
              <option value="Natural">Natural</option>
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
            <select
              value={filtroPreferente}
              onChange={(e) => setFiltroPreferente(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="Todos">Filtrar por preferente</option>
              <option value="Si">Preferentes</option>
              <option value="No">No preferentes</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setFiltroTipo('Todos');
                setFiltroEstado('Todos');
                setFiltroPreferente('Todos');
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
        data={proveedoresFiltrados}
        pageSize={10}
        getRowKey={(row) => row.id}
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
            variant: 'default'
          },
          {
            label: 'Eliminar',
            icon: <Trash2 className="w-4 h-4" />,
            onClick: handleDelete,
            variant: 'danger'
          }
        ]}
      />

      {/* Modal Nuevo/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedProveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      >
        <Form onSubmit={handleSubmit}>
          <FormField
            label="Tipo de Persona"
            name="tipo"
            type="select"
            value={formData.tipo}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                tipo: value as 'Natural' | 'Juridica',
                ...(value === 'Natural'
                  ? { nombreRazonSocial: '' }
                  : { nombre: '', apellido: '' }),
              }))
            }
            options={[
              { value: 'Juridica', label: 'Persona Jurídica' },
              { value: 'Natural', label: 'Persona Natural' }
            ]}
            required
          />

          {formData.tipo === 'Juridica' ? (
            <FormField
              label="Nombre/Razón Social"
              name="nombreRazonSocial"
              value={formData.nombreRazonSocial}
              onChange={(value) => setFormData({ ...formData, nombreRazonSocial: value as string })}
              placeholder="Ej: Distribuidora ABC S.A.S"
              required
            />
          ) : (
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
          )}

          <FormField
            label="NIT/Documento"
            name="nit"
            value={formData.nit}
            onChange={(value) => {
              if (selectedProveedor) return;
              setFormData({ ...formData, nit: sanitizeNitInput(value as string) });
            }}
            placeholder="Ej: 900-123/456*7"
            required
            disabled={!!selectedProveedor}
            error={nitDuplicadoEnLista || undefined}
            maxLength={25}
          />

          {selectedProveedor && (
            <p className="text-xs text-amber-600 -mt-3 mb-3">
              ⚠️ No se puede modificar el NIT/Documento por políticas de auditoría
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Teléfono"
              name="telefono"
              value={formData.telefono}
              onChange={(value) => setFormData({ ...formData, telefono: value as string })}
              placeholder="6015551000"
              required
              inputDigitRule="telefono10"
              hideAutoHelper
              error={telefonoDuplicadoProv || undefined}
            />

            <FormField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(value) => setFormData({ ...formData, email: value as string })}
              placeholder="ejemplo@email.com"
              required
              error={emailDuplicadoProv || undefined}
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
              label="Preferente"
              name="preferente"
              type="select"
              value={formData.preferente ? 'si' : 'no'}
              onChange={(value) => setFormData({ ...formData, preferente: value === 'si' })}
              options={[
                { value: 'no', label: 'No' },
                { value: 'si', label: 'Sí' }
              ]}
            />

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
            <Button variant="outline" disabled={isSavingProveedor} onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSavingProveedor}>
              {isSavingProveedor
                ? 'Guardando...'
                : `${selectedProveedor ? 'Actualizar' : 'Crear'} Proveedor`}
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedProveedor(null);
        }}
        title="Detalle de Proveedor"
        size="lg"
      >
        {selectedProveedor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <p className="font-medium">{selectedProveedor.tipo === 'Juridica' ? 'Persona Jurídica' : 'Persona Natural'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nombre/Razón Social</p>
                <p className="font-medium">{selectedProveedor.nombreRazonSocial}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">NIT/Documento</p>
                <p className="font-medium">{selectedProveedor.nit}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Teléfono</p>
                <p className="font-medium">{selectedProveedor.telefono}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{selectedProveedor.email}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Dirección</p>
                <p className="font-medium">{selectedProveedor.direccion}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Preferente</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedProveedor.preferente ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {selectedProveedor.preferente ? 'Sí' : 'No'}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedProveedor.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedProveedor.estado === 'activo' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>

            {/* Historial de cambios */}
            {selectedProveedor.historialCambios && selectedProveedor.historialCambios.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium mb-3">Historial de Cambios</h4>
                <div className="space-y-2">
                  {selectedProveedor.historialCambios.map((cambio, index) => (
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
                  setSelectedProveedor(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Cambio de Estado */}
      <Modal
        isOpen={isEstadoModalOpen}
        onClose={() => {
          setIsEstadoModalOpen(false);
          setMotivoEstado('');
          setProveedorEstadoPendiente(null);
        }}
        title="Cambiar Estado de Proveedor"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Está a punto de cambiar el estado del proveedor{' '}
            <strong>{proveedorEstadoPendiente?.proveedor.nombreRazonSocial}</strong> a{' '}
            <strong>{proveedorEstadoPendiente?.nuevoEstado === 'activo' ? 'Activo' : 'Inactivo'}</strong>.
          </p>

          {proveedorEstadoPendiente?.nuevoEstado === 'inactivo' && (
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              ⚠️ Al marcar como inactivo, este proveedor no aparecerá en ningún proceso de compras hasta que se reactive.
            </p>
          )}

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
                setProveedorEstadoPendiente(null);
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

      {/* Modal Eliminación */}
      <Modal
        isOpen={alertState.isOpen}
        onClose={() => {
          setAlertState({ isOpen: false, title: '', description: '', type: 'info', onConfirm: () => {} });
          setMotivoEliminacion('');
          setSelectedProveedor(null);
        }}
        title="Confirmar Eliminación de Proveedor"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>¡Advertencia!</strong> Está a punto de eliminar al proveedor{' '}
              <strong>{selectedProveedor?.nombreRazonSocial}</strong>.
            </p>
            <p className="text-sm text-red-700 mt-2">
              Esta acción no se puede deshacer.
            </p>
          </div>

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
                setSelectedProveedor(null);
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

