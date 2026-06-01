import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus } from 'lucide-react';
import { api } from '../../../services/api';
import { settledValue } from '../../../services/routePermissions';
import { formatEntityCode } from '../../../services/mappers';
import { toast } from '../../AlertDialog';
import type { Domicilio, Pedido, Cliente, Usuario, Producto } from '../../../services/types';
import { MotivoModal } from '../../MotivoModal';
import { AlertDialog } from '../../AlertDialog';
import { useAuth } from '../../AuthContext';

interface DomicilioView extends Domicilio {
  clienteNombre?: string;
  repartidorNombre?: string;
  pedidoNumero?: string;
}

export function Domicilios() {
  const { user } = useAuth();
  const esRepartidor = String(user?.rol || '').trim().toLowerCase() === 'repartidor';

  const [domicilios, setDomicilios] = useState<DomicilioView[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [repartidores, setRepartidores] = useState<Usuario[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [domicilioPending, setDomicilioPending] = useState<{
    domicilio: DomicilioView;
    to: Domicilio['estado'];
  } | null>(null);
  const [motivoDomicilio, setMotivoDomicilio] = useState('');
  const [selectedDomicilio, setSelectedDomicilio] = useState<DomicilioView | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroRepartidor, setFiltroRepartidor] = useState<string>('');
  const [formData, setFormData] = useState({
    pedidoId: 0,
    repartidorId: 0
  });
  const [submittingDomicilio, setSubmittingDomicilio] = useState(false);
  // Cuando es edicion, guardamos el domicilio que se esta modificando.
  const [editingDomicilio, setEditingDomicilio] = useState<DomicilioView | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  // Catálogo de productos (para resolver nombres si el backend no los entrega).
  const [productosCatalogo, setProductosCatalogo] = useState<{ id: number; nombre: string }[]>([]);

  const cargarDatos = async () => {
    try {
      const domiciliosSettled = await Promise.allSettled([api.domicilios.getAll()]);
      const domiciliosResult = domiciliosSettled[0];
      if (domiciliosResult.status === 'rejected') {
        console.error('[Domicilios] Error al cargar domicilios:', domiciliosResult.reason);
        toast.error('Error al cargar datos', {
          description:
            domiciliosResult.reason instanceof Error
              ? domiciliosResult.reason.message
              : 'No autorizado o error de red',
        });
        return;
      }
      const domiciliosData = domiciliosResult.value;

      const [pedidosR, clientesR, usuariosR, productosR] = await Promise.allSettled([
        api.pedidos.getAll(),
        api.clientes.getAll(),
        api.usuarios.getAll(),
        api.productos.getAll(),
      ]);

      const pedidosData = settledValue(pedidosR, [] as Pedido[], 'pedidos');
      const clientesData = settledValue(clientesR, [] as Cliente[], 'clientes');
      const usuariosData = settledValue(usuariosR, [] as Usuario[], 'usuarios');
      const productosData = settledValue(productosR, [] as Producto[], 'productos');

      const repartidoresData = usuariosData.filter(
        (u) =>
          String(u.rol || '')
            .trim()
            .toLowerCase() === 'repartidor' && u.estado === 'activo'
      );
      setRepartidores(repartidoresData);
      setPedidos(
        pedidosData.filter(
          (p) => p.estado === 'pendiente' || p.estado === 'en proceso' || p.estado === 'completado'
        )
      );
      setClientes(clientesData);
      setProductosCatalogo(
        productosData.map((p: { id: number; nombre: string }) => ({ id: p.id, nombre: p.nombre }))
      );

      const domiciliosConInfo = domiciliosData.map((domicilio) => {
        const cliente = clientesData.find((c) => c.id === domicilio.clienteId);
        const repartidor = usuariosData.find((u) => u.id === domicilio.repartidorId);
        const pedido = pedidosData.find((p) => p.id === domicilio.pedidoId);
        return {
          ...domicilio,
          clienteNombre:
            domicilio.clienteNombre ||
            (cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'),
          repartidorNombre: repartidor ? `${repartidor.nombre} ${repartidor.apellido}` : 'Desconocido',
          pedidoNumero:
            domicilio.pedidoNumero ||
            (pedido ? formatEntityCode('P', pedido.id) : 'Desconocido'),
        };
      });

      setDomicilios(domiciliosConInfo);
    } catch (error) {
      toast.error('Error al cargar datos');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const totalDomicilioVista = (d: DomicilioView) => {
    const base = d.totalPedidoBase ?? d.total;
    const esq = d.esquemaAbonoPedido ?? '';
    if (esRepartidor && String(esq).includes('50')) return Math.round(Number(base) * 0.5);
    return Math.round(Number(base));
  };

  const valorRestanteDomicilio = (d: DomicilioView) => {
    const base = Math.round(Number(d.totalPedidoBase ?? d.total));
    const esq = String(d.esquemaAbonoPedido || '');
    if (esq.includes('50')) return Math.round(base * 0.5);
    return 0;
  };

  const domicilioEstadoOpciones = (
    estado: Domicilio['estado']
  ): { v: Domicilio['estado']; l: string }[] => {
    if (estado === 'pendiente') {
      return [
        { v: 'pendiente', l: 'Pendiente' },
        { v: 'en ruta', l: 'En Ruta' },
        { v: 'cancelado', l: 'Cancelado' }
      ];
    }
    if (estado === 'en ruta') {
      return [
        { v: 'en ruta', l: 'En Ruta' },
        { v: 'completado', l: 'Completado' },
        { v: 'cancelado', l: 'Cancelado' }
      ];
    }
    if (estado === 'completado') {
      return [{ v: 'completado', l: 'Completado' }];
    }
    if (estado === 'cancelado') {
      return [{ v: 'cancelado', l: 'Cancelado' }];
    }
    return [{ v: estado, l: estado }];
  };

  const ejecutarDomicilioCambio = async (
    domicilio: DomicilioView,
    to: Domicilio['estado'],
    motivo?: string
  ) => {
    try {
      await api.domicilios.changeEstado(domicilio.id, to, motivo);
      if (to === 'completado') {
        toast.success(
          'Domicilio completado. Se han actualizado automáticamente el pedido, venta y abono relacionados.'
        );
      } else {
        toast.success(`Estado cambiado a ${to}`);
      }
      setDomicilioPending(null);
      setMotivoDomicilio('');
      cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
      setDomicilioPending(null);
      setMotivoDomicilio('');
      cargarDatos();
    }
  };

  const handleDomicilioEstadoSelect = (domicilio: DomicilioView, to: Domicilio['estado']) => {
    if (domicilio.estado === to) return;
    if (domicilio.estado === 'completado' || domicilio.estado === 'cancelado') {
      toast.error('No se puede modificar el estado de un domicilio en estado final');
      return;
    }
    if (to === 'cancelado') {
      setDomicilioPending({ domicilio, to });
      setMotivoDomicilio('');
      return;
    }
    if (to === 'completado') {
      setDomicilioPending({ domicilio, to });
      return;
    }
    void ejecutarDomicilioCambio(domicilio, to);
  };

  const confirmDomicilioCancelMotivo = async () => {
    if (!domicilioPending || domicilioPending.to !== 'cancelado') return;
    const m = motivoDomicilio.trim();
    if (m.length < 10 || m.length > 50) {
      toast.error('El motivo debe tener entre 10 y 50 caracteres');
      return;
    }
    await ejecutarDomicilioCambio(domicilioPending.domicilio, 'cancelado', m);
  };

  const confirmDomicilioCompletar = () => {
    if (!domicilioPending || domicilioPending.to !== 'completado') return;
    void ejecutarDomicilioCambio(domicilioPending.domicilio, 'completado');
  };

  const columns: Column[] = [
    {
      key: 'id',
      label: 'ID Domicilio',
      render: (value: number) => formatEntityCode('D', value)
    },
    {
      key: 'pedidoNumero',
      label: 'ID Pedido'
    },
    {
      key: 'clienteNombre',
      label: 'Cliente'
    },
    {
      key: 'productos',
      label: 'Productos',
      render: (productos: any[]) => (
        <span className="text-sm">
          {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
        </span>
      )
    },
    {
      key: 'total',
      label: 'Total',
      render: (_total: number, row: DomicilioView) => formatCurrency(totalDomicilioVista(row)),
    },
    {
      key: 'fechaPedido',
      label: 'Fecha Pedido'
    },
    {
      key: 'fechaEntrega',
      label: 'Fecha Entrega'
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: string, row: DomicilioView) => {
        const opts = domicilioEstadoOpciones(row.estado);
        const locked = opts.length === 1;
        const bg =
          row.estado === 'completado'
            ? '#dcfce7'
            : row.estado === 'en ruta'
              ? '#dbeafe'
              : row.estado === 'pendiente'
                ? '#fef9c3'
                : '#fee2e2';
        const fg =
          row.estado === 'completado'
            ? '#166534'
            : row.estado === 'en ruta'
              ? '#1e40af'
              : row.estado === 'pendiente'
                ? '#854d0e'
                : '#991b1b';
        return (
          <select
            value={row.estado}
            onChange={(e) =>
              handleDomicilioEstadoSelect(row, e.target.value as Domicilio['estado'])
            }
            disabled={locked}
            className="px-3 py-1 rounded-full text-xs border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: bg, color: fg }}
            onClick={(e) => e.stopPropagation()}
          >
            {opts.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        );
      }
    }
  ];

  const pedidosParaNuevoDomicilio = useMemo(() => {
    // Una vez el pedido tenga un domicilio asignado (pendiente, en ruta o completado)
    // ya no debe volver a aparecer en la lista de "Nuevos domicilios". Solo
    // si el unico domicilio asociado fue cancelado, el pedido vuelve a estar disponible.
    const conDomicilio = new Set(
      domicilios.filter((d) => d.estado !== 'cancelado').map((d) => d.pedidoId)
    );
    return pedidos.filter((p) => !conDomicilio.has(p.id));
  }, [domicilios, pedidos]);

  const handleAdd = () => {
    setEditingDomicilio(null);
    setFormData({
      pedidoId: 0,
      repartidorId: 0
    });
    setIsModalOpen(true);
  };

  const handleEdit = (domicilio: DomicilioView) => {
    if (domicilio.estado === 'completado' || domicilio.estado === 'cancelado') {
      toast.error('No se puede editar un domicilio en estado final');
      return;
    }
    setEditingDomicilio(domicilio);
    setFormData({
      pedidoId: domicilio.pedidoId,
      repartidorId: domicilio.repartidorId,
    });
    setIsModalOpen(true);
  };

  const editarDomicilioDesdeFormulario = async () => {
    if (submittingDomicilio || !editingDomicilio) return;

    const repartidorId = Number(formData.repartidorId);
    if (!Number.isFinite(repartidorId) || repartidorId <= 0) {
      toast.error('Seleccione un repartidor');
      return;
    }

    if (
      Number(editingDomicilio.repartidorId) === repartidorId
    ) {
      toast.error('Seleccione un repartidor distinto al actual para guardar el cambio');
      return;
    }

    const repartidor = repartidores.find((u) => u.id === repartidorId);
    const repartidorNombre = repartidor ? `${repartidor.nombre} ${repartidor.apellido}`.trim() : '';

    setSubmittingDomicilio(true);
    try {
      await api.domicilios.update(editingDomicilio.id, {
        repartidorId,
        repartidorNombre,
      });
      toast.success('Domicilio actualizado exitosamente');
      setIsModalOpen(false);
      setEditingDomicilio(null);
      setFormData({ pedidoId: 0, repartidorId: 0 });
      await cargarDatos();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al actualizar domicilio';
      toast.error(msg);
    } finally {
      setSubmittingDomicilio(false);
    }
  };

  const crearDomicilioDesdeFormulario = async () => {
    if (submittingDomicilio) return;

    const pedidoId = Number(formData.pedidoId);
    const repartidorId = Number(formData.repartidorId);

    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      toast.error('Seleccione un pedido');
      return;
    }

    if (!Number.isFinite(repartidorId) || repartidorId <= 0) {
      toast.error('Seleccione un repartidor');
      return;
    }

    const pedido =
      pedidosParaNuevoDomicilio.find((p) => p.id === pedidoId) || pedidos.find((p) => p.id === pedidoId);
    if (!pedido) {
      toast.error('Pedido no encontrado o ya tiene entrega en curso (pendiente / en ruta)');
      return;
    }

    if (repartidores.length === 0) {
      toast.error('No hay repartidores activos. Cree o active un usuario con rol Repartidor.');
      return;
    }

    setSubmittingDomicilio(true);
    try {
      await api.domicilios.create({
        pedidoId,
        clienteId: pedido.clienteId,
        repartidorId,
        productos: pedido.productos,
        total: pedido.total,
        fechaPedido: pedido.fechaPedido,
        fechaEntrega: pedido.fechaEntrega,
        estado: 'pendiente',
        repartidorNombre: (() => {
          const r = repartidores.find((u) => u.id === repartidorId);
          return r ? `${r.nombre} ${r.apellido}`.trim() : '';
        })(),
        direccionFallback: clientes.find((c) => c.id === pedido.clienteId)?.direccion || '',
      });

      toast.success('Domicilio creado exitosamente');
      setIsModalOpen(false);
      setFormData({ pedidoId: 0, repartidorId: 0 });
      await cargarDatos();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al crear domicilio';
      toast.error(msg);
    } finally {
      setSubmittingDomicilio(false);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDomicilio) {
      void editarDomicilioDesdeFormulario();
    } else {
      void crearDomicilioDesdeFormulario();
    }
  };

  const domiciliosFiltrados = domicilios.filter(domicilio => {
    const matchBusqueda = busqueda.length === 0 ||
      busqueda.length >= 2 &&
      (domicilio.clienteNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
       domicilio.repartidorNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
       domicilio.pedidoNumero?.toLowerCase().includes(busqueda.toLowerCase()) ||
       String(domicilio.id).includes(busqueda));

    const matchEstado = !filtroEstado || domicilio.estado === filtroEstado;
    const matchRepartidor = !filtroRepartidor || String(domicilio.repartidorId) === filtroRepartidor;

    return matchBusqueda && matchEstado && matchRepartidor;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Domicilios</h2>
          <p className="text-muted-foreground">Administra las entregas a domicilio</p>
        </div>
        {!esRepartidor ? (
          <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
            Nuevo Domicilio
          </Button>
        ) : null}
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
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por estado</option>
              <option value="pendiente">Pendiente</option>
              <option value="en ruta">En Ruta</option>
              <option value="completado">Completado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            {!esRepartidor ? (
              <select
                value={filtroRepartidor}
                onChange={(e) => setFiltroRepartidor(e.target.value)}
                className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
              >
                <option value="">Filtrar por repartidor</option>
                {repartidores.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.nombre} {r.apellido}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroEstado('');
                setFiltroRepartidor('');
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
        data={domiciliosFiltrados}
        getRowKey={(row) => row.id}
        actions={[
          commonActions.view(async (domicilio) => {
            try {
              const detalle = await api.domicilios.getById((domicilio as DomicilioView).id);
              const base = domicilio as DomicilioView;
              setSelectedDomicilio({
                ...base,
                ...detalle,
                clienteNombre: base.clienteNombre,
                repartidorNombre: base.repartidorNombre,
                pedidoNumero: base.pedidoNumero,
              });
            } catch {
              setSelectedDomicilio(domicilio as DomicilioView);
            }
            setIsDetailModalOpen(true);
          }),
          ...(esRepartidor ? [] : [commonActions.edit(handleEdit)]),
        ]}
      />

      <MotivoModal
        isOpen={!!domicilioPending && domicilioPending.to === 'cancelado'}
        onClose={() => {
          setDomicilioPending(null);
          setMotivoDomicilio('');
        }}
        title="Cancelar domicilio"
        description={
          domicilioPending ? (
            <>
              <p>
                <strong>Domicilio:</strong> #
                {formatEntityCode('D', domicilioPending.domicilio.id)}
              </p>
              <p className="text-muted-foreground">
                Estado actual: {domicilioPending.domicilio.estado}
              </p>
            </>
          ) : null
        }
        motivo={motivoDomicilio}
        onMotivoChange={setMotivoDomicilio}
        onConfirm={confirmDomicilioCancelMotivo}
      />

      <AlertDialog
        isOpen={!!domicilioPending && domicilioPending.to === 'completado'}
        onClose={() => {
          setDomicilioPending(null);
          setMotivoDomicilio('');
        }}
        onConfirm={confirmDomicilioCompletar}
        title="Completar domicilio"
        description="Esta acción sincroniza pedido, venta y abono como completados. ¿Desea continuar?"
        type="warning"
        confirmText="Completar"
      />

      {/* Modal de formulario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDomicilio(null);
        }}
        title={editingDomicilio ? 'Editar Domicilio' : 'Nuevo Domicilio'}
        size="md"
      >
        <Form onSubmit={handleSubmitForm} noValidate>
          <div className="space-y-4">
            {!editingDomicilio && pedidosParaNuevoDomicilio.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay pedidos disponibles sin domicilio activo (pedidos pendientes o en proceso que aún no tengan entrega asignada).
              </p>
            ) : null}

            {editingDomicilio ? (
              <div className="p-3 rounded-lg bg-accent text-sm">
                <p>
                  <strong>Domicilio:</strong> {formatEntityCode('D', editingDomicilio.id)}
                </p>
                <p>
                  <strong>Pedido asignado:</strong> {editingDomicilio.pedidoNumero}
                </p>
                <p className="text-muted-foreground">
                  Solo se puede actualizar el repartidor asignado a este domicilio.
                </p>
              </div>
            ) : (
              <FormField
                label="Pedido"
                name="pedidoId"
                type="select"
                selectPlaceholder={false}
                value={formData.pedidoId <= 0 ? '' : String(formData.pedidoId)}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    pedidoId: value === '' ? 0 : Number(value) || 0
                  }))
                }
                options={[
                  { value: '', label: 'Seleccione un pedido' },
                  ...pedidosParaNuevoDomicilio.map(p => {
                    const cliente = clientes.find(c => c.id === p.clienteId);
                    return {
                      value: String(p.id),
                      label: `Pedido ${formatEntityCode('P', p.id)} - ${cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'} - Entrega: ${p.fechaEntrega}`
                    };
                  })
                ]}
              />
            )}

            <FormField
              label="Repartidor"
              name="repartidorId"
              type="select"
              selectPlaceholder={false}
              value={formData.repartidorId <= 0 ? '' : String(formData.repartidorId)}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  repartidorId: value === '' ? 0 : Number(value) || 0
                }))
              }
              options={[
                { value: '', label: 'Seleccione un repartidor' },
                ...repartidores.map(r => ({
                  value: String(r.id),
                  label: `${r.nombre} ${r.apellido}`
                }))
              ]}
            />

            {!editingDomicilio && formData.pedidoId > 0 && (
              <div className="p-4 bg-accent rounded-lg">
                <p className="text-sm">
                  <strong>Información del Pedido:</strong>
                </p>
                {(() => {
                  const pedido =
                    pedidosParaNuevoDomicilio.find((p) => p.id === formData.pedidoId) ||
                    pedidos.find((p) => p.id === formData.pedidoId);
                  const cliente = pedido ? clientes.find(c => c.id === pedido.clienteId) : null;
                  return pedido ? (
                    <>
                      <p className="text-sm mt-2">Cliente: {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'}</p>
                      <p className="text-sm">Total: {formatCurrency(pedido.total)}</p>
                      <p className="text-sm">Fecha Entrega: {pedido.fechaEntrega}</p>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          <FormActions>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setEditingDomicilio(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                submittingDomicilio ||
                (!editingDomicilio && pedidosParaNuevoDomicilio.length === 0) ||
                repartidores.length === 0
              }
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (editingDomicilio) {
                  void editarDomicilioDesdeFormulario();
                } else {
                  void crearDomicilioDesdeFormulario();
                }
              }}
            >
              {submittingDomicilio
                ? editingDomicilio
                  ? 'Guardando…'
                  : 'Creando…'
                : editingDomicilio
                  ? 'Guardar Cambios'
                  : 'Crear Domicilio'}
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Domicilio"
        size="lg"
      >
        {selectedDomicilio && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">Domicilio {formatEntityCode('D', selectedDomicilio.id)}</h3>
                <p className="text-sm text-muted-foreground">{selectedDomicilio.clienteNombre}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm ${
                selectedDomicilio.estado === 'completado' ? 'bg-green-100 text-green-700' :
                selectedDomicilio.estado === 'en ruta' ? 'bg-blue-100 text-blue-700' :
                selectedDomicilio.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {selectedDomicilio.estado === 'completado' ? 'Completado' :
                 selectedDomicilio.estado === 'en ruta' ? 'En Ruta' :
                 selectedDomicilio.estado === 'pendiente' ? 'Pendiente' : 'Cancelado'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Pedido</label>
                <p className="mt-1">{selectedDomicilio.pedidoNumero}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Cliente</label>
                <p className="mt-1">{selectedDomicilio.clienteNombre}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Repartidor</label>
                <p className="mt-1">{selectedDomicilio.repartidorNombre}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Total</label>
                <p className="mt-1 font-semibold text-lg">
                  {formatCurrency(totalDomicilioVista(selectedDomicilio))}
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Valor restante por cobrar</label>
                <p className="mt-1 font-semibold">
                  {formatCurrency(valorRestanteDomicilio(selectedDomicilio))}
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Dirección de Entrega</label>
                <p className="mt-1">{selectedDomicilio.direccion || 'No especificada'}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Teléfono de Contacto</label>
                <p className="mt-1">{selectedDomicilio.telefono || 'No especificado'}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha Pedido</label>
                <p className="mt-1">{selectedDomicilio.fechaPedido}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha Entrega</label>
                <p className="mt-1">{selectedDomicilio.fechaEntrega}</p>
              </div>
            </div>

            {selectedDomicilio.motivoCancelacion && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <label className="text-sm text-red-700 block mb-2 font-medium">Motivo de Cancelación</label>
                <p className="text-sm text-red-600">{selectedDomicilio.motivoCancelacion}</p>
              </div>
            )}

            <div className="p-4 bg-accent/50 rounded-lg">
              <label className="text-sm text-muted-foreground block mb-3 font-medium">Productos</label>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-accent/50">
                    <tr>
                      <th className="text-left p-2">Producto</th>
                      <th className="text-right p-2">Cantidad</th>
                      <th className="text-right p-2">Precio Unit.</th>
                      <th className="text-right p-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDomicilio.productos.map((producto, index) => {
                      const prod = productosCatalogo.find((p) => p.id === producto.productoId);
                      return (
                        <tr key={index} className="border-t">
                          <td className="p-2">{producto.nombre || prod?.nombre || `Producto ${producto.productoId}`}</td>
                          <td className="text-right p-2">{producto.cantidad}</td>
                          <td className="text-right p-2">{formatCurrency(producto.precio)}</td>
                          <td className="text-right p-2">{formatCurrency(producto.subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

