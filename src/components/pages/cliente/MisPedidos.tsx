import React, { useEffect, useMemo, useState } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Button } from '../../Button';
import { Form, FormActions, FormField } from '../../Form';
import { Edit, Eye, Package, RotateCcw, Search } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { useAlertDialog } from '../../AlertDialog';
import { clientes as clientesAPI, pedidos as pedidosAPI } from '../../../services/api';
import { formatDateEsCo } from '../../../utils/date';

interface Pedido {
  id: number;
  numero_pedido?: string;
  fecha: string;
  fecha_entrega?: string;
  detalles?: string;
  total: number;
  estado: string;
  cliente_id: number;
  detallesLineas?: Array<{
    id?: number;
    producto_nombre?: string;
    cantidad?: number;
    precio_unitario?: number;
    subtotal?: number;
  }>;
}

interface Cliente {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
}

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || !error) return undefined;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === 'number' ? maybeStatus : undefined;
};

const estadoClassName = (estado: string) => {
  if (estado === 'Completado' || estado === 'Entregado') return 'bg-green-100 text-green-700';
  if (estado === 'En Proceso' || estado === 'En Camino' || estado === 'En Preparacion') return 'bg-blue-100 text-blue-700';
  if (estado === 'Pendiente') return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
};

const esEditable = (estado: string) => estado === 'Pendiente' || estado === 'En Proceso';

export function MisPedidos() {
  const { user } = useAuth();
  const { showAlert, AlertComponent } = useAlertDialog();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    fechaDesde: '',
    fechaHasta: '',
    estado: ''
  });
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    fecha_entrega: '',
    detalles: ''
  });

  const loadPedidosCliente = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const clienteData = (await clientesAPI.getByUsuarioId(user.id)) as Cliente;
      setCliente(clienteData);

      const pedidosData = (await pedidosAPI.getByCliente(clienteData.id)) as Pedido[];
      setPedidos(Array.isArray(pedidosData) ? pedidosData : []);
    } catch (error) {
      console.error('Error cargando pedidos del cliente:', error);
      const status = getHttpStatus(error);

      if (status === 404) {
        setCliente(null);
        setPedidos([]);
        showAlert({
          title: 'Perfil de cliente no encontrado',
          description: 'Tu usuario esta autenticado, pero no existe en la tabla de clientes. Solicita al administrador crear o vincular tu perfil para consultar pedidos.',
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        return;
      }

      showAlert({
        title: 'No fue posible cargar tus pedidos',
        description: 'Verifica la conexion con el backend e intenta nuevamente.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPedidosCliente();
  }, [user?.id]);

  const pedidosFiltrados = useMemo(() => {
    const query = search.trim().toLowerCase();

    return pedidos.filter((pedido) => {
      const numero = (pedido.numero_pedido || pedido.id.toString()).toLowerCase();
      const estado = (pedido.estado || '').toLowerCase();
      const matchesSearch = !query || numero.includes(query) || estado.includes(query);
      const f = String(pedido.fecha || '').slice(0, 10);
      const matchesDesde = !filters.fechaDesde || f >= filters.fechaDesde;
      const matchesHasta = !filters.fechaHasta || f <= filters.fechaHasta;
      const matchesEstado = !filters.estado || pedido.estado === filters.estado;
      return matchesSearch && matchesDesde && matchesHasta && matchesEstado;
    });
  }, [pedidos, search, filters]);

  const columns: Column[] = [
    {
      key: 'numero_pedido',
      label: 'Pedido',
      render: (_: unknown, row: Pedido) => row.numero_pedido || `PED-${row.id}`
    },
    { key: 'fecha', label: 'Fecha', render: (fecha: string) => formatDateEsCo(fecha) },
    {
      key: 'total',
      label: 'Total',
      render: (value: number) => `$${Number(value || 0).toLocaleString('es-CO')}`
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (estado: string) => (
        <span className={`px-3 py-1 rounded-full text-xs ${estadoClassName(estado)}`}>{estado}</span>
      )
    }
  ];

  const handleView = async (pedido: Pedido) => {
    try {
      const detalle = (await pedidosAPI.getById(Number(pedido.id))) as Pedido & { detalles?: Pedido['detallesLineas'] };
      const detallesLineas = Array.isArray((detalle as any)?.detalles) ? (detalle as any).detalles : [];
      setSelectedPedido({ ...(detalle || pedido), detallesLineas });
      setIsDetailModalOpen(true);
    } catch (error) {
      console.error('Error consultando detalle de pedido:', error);
      showAlert({
        title: 'No se pudo abrir el detalle',
        description: 'Intenta nuevamente en unos segundos.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    }
  };

  const handleOpenEdit = (pedido: Pedido) => {
    if (!esEditable(pedido.estado)) {
      showAlert({
        title: 'Pedido no editable',
        description: 'Solo puedes editar pedidos en estado Pendiente o En Proceso.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    setSelectedPedido(pedido);
    setEditData({
      fecha_entrega: pedido.fecha_entrega || '',
      detalles: pedido.detalles || ''
    });
    setIsEditModalOpen(true);
  };

  const handleUpdatePedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPedido) return;

    try {
      setSaving(true);
      await pedidosAPI.update(Number(selectedPedido.id), {
        fecha_entrega: editData.fecha_entrega || null,
        detalles: editData.detalles
      });

      await loadPedidosCliente();
      setIsEditModalOpen(false);
      setSelectedPedido(null);

      showAlert({
        title: 'Pedido actualizado',
        description: 'Los cambios del pedido se guardaron correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } catch (error) {
      console.error('Error actualizando pedido:', error);
      showAlert({
        title: 'No se pudo actualizar',
        description: 'Revisa los datos e intenta nuevamente.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Cargando tus pedidos...</p>;
  }

  return (
    <div className="space-y-6">
      {AlertComponent}

      <div className="flex items-center justify-between">
        <div>
          <h2>Mis Pedidos</h2>
          <p className="text-muted-foreground">
            {cliente ? `${cliente.nombre}, aqui puedes revisar estado y editar tus pedidos.` : 'Consulta el estado de tus pedidos'}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por numero o estado..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => {
              setSearch('');
              setFilters({ fechaDesde: '', fechaHasta: '', estado: '' });
            }}
            disabled={!search.trim() && !filters.fechaDesde && !filters.fechaHasta && !filters.estado}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          <span className="text-xs text-muted-foreground">Fecha pedido:</span>
          <input
            type="date"
            value={filters.fechaDesde}
            onChange={(event) => setFilters((current) => ({ ...current, fechaDesde: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <input
            type="date"
            value={filters.fechaHasta}
            onChange={(event) => setFilters((current) => ({ ...current, fechaHasta: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={filters.estado}
            onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Estado (todos)</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En Proceso">En Proceso</option>
            <option value="Completado">Completado</option>
            <option value="Entregado">Entregado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={pedidosFiltrados}
        actions={[
          {
            label: 'Ver detalle',
            icon: <Eye className="w-4 h-4" />,
            onClick: handleView,
            variant: 'default'
          },
          {
            label: 'Editar pedido',
            icon: <Edit className="w-4 h-4" />,
            onClick: handleOpenEdit,
            variant: 'primary'
          }
        ]}
      />

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedPedido(null);
        }}
        title={`Detalle ${selectedPedido?.numero_pedido || `PED-${selectedPedido?.id}`}`}
        size="lg"
      >
        {selectedPedido && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">{selectedPedido.numero_pedido || `PED-${selectedPedido.id}`}</h3>
                <p className="text-sm text-muted-foreground">Fecha: {selectedPedido.fecha}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm ${estadoClassName(selectedPedido.estado)}`}>
                {selectedPedido.estado}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Total</label>
                <p className="mt-1 text-primary text-lg">${Number(selectedPedido.total || 0).toLocaleString('es-CO')}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha estimada de entrega</label>
                <p className="mt-1">{selectedPedido.fecha_entrega || 'Sin definir'}</p>
              </div>
              <div className="col-span-2">
                <label className="text-sm text-muted-foreground">Notas / resumen</label>
                <p className="mt-1">{selectedPedido.detalles || 'Sin notas adicionales'}</p>
              </div>
            </div>

            {selectedPedido.detallesLineas && selectedPedido.detallesLineas.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Producto</th>
                      <th className="px-3 py-2 text-right font-medium">Cant.</th>
                      <th className="px-3 py-2 text-right font-medium">P. unit.</th>
                      <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPedido.detallesLineas.map((line) => (
                      <tr key={line.id ?? `${line.producto_nombre}-${line.cantidad}`} className="border-t border-border">
                        <td className="px-3 py-2">{line.producto_nombre || '—'}</td>
                        <td className="px-3 py-2 text-right">{line.cantidad ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          ${Number(line.precio_unitario || 0).toLocaleString('es-CO')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${Number(line.subtotal || 0).toLocaleString('es-CO')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="p-4 bg-accent/50 rounded-lg">
              <label className="text-sm text-muted-foreground block mb-4">Estado del Pedido</label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-white">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm">Pedido recibido</p>
                    <p className="text-xs text-muted-foreground">{selectedPedido.fecha}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      selectedPedido.estado !== 'Pendiente' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                  </div>
                  <p className="text-sm">En proceso</p>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      selectedPedido.estado === 'Completado' || selectedPedido.estado === 'Entregado'
                        ? 'bg-green-600 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                  </div>
                  <p className="text-sm">Completado</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedPedido(null);
        }}
        title={`Editar ${selectedPedido?.numero_pedido || `PED-${selectedPedido?.id}`}`}
        size="md"
      >
        <Form onSubmit={handleUpdatePedido}>
          <FormField
            label="Fecha de entrega"
            name="fecha_entrega"
            type="date"
            value={editData.fecha_entrega}
            onChange={(value) => setEditData((prev) => ({ ...prev, fecha_entrega: String(value) }))}
          />

          <FormField
            label="Detalle / observaciones"
            name="detalles"
            type="textarea"
            value={editData.detalles}
            onChange={(value) => setEditData((prev) => ({ ...prev, detalles: String(value) }))}
            rows={4}
          />

          <FormActions>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </FormActions>
        </Form>
      </Modal>
    </div>
  );
}
