import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Package } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import type { Insumo } from '../../../services/types';
import { INSUMO_UNIDADES_API } from '../../../services/types';

interface InsumoView extends Insumo {
  operarioNombre?: string;
}

export function Insumos() {
  const [insumos, setInsumos] = useState<InsumoView[]>([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedInsumo, setSelectedInsumo] = useState<InsumoView | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [filtroOperario, setFiltroOperario] = useState<string>('');

  const [formNuevo, setFormNuevo] = useState({
    nombre: '',
    descripcion: '',
    unidad: 'Unidades' as string,
    cantidad: 0,
    stockMinimo: 10,
    estado: 'activo' as 'activo' | 'inactivo',
  });

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

  const handleNuevoInsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = formNuevo.nombre.trim();
    if (nombre.length < 2 || nombre.length > 150) {
      toast.error('El nombre debe tener entre 2 y 150 caracteres');
      return;
    }
    if (!INSUMO_UNIDADES_API.includes(formNuevo.unidad as (typeof INSUMO_UNIDADES_API)[number])) {
      toast.error('Seleccione una unidad válida');
      return;
    }
    if (formNuevo.cantidad < 0) {
      toast.error('La cantidad no puede ser negativa');
      return;
    }
    if (formNuevo.stockMinimo < 0) {
      toast.error('El stock mínimo no puede ser negativo');
      return;
    }

    try {
      await api.insumos.create({
        nombre,
        descripcion: formNuevo.descripcion.trim() || undefined,
        unidad: formNuevo.unidad,
        cantidad: formNuevo.cantidad,
        stock_minimo: formNuevo.stockMinimo,
        estado: formNuevo.estado === 'activo' ? 'Activo' : 'Inactivo',
      });
      toast.success('Insumo registrado en catálogo');
      setIsCreateModalOpen(false);
      setFormNuevo({
        nombre: '',
        descripcion: '',
        unidad: 'Unidades',
        cantidad: 0,
        stockMinimo: 10,
        estado: 'activo',
      });
      cargarDatos();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear insumo');
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
      label: 'Insumo',
    },
    {
      key: 'cantidad',
      label: 'Cantidad',
      render: (_: number, row: InsumoView) =>
        `${row.cantidad} ${row.unidad ? `(${row.unidad})` : ''}`.trim(),
    },
    {
      key: 'operarioNombre',
      label: 'Último operario',
      render: (v: string | undefined) => v || '—',
    },
    {
      key: 'fechaUltimaModificacion',
      label: 'Última entrega',
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

    const matchFecha =
      !filtroFecha || (insumo.fechaUltimaModificacion || '') === filtroFecha;
    const matchOperario =
      !filtroOperario || (insumo.operarioNombre || '') === filtroOperario;

    return matchBusqueda && matchFecha && matchOperario;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Inventario de Insumos</h2>
          <p className="text-muted-foreground">
            Catálogo y stock; las entregas a productores aumentan el inventario registrado.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
            <Package className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">
              Total en vista: {insumosFiltrados.reduce((sum, i) => sum + i.cantidad, 0)}
            </span>
          </div>
          <Button icon={<Plus className="w-5 h-5" />} onClick={() => setIsCreateModalOpen(true)}>
            Nuevo insumo
          </Button>
        </div>
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
          Use <strong>Nuevo insumo</strong> para dar de alta materiales en el catálogo (con stock inicial
          opcional). Use <strong>Entrega de insumos</strong> para cargar inventario a un productor
          concretando cantidad y movimiento.
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
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nuevo insumo (catálogo)"
        size="lg"
      >
        <Form onSubmit={handleNuevoInsumo}>
          <FormField
            label="Nombre"
            name="nombre"
            value={formNuevo.nombre}
            onChange={(v) => setFormNuevo({ ...formNuevo, nombre: v as string })}
            placeholder="Ej. Alcohol etílico 96°"
            required
          />
          <FormField
            label="Descripción"
            name="descripcion"
            type="textarea"
            value={formNuevo.descripcion}
            onChange={(v) => setFormNuevo({ ...formNuevo, descripcion: v as string })}
            placeholder="Opcional"
          />
          <FormField
            label="Unidad"
            name="unidad"
            type="select"
            selectPlaceholder={false}
            value={formNuevo.unidad}
            onChange={(v) => setFormNuevo({ ...formNuevo, unidad: v as string })}
            options={INSUMO_UNIDADES_API.map((u) => ({ value: u, label: u }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Cantidad inicial"
              name="cantidad"
              type="number"
              value={formNuevo.cantidad}
              min={0}
              onChange={(v) => setFormNuevo({ ...formNuevo, cantidad: Number(v) || 0 })}
            />
            <FormField
              label="Stock mínimo"
              name="stockMinimo"
              type="number"
              value={formNuevo.stockMinimo}
              min={0}
              onChange={(v) => setFormNuevo({ ...formNuevo, stockMinimo: Number(v) || 0 })}
            />
          </div>
          <FormField
            label="Estado"
            name="estado"
            type="select"
            selectPlaceholder={false}
            value={formNuevo.estado}
            onChange={(v) => setFormNuevo({ ...formNuevo, estado: v as 'activo' | 'inactivo' })}
            options={[
              { value: 'activo', label: 'Activo' },
              { value: 'inactivo', label: 'Inactivo' },
            ]}
          />
          <FormActions>
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar</Button>
          </FormActions>
        </Form>
      </Modal>

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Insumo"
        size="lg"
      >
        {selectedInsumo && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">#{String(selectedInsumo.id).padStart(4, '0')}</h3>
                <p className="text-sm text-muted-foreground">{selectedInsumo.nombre}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Cantidad</p>
                <p className="text-xl font-semibold">
                  {selectedInsumo.cantidad}
                  {selectedInsumo.unidad ? ` ${selectedInsumo.unidad}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Último operario (entrega)</label>
                <p className="mt-1">{selectedInsumo.operarioNombre || '—'}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha última entrega</label>
                <p className="mt-1">{selectedInsumo.fechaUltimaModificacion || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
