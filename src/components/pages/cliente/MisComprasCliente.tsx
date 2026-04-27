import { useEffect, useMemo, useState } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Button } from '../../Button';
import { useAuth } from '../../AuthContext';
import { useAlertDialog } from '../../AlertDialog';
import { clientes as clientesAPI, ventas as ventasAPI } from '../../../services/api';
import { formatDateEsCo } from '../../../utils/date';
import { Eye, RotateCcw, Search } from 'lucide-react';

interface VentaRow {
  id: number;
  numero_venta?: string;
  fecha: string;
  total: number;
  estado?: string;
  metodopago?: string;
  cliente_id?: number;
}

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || !error) return undefined;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === 'number' ? maybeStatus : undefined;
};

export function MisComprasCliente() {
  const { user } = useAuth();
  const { showAlert, AlertComponent } = useAlertDialog();
  const [loading, setLoading] = useState(true);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [filtroFactura, setFiltroFactura] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [selected, setSelected] = useState<VentaRow | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleItems, setDetalleItems] = useState<any[]>([]);

  const load = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const cliente = (await clientesAPI.getByUsuarioId(user.id)) as { id: number };
      const id = Number(cliente?.id);
      if (!Number.isFinite(id)) {
        setClienteId(null);
        setVentas([]);
        return;
      }
      setClienteId(id);
      const data = await ventasAPI.getByCliente(id);
      setVentas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      const st = getHttpStatus(error);
      if (st === 404) {
        setClienteId(null);
        setVentas([]);
        showAlert({
          title: 'Perfil no encontrado',
          description: 'No hay perfil cliente vinculado a tu usuario.',
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {},
        });
        return;
      }
      showAlert({
        title: 'Error',
        description: 'No se pudieron cargar tus compras.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id]);

  const ventasFiltradas = useMemo(() => {
    const query = filtroFactura.trim().toLowerCase();
    return ventas.filter((venta) => {
      const numero = String(venta.numero_venta || `FAC-${venta.id}`).toLowerCase();
      const estado = String(venta.estado || '').toLowerCase();
      const pago = String(venta.metodopago || '').toLowerCase();
      const matchesSearch = !query || numero.includes(query) || estado.includes(query) || pago.includes(query);
      const f = String(venta.fecha || '').slice(0, 10);
      const matchesDesde = !fechaDesde || f >= fechaDesde;
      const matchesHasta = !fechaHasta || f <= fechaHasta;
      return matchesSearch && matchesDesde && matchesHasta;
    });
  }, [ventas, filtroFactura, fechaDesde, fechaHasta]);

  const columns: Column[] = useMemo(
    () => [
      {
        key: 'numero_venta',
        label: 'Factura',
        render: (_: unknown, row: VentaRow) => row.numero_venta || `FAC-${row.id}`,
      },
      { key: 'fecha', label: 'Fecha', render: (v: string) => formatDateEsCo(v) },
      {
        key: 'total',
        label: 'Total',
        render: (v: number) => `$${Number(v || 0).toLocaleString('es-CO')}`,
      },
      { key: 'estado', label: 'Estado', render: (v: string) => v || '—' },
      {
        key: 'metodopago',
        label: 'Pago',
        render: (v: string) => v || '—',
      },
    ],
    []
  );

  const verDetalle = async (row: VentaRow) => {
    try {
      const full = (await ventasAPI.getById(row.id)) as any;
      setSelected(row);
      const items = Array.isArray(full?.detalles)
        ? full.detalles
        : Array.isArray(full?.items)
          ? full.items
          : [];
      setDetalleItems(items);
      setDetalleOpen(true);
    } catch {
      showAlert({
        title: 'Error',
        description: 'No se pudo cargar el detalle de la factura.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Cargando tus compras...</p>;
  }

  return (
    <div className="space-y-6">
      {AlertComponent}
      <div>
        <h2>Mis compras</h2>
        <p className="text-muted-foreground">Facturas de tus ventas registradas en el sistema</p>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={filtroFactura}
              onChange={(e) => setFiltroFactura(e.target.value)}
              placeholder="Buscar por factura, estado o pago..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => {
              setFiltroFactura('');
              setFechaDesde('');
              setFechaHasta('');
            }}
            disabled={!filtroFactura.trim() && !fechaDesde && !fechaHasta}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          <span className="text-xs text-muted-foreground">Fecha factura:</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {!clienteId ? (
        <p className="text-muted-foreground">No hay perfil cliente para listar compras.</p>
      ) : (
        <DataTable
          columns={columns}
          data={ventasFiltradas}
          actions={[
            {
              label: 'Ver detalle',
              icon: <Eye className="h-4 w-4" />,
              onClick: verDetalle,
              variant: 'default',
            },
          ]}
        />
      )}

      <Modal
        isOpen={detalleOpen}
        onClose={() => {
          setDetalleOpen(false);
          setSelected(null);
          setDetalleItems([]);
        }}
        title={selected ? `Factura ${selected.numero_venta || selected.id}` : 'Detalle'}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Fecha</span>
                <p>{formatDateEsCo(selected.fecha)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total</span>
                <p className="text-primary font-medium">
                  ${Number(selected.total || 0).toLocaleString('es-CO')}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Estado</span>
                <p>{selected.estado || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Método de pago</span>
                <p>{selected.metodopago || '—'}</p>
              </div>
            </div>
            <div className="border-t pt-3">
              <h4 className="mb-2 text-sm font-medium">Productos</h4>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {detalleItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin líneas de detalle.</p>
                ) : (
                  detalleItems.map((line: any) => (
                    <div
                      key={line.id ?? `${line.producto_id}-${line.cantidad}`}
                      className="flex justify-between gap-4 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span>{line.producto_nombre || line.producto || 'Producto'}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {line.cantidad} × ${Number(line.precio_unitario || 0).toLocaleString('es-CO')} = $
                        {Number(line.subtotal || 0).toLocaleString('es-CO')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setDetalleOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
