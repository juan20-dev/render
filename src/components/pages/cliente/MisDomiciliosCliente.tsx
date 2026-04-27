import { useEffect, useState } from 'react';
import { DataTable, Column } from '../../DataTable';
import { useAuth } from '../../AuthContext';
import { useAlertDialog } from '../../AlertDialog';
import { clientes as clientesAPI, domicilios as domiciliosAPI } from '../../../services/api';
import { formatDateEsCo } from '../../../utils/date';

interface DomicilioRow {
  id: number;
  numero_domicilio?: string;
  pedido_id: number;
  pedido?: string;
  direccion: string;
  repartidor?: string;
  fecha: string;
  hora?: string;
  estado: string;
  detalle?: string;
}

const estadoClass = (estado: string) => {
  const e = String(estado || '');
  if (e === 'Entregado') return 'bg-green-100 text-green-800';
  if (e === 'En Camino') return 'bg-blue-100 text-blue-800';
  if (e === 'Pendiente') return 'bg-amber-100 text-amber-800';
  if (e === 'Cancelado') return 'bg-muted text-muted-foreground';
  return 'bg-accent text-foreground';
};

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || !error) return undefined;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === 'number' ? maybeStatus : undefined;
};

export function MisDomiciliosCliente() {
  const { user } = useAuth();
  const { showAlert, AlertComponent } = useAlertDialog();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DomicilioRow[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      try {
        setLoading(true);
        const cliente = (await clientesAPI.getByUsuarioId(user.id)) as { id: number };
        const id = Number(cliente?.id);
        if (!Number.isFinite(id)) {
          setRows([]);
          return;
        }
        const data = await domiciliosAPI.getByCliente(id);
        setRows(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        const st = getHttpStatus(error);
        if (st === 404) {
          setRows([]);
          showAlert({
            title: 'Perfil no encontrado',
            description: 'No hay perfil cliente vinculado.',
            type: 'warning',
            confirmText: 'Entendido',
            onConfirm: () => {},
          });
          return;
        }
        showAlert({
          title: 'Error',
          description: 'No se pudieron cargar tus domicilios.',
          type: 'danger',
          confirmText: 'Entendido',
          onConfirm: () => {},
        });
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [user?.id]);

  const columns: Column[] = [
    {
      key: 'numero_domicilio',
      label: 'Domicilio',
      render: (_: unknown, row: DomicilioRow) => row.numero_domicilio || `#${row.id}`,
    },
    {
      key: 'pedido',
      label: 'Pedido',
      render: (v: string, row: DomicilioRow) => v || (row.pedido_id ? `PED-${row.pedido_id}` : '—'),
    },
    { key: 'fecha', label: 'Fecha', render: (v: string) => formatDateEsCo(v) },
    {
      key: 'estado',
      label: 'Estado',
      render: (estado: string) => (
        <span className={`rounded-full px-2 py-0.5 text-xs ${estadoClass(estado)}`}>{estado}</span>
      ),
    },
    { key: 'repartidor', label: 'Repartidor', render: (v: string) => v || '—' },
    {
      key: 'direccion',
      label: 'Dirección',
      render: (v: string) => <span className="line-clamp-2 max-w-xs">{v}</span>,
    },
  ];

  if (loading) {
    return <p className="text-muted-foreground">Cargando domicilios...</p>;
  }

  return (
    <div className="space-y-6">
      {AlertComponent}
      <div>
        <h2>Mis domicilios</h2>
        <p className="text-muted-foreground">
          Historial ordenado por prioridad de estado (pendientes y en camino primero).
        </p>
      </div>
      <DataTable columns={columns} data={rows} />
    </div>
  );
}
