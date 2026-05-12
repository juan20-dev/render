import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Button } from '../../Button';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import type { Insumo } from '../../../services/types';

interface InsumoView extends Insumo {
  operarioNombre?: string;
}

export function Insumos() {
  const [insumos, setInsumos] = useState<InsumoView[]>([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedInsumo, setSelectedInsumo] = useState<InsumoView | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [filtroOperario, setFiltroOperario] = useState<string>('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const insumosData = await api.insumos.getAll();
      const insumosConInfo: InsumoView[] = insumosData.map((insumo) => ({
        ...insumo,
        operarioNombre: insumo.operario?.trim() || undefined,
      }));
      setInsumos(insumosConInfo);
    } catch {
      toast.error('Error al cargar datos');
    }
  };

  const operariosUnicos = Array.from(
    new Set(insumos.map((i) => i.operarioNombre).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const columns: Column[] = [
    {
      key: 'id',
      label: 'ID',
      render: (value: number) => `#${String(value).padStart(4, '0')}`,
    },
    {
      key: 'nombre',
      label: 'Nombre',
      render: (v: string) => <span className="font-medium text-foreground">{v}</span>,
    },
    {
      key: 'cantidad',
      label: 'Stock',
      render: (_: number, row: InsumoView) => (
        <span className="text-sm tabular-nums">
          {row.cantidad}
          {row.unidad ? <span className="text-muted-foreground"> ({row.unidad})</span> : null}
        </span>
      ),
    },
    {
      key: 'stockMinimo',
      label: 'Stock mín.',
      render: (v: number | undefined) => (
        <span className="text-sm tabular-nums text-muted-foreground">{v ?? '—'}</span>
      ),
    },
    {
      key: 'categoriaNombre',
      label: 'Categoría',
      render: (v: string | undefined) => <span className="text-sm">{v?.trim() || '—'}</span>,
    },
    {
      key: 'operarioNombre',
      label: 'Último operario',
      render: (v: string | undefined) => v || '—',
    },
    {
      key: 'fechaUltimaModificacion',
      label: 'Última actividad',
      render: (v: string | undefined) => v || '—',
    },
  ];

  const handleViewDetail = (insumo: InsumoView) => {
    setSelectedInsumo(insumo);
    setIsDetailModalOpen(true);
  };

  const insumosFiltrados = insumos.filter((insumo) => {
    const matchBusqueda =
      busqueda.length === 0 ||
      (busqueda.length >= 2 &&
        (insumo.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          (insumo.operarioNombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
          String(insumo.id).includes(busqueda)));

    const matchFecha = !filtroFecha || (insumo.fechaUltimaModificacion || '') === filtroFecha;
    const matchOperario = !filtroOperario || (insumo.operarioNombre || '') === filtroOperario;

    return matchBusqueda && matchFecha && matchOperario;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2>Inventario de Insumos</h2>
        <p className="text-muted-foreground">
          Administra el stock de productos tipo insumo (Gestión de productos y compras a proveedor).
        </p>
      </div>

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
          <div className="flex gap-2 flex-wrap">
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[150px]"
            />
            <select
              value={filtroOperario}
              onChange={(e) => setFiltroOperario(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
            >
              <option value="">Filtrar por operario</option>
              {operariosUnicos.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroFecha('');
                setFiltroOperario('');
              }}
              className="px-4"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-accent/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          Solo se listan <strong>productos tipo insumo</strong> activos. El stock aumenta al marcar como recibidas las
          compras a proveedor. Para entregas a productores use el módulo <strong>Entrega de insumos</strong>.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={insumosFiltrados}
        actions={[
          {
            label: 'Ver detalle',
            onClick: handleViewDetail,
            variant: 'secondary',
          },
        ]}
      />

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de línea de inventario"
        size="lg"
      >
        {selectedInsumo && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent/50 rounded-lg">
              <div>
                <h3 className="text-lg">#{String(selectedInsumo.id).padStart(4, '0')}</h3>
                <p className="font-medium mt-1">{selectedInsumo.nombre}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Stock</p>
                <p className="text-xl font-semibold tabular-nums">
                  {selectedInsumo.cantidad}
                  {selectedInsumo.unidad ? ` ${selectedInsumo.unidad}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-muted-foreground">Presentación</label>
                <p className="mt-1 font-medium">
                  {selectedInsumo.presentacionCantidad != null &&
                  selectedInsumo.presentacionUnidad != null &&
                  String(selectedInsumo.presentacionUnidad).trim() !== ''
                    ? `${selectedInsumo.presentacionCantidad} ${selectedInsumo.presentacionUnidad}`
                    : '—'}
                </p>
              </div>
              <div>
                <label className="text-muted-foreground">Stock mínimo</label>
                <p className="mt-1 font-medium">{selectedInsumo.stockMinimo ?? '—'}</p>
              </div>
              <div>
                <label className="text-muted-foreground">Categoría</label>
                <p className="mt-1 font-medium">{selectedInsumo.categoriaNombre?.trim() || '—'}</p>
              </div>
              <div>
                <label className="text-muted-foreground">ID producto</label>
                <p className="mt-1 font-medium">
                  {selectedInsumo.productoRelacionadoId != null ? `#${selectedInsumo.productoRelacionadoId}` : '—'}
                </p>
              </div>
              <div>
                <label className="text-muted-foreground">Último operario</label>
                <p className="mt-1">{selectedInsumo.operarioNombre || '—'}</p>
              </div>
              <div>
                <label className="text-muted-foreground">Última actividad</label>
                <p className="mt-1">{selectedInsumo.fechaUltimaModificacion || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
