import React, { useEffect, useState } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Button } from '../../Button';
import { Eye, Package } from 'lucide-react';
import { api } from '../../../services/api';
import { formatEntityCode } from '../../../services/mappers';

type PedidoView = {
  id: string;
  fecha: string;
  productos: string;
  total: number;
  estado: string;
  domicilioEstado?: string | null;
  direccion: string;
  metodoPago: string;
  observaciones?: string;
};

export function MisPedidos() {
  const [pedidos, setPedidos] = useState<PedidoView[]>([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<PedidoView | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await api.pedidos.getAll();
        const mapped: PedidoView[] = await Promise.all(
          (rows || []).map(async (p: any) => {
            let detalle = null;
            try {
              detalle = await api.pedidos.getById(Number(p.id));
            } catch {
              detalle = p;
            }
            const productsText = (detalle?.productos || [])
              .map((x: any) => `#${x.productoId} x${x.cantidad}`)
              .join(', ');
            const dom = (detalle as { domicilio?: { estado?: string } } | null)?.domicilio;
            const domEstado = dom?.estado ? String(dom.estado) : null;
            return {
              id: formatEntityCode('P', p.id),
              fecha: p.fechaPedido,
              productos: productsText || `${(p.productos || []).length} productos`,
              total: Number(p.total || 0),
              estado: String(p.estado || ''),
              domicilioEstado: domEstado,
              direccion: 'Dirección registrada en pedido',
              metodoPago: String(p.metodoPago || ''),
              observaciones: undefined,
            };
          })
        );
        setPedidos(mapped);
      } catch {
        setPedidos([]);
      }
    };
    load();
  }, []);

  const columns: Column[] = [
    { key: 'id', label: 'ID Pedido' },
    { key: 'fecha', label: 'Fecha' },
    { key: 'productos', label: 'Productos' },
    {
      key: 'total',
      label: 'Total',
      render: (value: number) => `$${value.toLocaleString('es-CO')}`,
    },
    {
      key: 'domicilioEstado',
      label: 'Domicilio',
      render: (v: string | null | undefined) =>
        v ? (
          <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{v}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin domicilio</span>
        ),
    },
    {
      key: 'estado',
      label: 'Estado pedido',
      render: (estado: string) => (
        <select
          value={estado}
          disabled
          className="px-3 py-1 rounded-full text-xs border-0 cursor-default opacity-90"
          style={{
            backgroundColor: estado.includes('complet') || estado.includes('Entregado')
              ? '#dcfce7'
              : estado.includes('proceso') || estado.includes('Camino')
                ? '#dbeafe'
                : estado.includes('pend')
                  ? '#fef9c3'
                  : '#fee2e2',
            color: estado.includes('complet') || estado.includes('Entregado')
              ? '#166534'
              : estado.includes('proceso') || estado.includes('Camino')
                ? '#1e40af'
                : estado.includes('pend')
                  ? '#854d0e'
                  : '#991b1b',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value={estado}>{estado}</option>
        </select>
      ),
    },
  ];

  const handleView = (pedido: PedidoView) => {
    setSelectedPedido(pedido);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Mis Pedidos</h2>
          <p className="text-muted-foreground">Consulta el estado de tus pedidos</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={pedidos}
        actions={[
          {
            label: 'Ver Detalle',
            icon: <Eye className="w-4 h-4" />,
            onClick: handleView,
            variant: 'default',
          },
        ]}
        onSearch={() => undefined}
        searchPlaceholder="Buscar ..."
      />

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedPedido(null);
        }}
        title={`Detalle de Pedido ${selectedPedido?.id}`}
        size="lg"
      >
        {selectedPedido && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">{selectedPedido.id}</h3>
                <p className="text-sm text-muted-foreground">{selectedPedido.fecha}</p>
              </div>
              <span className="px-4 py-2 rounded-full text-sm bg-blue-100 text-blue-700">{selectedPedido.estado}</span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Productos</label>
                <p className="mt-1">{selectedPedido.productos}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Total</label>
                <p className="mt-1 text-primary text-lg">${selectedPedido.total.toLocaleString('es-CO')}</p>
              </div>
              <div className="col-span-2">
                <label className="text-sm text-muted-foreground">Dirección de Entrega</label>
                <p className="mt-1">{selectedPedido.direccion}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Método de Pago</label>
                <p className="mt-1">{selectedPedido.metodoPago}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha del Pedido</label>
                <p className="mt-1">{selectedPedido.fecha}</p>
              </div>
            </div>

            <div className="p-4 bg-accent/50 rounded-lg">
              {selectedPedido.domicilioEstado ? (
                <p className="text-sm mb-3">
                  <span className="text-muted-foreground">Domicilio: </span>
                  <span className="font-medium">{selectedPedido.domicilioEstado}</span>
                </p>
              ) : null}
              <label className="text-sm text-muted-foreground block mb-4">Estado del pedido</label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-white">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm">Seguimiento disponible en tiempo real</p>
                    <p className="text-xs text-muted-foreground">Estado actual: {selectedPedido.estado}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedPedido(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
