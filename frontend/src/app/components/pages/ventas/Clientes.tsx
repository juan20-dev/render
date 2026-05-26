import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { MotivoModal } from '../../MotivoModal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, UserCircle, Upload } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import type { Cliente } from '../../../services/types';

export function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEstadoModalOpen, setIsEstadoModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [motivoEstado, setMotivoEstado] = useState('');
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [clienteEstadoTarget, setClienteEstadoTarget] = useState<{
    cliente: Cliente;
    nuevoEstado: 'activo' | 'inactivo';
  } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipoDoc, setFiltroTipoDoc] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    tipoDocumento: 'CC',
    numeroDocumento: '',
    telefono: '',
    email: '',
    direccion: ''
  });
  const [isSavingCliente, setIsSavingCliente] = useState(false);

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = async () => {
    try {
      const data = await api.clientes.getAll();
      setClientes(data);
    } catch (error) {
      toast.error('Error al cargar clientes');
    }
  };

  const validarEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validarTelefono = (telefono: string) => {
    const regex = /^[0-9]{10}$/;
    return regex.test(telefono.replace(/\s/g, ''));
  };

  const validarDocumento = (documento: string) => {
    const d = String(documento || '').replace(/\D/g, '').length;
    return d >= 6 && d <= 12;
  };

  // ----- Validacion en vivo de duplicados (documento, telefono, correo) -----
  const docNorm = String(formData.numeroDocumento || '').replace(/\D/g, '');
  const telNorm = String(formData.telefono || '').replace(/\D/g, '');
  const emailNorm = String(formData.email || '').trim().toLowerCase();

  const documentoDuplicado = useMemo(() => {
    if (docNorm.length < 6 || docNorm.length > 12) return '';
    const dup = clientes.some(
      (c) =>
        (!selectedCliente || c.id !== selectedCliente.id) &&
        String(c.numeroDocumento || '').replace(/\D/g, '') === docNorm
    );
    return dup
      ? 'Este número de documento ya está registrado para otro cliente. Use otro número o edite el cliente existente.'
      : '';
  }, [clientes, docNorm, selectedCliente]);

  const telefonoDuplicado = useMemo(() => {
    if (telNorm.length !== 10) return '';
    const dup = clientes.some(
      (c) =>
        (!selectedCliente || c.id !== selectedCliente.id) &&
        String(c.telefono || '').replace(/\D/g, '') === telNorm
    );
    return dup
      ? 'Este teléfono ya está registrado para otro cliente. Use uno distinto.'
      : '';
  }, [clientes, telNorm, selectedCliente]);

  const emailDuplicado = useMemo(() => {
    if (!emailNorm || !validarEmail(emailNorm)) return '';
    const dup = clientes.some(
      (c) =>
        (!selectedCliente || c.id !== selectedCliente.id) &&
        String(c.email || '').trim().toLowerCase() === emailNorm
    );
    return dup
      ? 'Este correo ya está registrado para otro cliente. Use uno distinto.'
      : '';
  }, [clientes, emailNorm, selectedCliente]);

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
      render: (_: any, row: Cliente) => `${row.nombre} ${row.apellido}`
    },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    {
      key: 'comprasRealizadas',
      label: 'Compras',
      render: (value: number) => `${value} compra${value !== 1 ? 's' : ''}`
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: string, row: Cliente) => (
        <select
          value={row.estado}
          onChange={(e) =>
            handleClienteEstadoSelect(row, e.target.value as 'activo' | 'inactivo')
          }
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

  const handleAdd = () => {
    setSelectedCliente(null);
    setFormData({
      nombre: '',
      apellido: '',
      tipoDocumento: 'CC',
      numeroDocumento: '',
      telefono: '',
      email: '',
      direccion: ''
    });
    setIsModalOpen(true);
  };

  const handleEdit = (cliente: Cliente) => {
    if (cliente.estado === 'inactivo') {
      toast.warning('Cliente inactivo', {
        description: 'No se puede editar un cliente inactivo. Reactivelo primero.',
      });
      return;
    }
    setSelectedCliente(cliente);
    setFormData({
      nombre: cliente.nombre,
      apellido: cliente.apellido,
      tipoDocumento: cliente.tipoDocumento,
      numeroDocumento: cliente.numeroDocumento,
      telefono: cliente.telefono,
      email: cliente.email,
      direccion: cliente.direccion
    });
    setIsModalOpen(true);
  };

  const handleClienteEstadoSelect = (cliente: Cliente, nuevoEstado: 'activo' | 'inactivo') => {
    if (cliente.estado === nuevoEstado) return;
    setClienteEstadoTarget({ cliente, nuevoEstado });
    setMotivoEstado('');
    setIsEstadoModalOpen(true);
  };

  const handleConfirmCambioEstado = async () => {
    if (!clienteEstadoTarget) return;

    if (motivoEstado.length < 10 || motivoEstado.length > 50) {
      toast.error('El motivo debe tener entre 10 y 50 caracteres');
      return;
    }

    try {
      await api.clientes.changeEstado(
        clienteEstadoTarget.cliente.id,
        clienteEstadoTarget.nuevoEstado,
        motivoEstado
      );
      toast.success(`Estado cambiado a ${clienteEstadoTarget.nuevoEstado}`);
      setIsEstadoModalOpen(false);
      setClienteEstadoTarget(null);
      setMotivoEstado('');
      cargarClientes();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
      cargarClientes();
    }
  };

  const handleDelete = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setMotivoEliminacion('');
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedCliente) return;

    if (motivoEliminacion.length < 10 || motivoEliminacion.length > 50) {
      toast.error('El motivo debe tener entre 10 y 50 caracteres');
      return;
    }

    try {
      await api.clientes.delete(selectedCliente.id, motivoEliminacion);
      toast.success('Cliente eliminado exitosamente');
      setIsDeleteModalOpen(false);
      cargarClientes();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar cliente');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingCliente) return;

    if (!formData.nombre.trim() || !formData.apellido.trim()) {
      toast.error('Nombre y apellido son requeridos');
      return;
    }

    if (!validarEmail(formData.email)) {
      toast.error('Email inválido');
      return;
    }

    if (!validarDocumento(formData.numeroDocumento)) {
      toast.error('Documento inválido', {
        description: 'El número de documento debe tener entre 6 y 12 dígitos.',
      });
      return;
    }

    if (!validarTelefono(formData.telefono)) {
      toast.error('Teléfono inválido', {
        description: 'El teléfono debe tener exactamente 10 dígitos.',
      });
      return;
    }

    if (documentoDuplicado) {
      toast.error('Documento duplicado', { description: documentoDuplicado });
      return;
    }
    if (telefonoDuplicado) {
      toast.error('Teléfono duplicado', { description: telefonoDuplicado });
      return;
    }
    if (emailDuplicado) {
      toast.error('Correo duplicado', { description: emailDuplicado });
      return;
    }

    try {
      setIsSavingCliente(true);
      if (selectedCliente) {
        await api.clientes.update(selectedCliente.id, {
          ...formData,
          estado: 'activo'
        });
        toast.success('Cliente actualizado exitosamente');
      } else {
        await api.clientes.create({
          ...formData,
          estado: 'activo'
        });
        toast.success('Cliente creado exitosamente');
      }

      setIsModalOpen(false);
      cargarClientes();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar cliente');
    } finally {
      setIsSavingCliente(false);
    }
  };

  const clientesFiltrados = clientes.filter(cliente => {
    const matchBusqueda = busqueda.length === 0 ||
      busqueda.length >= 2 &&
      (cliente.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
       cliente.apellido.toLowerCase().includes(busqueda.toLowerCase()) ||
       cliente.email.toLowerCase().includes(busqueda.toLowerCase()) ||
       cliente.numeroDocumento.includes(busqueda));

    const matchTipoDoc = !filtroTipoDoc || cliente.tipoDocumento === filtroTipoDoc;
    const matchEstado = !filtroEstado || cliente.estado === filtroEstado;

    return matchBusqueda && matchTipoDoc && matchEstado;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Clientes</h2>
          <p className="text-muted-foreground">Administra la información de los clientes</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Cliente
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-border p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar ..."
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroTipoDoc}
              onChange={(e) => setFiltroTipoDoc(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[120px]"
            >
              <option value="">Filtrar por tipo doc.</option>
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="TI">TI</option>
              <option value="PP">PP</option>
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[120px]"
            >
              <option value="">Filtrar por estado</option>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroTipoDoc('');
                setFiltroEstado('');
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
        data={clientesFiltrados}
        rowClassName={(row: Cliente) =>
          row.estado === 'inactivo' ? 'opacity-80 bg-muted/50' : undefined
        }
        actions={[
          commonActions.view((cliente) => {
            setSelectedCliente(cliente);
            setIsDetailModalOpen(true);
          }),
          commonActions.edit(handleEdit, {
            disabled: (row: Cliente) => row.estado === 'inactivo',
            disabledTitle: 'No se puede editar un cliente inactivo. Reactivelo primero.',
          }),
          commonActions.delete(handleDelete)
        ]}
      />

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Cliente"
        size="lg"
      >
        {selectedCliente && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">{selectedCliente.nombre} {selectedCliente.apellido}</h3>
                <p className="text-sm text-muted-foreground">{selectedCliente.email}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm ${
                selectedCliente.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {selectedCliente.estado === 'activo' ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Nombre Completo</label>
                <p className="mt-1">{selectedCliente.nombre} {selectedCliente.apellido}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Tipo de Documento</label>
                <p className="mt-1">{selectedCliente.tipoDocumento}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Número de Documento</label>
                <p className="mt-1">{selectedCliente.numeroDocumento}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Teléfono</label>
                <p className="mt-1">{selectedCliente.telefono}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Email</label>
                <p className="mt-1">{selectedCliente.email}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Dirección</label>
                <p className="mt-1">{selectedCliente.direccion}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Compras Realizadas</label>
                <p className="mt-1">{selectedCliente.comprasRealizadas} compra{selectedCliente.comprasRealizadas !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Última Compra</label>
                <p className="mt-1">{selectedCliente.ultimaCompra || 'N/A'}</p>
              </div>
            </div>

            {selectedCliente.historialCambios && selectedCliente.historialCambios.length > 0 && (
              <div className="p-4 bg-accent/50 rounded-lg">
                <label className="text-sm text-muted-foreground block mb-3 font-medium">Historial de Cambios</label>
                <div className="space-y-2">
                  {selectedCliente.historialCambios.map((cambio, index) => (
                    <div key={index} className="p-3 bg-background rounded border text-xs">
                      <p><strong>Fecha:</strong> {new Date(cambio.fecha).toLocaleString('es-CO')}</p>
                      <p><strong>Acción:</strong> {cambio.accion}</p>
                      {cambio.motivo && <p><strong>Motivo:</strong> {cambio.motivo}</p>}
                      {cambio.detalles && <p><strong>Detalles:</strong> {cambio.detalles}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Form Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="lg"
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
              placeholder="Ej: Pérez García"
              required
            />

            <FormField
              label="Tipo de Documento"
              name="tipoDocumento"
              type="select"
              value={formData.tipoDocumento}
              onChange={(value) => setFormData({ ...formData, tipoDocumento: value as string })}
              options={[
                { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
                { value: 'CE', label: 'Cédula de Extranjería (CE)' },
                { value: 'PP', label: 'Pasaporte (PP)' }
              ]}
              required
            />

            <FormField
              label="Número de Documento"
              name="numeroDocumento"
              value={formData.numeroDocumento}
              onChange={(value) => setFormData({ ...formData, numeroDocumento: value as string })}
              placeholder="Entre 6 y 12 dígitos"
              required
              inputDigitRule="documento6to12"
              error={documentoDuplicado || undefined}
            />

            <FormField
              label="Teléfono"
              name="telefono"
              value={formData.telefono}
              onChange={(value) => setFormData({ ...formData, telefono: value as string })}
              placeholder="3001234567"
              required
              inputDigitRule="telefono10"
              error={telefonoDuplicado || undefined}
            />

            <FormField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(value) => {
                const email = value as string;
                setFormData({ ...formData, email });
              }}
              placeholder="cliente@email.com"
              required
              error={emailDuplicado || undefined}
            />
          </div>

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

          <FormActions>
            <Button variant="outline" disabled={isSavingCliente} onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSavingCliente}>
              {isSavingCliente
                ? 'Guardando...'
                : `${selectedCliente ? 'Actualizar' : 'Crear'} Cliente`}
            </Button>
          </FormActions>
        </Form>
      </Modal>

      <MotivoModal
        isOpen={isEstadoModalOpen}
        onClose={() => {
          setIsEstadoModalOpen(false);
          setClienteEstadoTarget(null);
          setMotivoEstado('');
        }}
        title="Cambiar estado de cliente"
        description={
          clienteEstadoTarget ? (
            <>
              <p>
                <strong>Cliente:</strong> {clienteEstadoTarget.cliente.nombre}{' '}
                {clienteEstadoTarget.cliente.apellido}
              </p>
              <p>
                <strong>Estado actual:</strong> {clienteEstadoTarget.cliente.estado}
              </p>
              <p>
                <strong>Nuevo estado:</strong> {clienteEstadoTarget.nuevoEstado}
              </p>
            </>
          ) : null
        }
        motivo={motivoEstado}
        onMotivoChange={setMotivoEstado}
        onConfirm={handleConfirmCambioEstado}
      />

      {/* Modal de confirmación de eliminación */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Cliente"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-700">
              ¿Está seguro de eliminar este cliente?
            </p>
            <p className="text-sm text-red-600 mt-2">
              <strong>Cliente:</strong> {selectedCliente?.nombre} {selectedCliente?.apellido}
            </p>
            <p className="text-sm text-red-600">
              <strong>Email:</strong> {selectedCliente?.email}
            </p>
          </div>

          <FormField
            label="Motivo de Eliminación"
            name="motivo"
            type="textarea"
            value={motivoEliminacion}
            onChange={(value) => setMotivoEliminacion(value as string)}
            placeholder="Ingrese el motivo de eliminación (10-50 caracteres)"
            required
            minLength={10}
            maxLength={50}
          />

          <FormActions>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Eliminar
            </Button>
          </FormActions>
        </div>
      </Modal>
    </div>
  );
}
