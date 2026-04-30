import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, FileText, Search, RotateCcw, X } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import {
  produccion as produccionAPI,
  productos as productosAPI,
  usuarios as usuariosAPI,
} from '../../../services/api';
import { downloadPdfText } from '../../../utils/pdf';

interface ProductionItem {
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
}

interface OrdenProduccion {
  id: string;
  numero_produccion: string;
  producto_id: number;
  producto_nombre?: string;
  pedido_id?: number | null;
  pedido_numero?: string | null;
  pedido_cliente?: string | null;
  tiempo_preparacion_minutos?: number | null;
  cantidad: number;
  fecha: string;
  responsable: string;
  estado: string;
  notes: string;
  created_at?: string;
  pedido?: any;
  insumos_gastados?: Array<any>;
  entregas_insumos_relacionadas?: Array<any>;
  items?: ProductionItem[];
}

interface ProductoOption {
  id: number;
  nombre: string;
}

interface ProductorOption {
  id: number;
  nombre: string;
  apellido: string;
  rol?: string;
}

interface StateChangeRequest {
  orden: OrdenProduccion;
  from: string;
  to: string;
}

const normalizeEstadoProduccion = (value: unknown): 'Orden Recibida' | 'Orden en preparacion' | 'Orden Lista' | 'Cancelada' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'orden recibida' || normalized === 'pendiente') return 'Orden Recibida';
  if (normalized === 'orden en preparacion' || normalized === 'en proceso' || normalized === 'en preparación') {
    return 'Orden en preparacion';
  }
  if (normalized === 'orden lista' || normalized === 'completada' || normalized === 'lista') return 'Orden Lista';
  return 'Cancelada';
};

const toDateOnly = (value: unknown): string => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw.includes('T')) return raw.split('T')[0];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return raw;
};

export function Produccion() {
  // Declarar todos los estados primero
  const [produccion, setProduccion] = useState<OrdenProduccion[]>([]);
  const [productos, setProductos] = useState<ProductoOption[]>([]);
  const [productores, setProductores] = useState<ProductorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    productor: '',
    fecha: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pendingStateChange, setPendingStateChange] = useState<StateChangeRequest | null>(null);
  const [stateChangeReason, setStateChangeReason] = useState('');
  const [stateChangeSaving, setStateChangeSaving] = useState(false);
  const [pdfContent, setPdfContent] = useState('');
  const [selectedOrden, setSelectedOrden] = useState<OrdenProduccion | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
    const [formData, setFormData] = useState({
      numero_produccion: '',
      producto_id: 0,
      pedido_id: null as number | null,
      cantidad: 0,
      fecha: new Date().toISOString().split('T')[0],
      responsable: '',
      tiempo_preparacion_minutos: 1,
      estado: 'Orden Recibida',
      notes: '',
      items: [] as ProductionItem[]
    });
    const [currentItem, setCurrentItem] = useState({
    producto_id: 0,
    producto_nombre: '',
    cantidad: 0
  });
  const { showAlert, AlertComponent } = useAlertDialog();

  // Luego los useEffect
  useEffect(() => {
    loadProduccion();
    loadProductos();
    loadProductores();
  }, []);

  useEffect(() => {
    if (!isDetailModalOpen || !selectedOrden?.created_at) {
      setElapsedMinutes(0);
      return;
    }
    
    // Actualizar inmediatamente al abrir
    setElapsedMinutes(calculateElapsedMinutes(selectedOrden.created_at));
    
    const interval = setInterval(() => {
      setElapsedMinutes(prev => prev + 1);
    }, 60000); // Actualizar cada minuto

    return () => clearInterval(interval);
  }, [isDetailModalOpen, selectedOrden?.id]);

  const loadProductos = async () => {
    try {
      const data = await productosAPI.getAll();
      const normalized = (Array.isArray(data) ? data : [])
        .filter((producto: any) => producto.estado === 'Activo')
        .map((producto: any) => ({
          id: Number(producto?.id),
          nombre: String(producto?.nombre || '').trim(),
        }))
        .filter((producto) => producto.id > 0 && producto.nombre);

      setProductos(normalized);
    } catch (error) {
      console.error('Error al cargar productos para producción:', error);
      setProductos([]);
    }
  };

  const loadProductores = async () => {
    try {
      // Trae todos los usuarios y filtramos por rol Productor activos
      const data = await usuariosAPI.getAll();
      const list: ProductorOption[] = (Array.isArray(data) ? data : [])
        .map((user: any) => ({
          id: Number(user?.id),
          nombre: String(user?.nombre || '').trim(),
          apellido: String(user?.apellido || '').trim(),
          rol: String(user?.rol || user?.rol_nombre || '').trim(),
          estado: String(user?.estado || '').trim(),
        }))
        .filter((user: any) => {
          if (!user.id || !user.nombre) return false;
          if (user.rol.toLowerCase() !== 'productor') return false;
          if (user.estado && user.estado.toLowerCase() !== 'activo') return false;
          return true;
        })
        .map(({ id, nombre, apellido, rol }) => ({ id, nombre, apellido, rol }))
        .sort((a, b) =>
          `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es')
        );
      setProductores(list);
    } catch (error) {
      console.error('Error al cargar productores:', error);
      setProductores([]);
    }
  };

  const loadProduccion = async () => {
    try {
      setLoading(true);
      const data = await produccionAPI.getAll();
      const normalized = (Array.isArray(data) ? data : []).map((orden: any) => ({
        ...orden,
        fecha: toDateOnly(orden?.fecha),
      }));
      setProduccion(normalized);
    } catch (error) {
      console.error('Error al cargar producción:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const renderProducto = (orden: Pick<OrdenProduccion, 'producto_nombre' | 'producto_id'>) =>
    orden.producto_nombre || `Producto #${orden.producto_id}`;

  const calculateElapsedMinutes = (createdAt: string | undefined): number => {
    if (!createdAt) return 0;
    const createdDate = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60));
  };

  const columns: Column[] = [
    { key: 'numero_produccion', label: 'ID Orden' },
    {
      key: 'producto_nombre',
      label: 'Producto',
      render: (_value: string, orden: OrdenProduccion) => renderProducto(orden),
    },
    { 
      key: 'cantidad', 
      label: 'Cantidad',
      render: (cantidad: number) => `${cantidad} unidades`
    },
    { key: 'responsable', label: 'Productor' },
    {
      key: 'fecha',
      label: 'Fecha',
      render: (fecha: string) => toDateOnly(fecha),
    },
    { 
      key: 'estado', 
      label: 'Estado',
      render: (estado: string, orden: OrdenProduccion) => (
        <select
          value={normalizeEstadoProduccion(estado)}
          onChange={(event) =>
            handleEstadoChangeRequest(
              orden,
              event.target.value as 'Orden Recibida' | 'Orden en preparacion' | 'Orden Lista' | 'Cancelada'
            )
          }
          disabled={
            stateChangeSaving ||
            normalizeEstadoProduccion(estado) === 'Cancelada' ||
            normalizeEstadoProduccion(estado) === 'Orden Lista'
          }
          className={`min-h-8 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            normalizeEstadoProduccion(estado) === 'Orden Lista' ? 'bg-green-100 text-green-700' :
            normalizeEstadoProduccion(estado) === 'Orden en preparacion' ? 'bg-blue-100 text-blue-700' :
            normalizeEstadoProduccion(estado) === 'Orden Recibida' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          } ${
            normalizeEstadoProduccion(estado) === 'Cancelada' || normalizeEstadoProduccion(estado) === 'Orden Lista'
              ? 'opacity-70 cursor-not-allowed'
              : ''
          }`}
        >
          <option value="Orden Recibida">Orden Recibida</option>
          <option value="Orden en preparacion">Orden en preparacion</option>
          <option value="Orden Lista">Orden Lista</option>
          <option value="Cancelada">Cancelada</option>
        </select>
      )
    }
  ];

  const responsablesOptions = useMemo(
    () => Array.from(new Set(produccion.map((orden) => orden.responsable).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [produccion]
  );

  const produccionFiltrada = useMemo(() => {
    return produccion.filter((orden) => {
      const matchesResponsable = !filters.productor || orden.responsable === filters.productor;
      const matchesFecha = !filters.fecha || String(orden.fecha || '').includes(filters.fecha);
      return matchesResponsable && matchesFecha;
    });
  }, [produccion, filters]);

  const handleProductoChange = (productoId: string) => {
    const productoSeleccionado = productos.find(p => p.id.toString() === productoId);
    if (productoSeleccionado) {
      setCurrentItem({
        producto_id: productoSeleccionado.id,
        producto_nombre: productoSeleccionado.nombre,
        cantidad: 0
      });
    } else {
      setCurrentItem({
        producto_id: 0,
        producto_nombre: '',
        cantidad: 0
      });
    }
  };

  const handleAddItem = () => {
    if (currentItem.producto_id > 0 && currentItem.cantidad > 0) {
      const itemExistente = formData.items?.find(item => item.producto_id === currentItem.producto_id);
      if (itemExistente) {
        setFormData({
          ...formData,
          items: formData.items.map(item =>
            item.producto_id === currentItem.producto_id
              ? { ...item, cantidad: item.cantidad + currentItem.cantidad }
              : item
          )
        });
      } else {
        setFormData({
          ...formData,
          items: [...(formData.items || []), currentItem]
        });
      }
      setCurrentItem({
        producto_id: 0,
        producto_nombre: '',
        cantidad: 0
      });
    }
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleAdd = () => {
    setSelectedOrden(null);
    setFormData({ 
      numero_produccion: `PROD-${Date.now()}`,
      producto_id: productos[0]?.id ?? 0,
      pedido_id: null,
      cantidad: 0,
      fecha: new Date().toISOString().split('T')[0],
      responsable: '',
      tiempo_preparacion_minutos: 1,
      estado: 'Orden Recibida',
      notes: '',
      items: []
    });
    setCurrentItem({
      producto_id: 0,
      producto_nombre: '',
      cantidad: 0
    });
    setIsModalOpen(true);
  };

  const handleEstadoChangeRequest = async (
    orden: OrdenProduccion,
    targetState: 'Orden Recibida' | 'Orden en preparacion' | 'Orden Lista' | 'Cancelada'
  ) => {
    const estadoActual = normalizeEstadoProduccion(orden.estado);

    if (estadoActual === 'Cancelada') {
      showAlert({
        title: 'Acción no permitida',
        description: 'No se puede cambiar el estado de una orden cancelada.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (estadoActual === 'Orden Lista') {
      showAlert({
        title: 'Orden lista',
        description: 'Esta orden ya está en estado Orden Lista y no puede modificarse.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (estadoActual === targetState) return;

    if (estadoActual === 'Orden Recibida' && targetState === 'Orden en preparacion') {
      try {
        setStateChangeSaving(true);
        try {
          await produccionAPI.updateStatus(Number(orden.id), {
            estado: 'Orden en preparacion',
          });
        } catch (error: any) {
          // Fallback for environments where backend status route is not yet reloaded.
          if (error?.status === 404 || String(error?.message || '').includes('/estado')) {
            await produccionAPI.update(Number(orden.id), {
              estado: 'Orden en preparacion',
            });
          } else {
            throw error;
          }
        }
        await loadProduccion();
      } finally {
        setStateChangeSaving(false);
      }
      return;
    }

    setPendingStateChange({
      orden,
      from: estadoActual,
      to: targetState,
    });
    setStateChangeReason('');
  };

  const handleConfirmStateChange = async () => {
    if (!pendingStateChange) return;

    const targetState = pendingStateChange.to;

    if (pendingStateChange.to === 'Cancelada' && stateChangeReason.trim().length < 10) {
      showAlert({
        title: 'Motivo requerido',
        description: 'Para cancelar la orden debes indicar un motivo de al menos 10 caracteres.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      setStateChangeSaving(true);
      try {
        await produccionAPI.updateStatus(Number(pendingStateChange.orden.id), {
          estado: targetState,
          motivo_cancelacion: stateChangeReason.trim() || undefined,
        });
      } catch (error: any) {
        // Fallback for environments where backend status route is not yet reloaded.
        if (error?.status === 404 || String(error?.message || '').includes('/estado')) {
          await produccionAPI.update(Number(pendingStateChange.orden.id), {
            estado: targetState,
            notes:
              targetState === 'Cancelada' && stateChangeReason.trim()
                ? stateChangeReason.trim()
                : pendingStateChange.orden.notes,
          });
        } else {
          throw error;
        }
      }
      await loadProduccion();
      setPendingStateChange(null);
      setStateChangeReason('');

      if (targetState !== 'Orden en preparacion') {
        showAlert({
          title: 'Estado actualizado',
          description:
            targetState === 'Orden Lista'
              ? 'La orden pasó a Orden Lista. El estado quedó bloqueado y no podrá modificarse nuevamente.'
              : targetState === 'Cancelada'
              ? 'La orden de producción fue cancelada correctamente.'
              : 'Estado actualizado correctamente.',
          type: 'success',
          confirmText: 'Entendido',
          onConfirm: () => {},
        });
      }
    } catch (error) {
      console.error('Error:', error);
      showAlert({
        title: 'Error',
        description: (error as any)?.message || 'No se pudo actualizar el estado de la orden de producción.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setStateChangeSaving(false);
    }
  };

  const handleCancelStateChange = () => {
    setPendingStateChange(null);
    setStateChangeReason('');
  };

  const handleViewDetail = async (orden: OrdenProduccion) => {
    try {
      console.log('Cargando detalle de orden:', orden.id);
      const detail = await produccionAPI.getById(Number(orden.id));
      console.log('Detalle cargado:', detail);
      setSelectedOrden({
        ...orden,
        ...(detail as any),
        fecha: toDateOnly((detail as any)?.fecha ?? orden.fecha),
      });
      setElapsedMinutes(calculateElapsedMinutes((detail as any)?.created_at ?? undefined));
      setIsDetailModalOpen(true);
    } catch (error) {
      console.error('Error al cargar detalle de producción:', error);
      setSelectedOrden(orden);
      setElapsedMinutes(0);
      setIsDetailModalOpen(true);
      showAlert({
        title: 'Detalle parcial',
        description: 'No se pudo cargar el detalle completo. Se mostrará la información disponible en la lista.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    }
  };

  const handleGeneratePDF = (orden: OrdenProduccion) => {
    const productoNombre = renderProducto(orden);
    const content = `
╔════════════════════════════════════════════════════════════╗
║           GRANDMA'S LIQUEURS - ORDEN DE PRODUCCIÓN        ║
╚════════════════════════════════════════════════════════════╝

ID Orden:           ${orden.id}
Orden:              ${orden.numero_produccion}
Producto:           ${productoNombre}
Cantidad:           ${orden.cantidad} unidades
Productor:          ${orden.responsable || 'Sin asignar'}
Tiempo preparación: ${orden.tiempo_preparacion_minutos ?? 0} minutos
Pedido:             ${orden.pedido_numero || 'Sin pedido asociado'}
Estado:             ${orden.estado}
Fecha:              ${toDateOnly(orden.fecha)}

────────────────────────────────────────────────────────────
Firma Operario:     _______________________

Firma Supervisor:   _______________________

Fecha Impresión:    ${new Date().toLocaleString('es-CO')}
────────────────────────────────────────────────────────────
    `.trim();

    // Mostrar en modal en lugar de descargar
    setPdfContent(content);
    setIsPdfModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (Number(formData.tiempo_preparacion_minutos) <= 0) {
      showAlert({
        title: 'Tiempo invalido',
        description: 'El tiempo de preparación debe ser mayor a 0 minutos.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      if (selectedOrden) {
        await produccionAPI.update(Number(selectedOrden.id), formData);
        showAlert({
          title: 'Orden actualizada',
          description: 'La orden de producción se actualizó correctamente.',
          type: 'success',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      } else {
        const items = Array.isArray(formData.items) ? formData.items : [];

        if (items.length === 0) {
          showAlert({
            title: 'Producto requerido',
            description: 'Debes agregar al menos un producto para crear la orden.',
            type: 'warning',
            confirmText: 'Entendido',
            onConfirm: () => {},
          });
          return;
        }

        await Promise.all(
          items.map((item, index) =>
            produccionAPI.create({
              ...formData,
              numero_produccion:
                items.length > 1 ? `${formData.numero_produccion}-${index + 1}` : formData.numero_produccion,
              producto_id: item.producto_id,
              cantidad: item.cantidad,
            })
          )
        );

        showAlert({
          title: 'Órdenes creadas',
          description:
            items.length === 1
              ? 'La orden de producción se creó correctamente.'
              : `Se crearon ${items.length} órdenes de producción correctamente.`,
          type: 'success',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      }
      await loadProduccion();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error al guardar orden:', error);
      showAlert({
        title: 'Error',
        description: (error as Error)?.message || 'No se pudo guardar la orden de producción.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    }
  };

  return (
    <div className="space-y-6">
      {AlertComponent}
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Producción</h2>
          <p className="text-muted-foreground">Administra las órdenes de producción de bebidas</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nueva Orden
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={filters.productor}
              onChange={(event) => setFilters((current) => ({ ...current, productor: event.target.value }))}
              placeholder="Buscar por productor..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setFilters({ productor: '', fecha: '' })}
            disabled={!filters.productor.trim() && !filters.fecha}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          <select
            value={filters.productor}
            onChange={(event) => setFilters((current) => ({ ...current, productor: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Productor (todos)</option>
            {responsablesOptions.map((responsable) => (
              <option key={responsable} value={responsable}>
                {responsable}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.fecha}
            onChange={(event) => setFilters((current) => ({ ...current, fecha: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={produccionFiltrada}
        actions={[
          commonActions.view(handleViewDetail),
          commonActions.pdf(handleGeneratePDF),
        ]}
      />

      <Modal
        isOpen={Boolean(pendingStateChange)}
        onClose={handleCancelStateChange}
        title={`Cambiar estado - Orden ${pendingStateChange?.orden.numero_produccion || ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-accent/30 p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Estado actual: {pendingStateChange?.from || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Nuevo estado: {pendingStateChange?.to || 'N/A'}</p>
          </div>

          {pendingStateChange?.to === 'Orden Lista' ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              Al confirmar, la orden cambiará a estado Orden Lista y este estado no podrá volver a modificarse.
            </div>
          ) : null}

          {pendingStateChange?.to === 'Cancelada' ? (
            <FormField
              label="Motivo de cancelación"
              name="motivo-cambio-produccion"
              type="textarea"
              value={stateChangeReason}
              onChange={(value) => setStateChangeReason(String(value))}
              rows={3}
              required
              placeholder="Explica por qué se cancela la orden (mínimo 10 caracteres)"
            />
          ) : null}

          <FormActions>
            <Button variant="outline" onClick={handleCancelStateChange} disabled={stateChangeSaving}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmStateChange} disabled={stateChangeSaving}>
              {stateChangeSaving ? 'Guardando...' : 'Confirmar'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      {/* Modal de formulario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedOrden ? 'Editar Orden de Producción' : 'Nueva Orden de Producción'}
        size="lg"
      >
        <Form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            {selectedOrden ? (
              <>
                <FormField
                  label="Producto"
                  name="producto_id"
                  type="select"
                  value={formData.producto_id}
                  onChange={(value) => setFormData({ ...formData, producto_id: Number(value) })}
                  options={productos.map((producto) => ({
                    value: producto.id,
                    label: producto.nombre,
                  }))}
                  showEmptyOption={false}
                  required
                />

                <FormField
                  label="Cantidad"
                  name="cantidad"
                  type="number"
                  value={formData.cantidad}
                  onChange={(value) => {
                    const numValue = Number(value);
                    if (numValue >= 0) {
                      setFormData({ ...formData, cantidad: numValue });
                    }
                  }}
                  min="0"
                  placeholder="Unidades a producir"
                  required
                />
              </>
            ) : (
              <div className="space-y-2 border border-border rounded-lg p-3 col-span-2">
                <h4 className="font-semibold text-sm">Agregar Productos</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                  <FormField
                    label=""
                    name="producto"
                    type="select"
                    value={currentItem.producto_id}
                    onChange={(value) => handleProductoChange(String(value))}
                    options={[
                      { value: '', label: 'Seleccionar producto...' },
                      ...productos.map((p) => ({
                        value: p.id.toString(),
                        label: p.nombre,
                      }))
                    ]}
                    placeholder="Seleccionar producto"
                  />
                  <FormField
                    label=""
                    name="cantidad-item"
                    type="number"
                    value={currentItem.cantidad}
                    onChange={(value) => {
                      const numValue = Number(value);
                      if (numValue >= 0) {
                        setCurrentItem({ ...currentItem, cantidad: numValue });
                      }
                    }}
                    min="0"
                    placeholder="Cantidad"
                  />
                  <Button
                    type="button"
                    onClick={handleAddItem}
                    icon={<Plus className="w-4 h-4" />}
                    disabled={!currentItem.producto_id || currentItem.cantidad <= 0}
                  >
                    Agregar
                  </Button>
                </div>

                {formData.items.length > 0 ? (
                  <div className="space-y-1 max-h-36 overflow-y-auto pt-1">
                    {formData.items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between gap-2 bg-accent/50 p-2 rounded-lg text-sm">
                        <div className="flex-1">
                          <span className="font-medium">{item.producto_nombre}</span>
                          <span className="text-muted-foreground"> x{item.cantidad}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-destructive hover:text-destructive/80 p-1"
                          aria-label="Quitar producto"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <FormField
              label="Productor"
              name="responsable"
              type="select"
              value={formData.responsable}
              onChange={(value) => setFormData({ ...formData, responsable: value as string })}
              options={
                productores.length > 0
                  ? productores.map((user) => {
                      const fullName = `${user.nombre} ${user.apellido}`.trim();
                      return {
                        value: fullName,
                        label: fullName,
                      };
                    })
                  : [{ value: '', label: 'No hay usuarios con rol Productor activos' }]
              }
              placeholder="Seleccionar productor"
              required
            />
            
            <FormField
              label="Tiempo de preparación (minutos)"
              name="tiempo_preparacion_minutos"
              type="number"
              value={formData.tiempo_preparacion_minutos}
              onChange={(value) => {
                const numValue = Number(value);
                if (numValue > 0) {
                  setFormData({ ...formData, tiempo_preparacion_minutos: numValue });
                }
              }}
              min="1"
              placeholder="Ej. 45"
              helperText="Registra el tiempo total estimado de preparación en minutos."
              required
            />
          </div>

          <div className="p-4 bg-accent/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              La orden de producción se creará en estado "Orden Recibida".
              Puedes cambiar el estado usando las acciones de la tabla.
            </p>
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              {selectedOrden ? 'Actualizar' : 'Crear'} Orden
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Orden de Producción"
        size="lg"
      >
        {selectedOrden && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-accent p-4">
              <div>
                <h3 className="text-lg">{selectedOrden.numero_produccion}</h3>
                <p className="text-sm text-muted-foreground">{renderProducto(selectedOrden)}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm ${
                normalizeEstadoProduccion(selectedOrden.estado) === 'Orden Lista' ? 'bg-green-100 text-green-700' :
                normalizeEstadoProduccion(selectedOrden.estado) === 'Orden en preparacion' ? 'bg-blue-100 text-blue-700' :
                normalizeEstadoProduccion(selectedOrden.estado) === 'Orden Recibida' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                {normalizeEstadoProduccion(selectedOrden.estado)}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-border bg-white p-4">
                <label className="text-sm text-muted-foreground">Producto</label>
                <p className="mt-1 font-medium">{renderProducto(selectedOrden)}</p>
                <p className="text-xs text-muted-foreground">ID producto: {selectedOrden.producto_id}</p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <label className="text-sm text-muted-foreground">Cantidad</label>
                <p className="mt-1 font-medium">{selectedOrden.cantidad} unidades</p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <label className="text-sm text-muted-foreground">Productor</label>
                <p className="mt-1 font-medium">{selectedOrden.responsable || 'Sin asignar'}</p>
              </div>

              <div className="rounded-lg border border-border bg-white p-4">
                <label className="text-sm text-muted-foreground">Fecha de creación</label>
                <p className="mt-1 font-medium">{selectedOrden.created_at ? new Date(selectedOrden.created_at).toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}</p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <label className="text-sm text-muted-foreground">Tiempo de preparación</label>
                <div className="mt-1 space-y-2">
                  <p className="font-medium">{selectedOrden.tiempo_preparacion_minutos ?? 0} minutos</p>
                  <p className="text-xs text-muted-foreground">Tiempo registrado al crear la orden: {new Date(selectedOrden.created_at || '').toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{
                          width: `${Math.min(100, ((elapsedMinutes / (selectedOrden.tiempo_preparacion_minutos ?? 1)) * 100))}`
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {elapsedMinutes} / {selectedOrden.tiempo_preparacion_minutos ?? 0}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <label className="text-sm text-muted-foreground">Pedido relacionado</label>
                <p className="mt-1 font-medium">{selectedOrden.pedido_numero || selectedOrden.pedido?.numero_pedido || 'Sin pedido asociado'}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-white p-4 space-y-3">
                <h4 className="font-semibold">Pedido</h4>
                {selectedOrden.pedido ? (
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Número:</span> {selectedOrden.pedido.numero_pedido || selectedOrden.pedido.numero}</p>
                    <p><span className="text-muted-foreground">Cliente:</span> {selectedOrden.pedido.cliente_nombre || selectedOrden.pedido.cliente || 'No disponible'}</p>
                    <p><span className="text-muted-foreground">Fecha:</span> {toDateOnly(selectedOrden.pedido.fecha || selectedOrden.pedido.fecha_pedido)}</p>
                    <p><span className="text-muted-foreground">Estado:</span> {selectedOrden.pedido.estado || 'Sin estado'}</p>
                    <p><span className="text-muted-foreground">Total:</span> {selectedOrden.pedido.total ?? 'N/D'}</p>
                    {Array.isArray(selectedOrden.pedido.detalles) && selectedOrden.pedido.detalles.length > 0 ? (
                      <div className="mt-3 rounded-md border border-border/70 bg-accent/20 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle del pedido</p>
                        <div className="space-y-2">
                          {selectedOrden.pedido.detalles.map((detalle: any, index: number) => (
                            <div key={`${detalle.id || index}`} className="flex items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="font-medium">{detalle.producto_nombre || `Producto #${detalle.producto_id}`}</p>
                                <p className="text-xs text-muted-foreground">Cantidad solicitada</p>
                              </div>
                              <p className="font-medium">{detalle.cantidad}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No se encontró un pedido asociado para esta producción.</p>
                )}
              </div>

              <div className="rounded-lg border border-border bg-white p-4 space-y-3">
                <h4 className="font-semibold">Insumos gastados</h4>
                {Array.isArray(selectedOrden.insumos_gastados) && selectedOrden.insumos_gastados.length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {selectedOrden.insumos_gastados.map((insumo, index) => (
                      <div key={`${insumo.id || index}`} className="rounded-md border border-border/70 bg-accent/30 p-3">
                        <p className="font-medium">{insumo.insumo_nombre || insumo.nombre || `Insumo #${insumo.insumo_id ?? index + 1}`}</p>
                        <p className="text-muted-foreground">
                          {insumo.cantidad ?? 0} {insumo.unidad || ''}
                          {insumo.numero_entrega ? ` · entrega ${insumo.numero_entrega}` : ''}
                        </p>
                        {insumo.fecha ? <p className="text-muted-foreground">Fecha: {toDateOnly(insumo.fecha)}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay insumos consumidos registrados para esta orden.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-4">
              <label className="text-sm text-muted-foreground block mb-2">Observaciones</label>
              <p className="text-sm whitespace-pre-line">
                {selectedOrden.notes || 'Sin observaciones registradas.'}
              </p>
            </div>

            {/* Acciones */}
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                icon={<FileText className="w-4 h-4" />}
                onClick={() => handleGeneratePDF(selectedOrden)}
                className="flex-1"
              >
                Descargar PDF
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsDetailModalOpen(false)}
                className="flex-1"
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de PDF */}
      <Modal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        title="Orden de Producción"
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-accent/50 rounded-lg">
            <pre className="text-sm text-muted-foreground">
              {pdfContent}
            </pre>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => downloadPdfText(pdfContent, `orden-produccion-${selectedOrden?.numero_produccion || selectedOrden?.id || 'produccion'}.pdf`)}
            >
              Descargar PDF
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setIsPdfModalOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}