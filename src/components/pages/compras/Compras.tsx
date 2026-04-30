import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Trash2, RotateCcw, Search, FileText } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { compras as comprasAPI, productos as productosAPI, proveedores as proveedoresAPI } from '../../../services/api';
import { useAuth } from '../../AuthContext';
import { downloadPdfText } from '../../../utils/pdf';

interface CompraItem {
  productoId: number;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeGanancia: number;
  subtotal: number;
}

const normalizeCompraItemsFromApi = (raw: unknown): CompraItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => {
    const cant = Number(item.cantidad || 0);
    const pu = Number(item.precio_unitario || 0);
    const sub = Number(item.subtotal);
    const pct = Number(item.porcentaje_ganancia ?? item.porcentajeGanancia ?? 0);
    return {
      productoId: Number(item.producto_id ?? item.productoId ?? 0),
      producto: String(item.producto || item.producto_nombre || ''),
      cantidad: cant,
      precioUnitario: pu,
      porcentajeGanancia: Number.isFinite(pct) ? pct : 0,
      subtotal: Number.isFinite(sub) ? sub : cant * pu,
    };
  });
};

const precioVentaDesdeItem = (item: Pick<CompraItem, 'precioUnitario' | 'porcentajeGanancia'>) => {
  const base = Number(item.precioUnitario) || 0;
  const pct = Number(item.porcentajeGanancia) || 0;
  return Math.round(base * (1 + pct / 100));
};

interface ProductoOption {
  id: number;
  nombre: string;
  precio: number;
  estado?: string;
}

interface ProveedorOption {
  id: number;
  label: string;
  estado?: string;
}

interface Compra {
  id: string;
  numero_compra: string;
  proveedor_id: number;
  proveedor: string;
  fecha: string;
  fechaCreacion: string;
  fechaCompra: string;
  items: CompraItem[];
  subtotal: number;
  iva: number;
  total: number;
  estado: string;
  observaciones?: string;
  historialEstados?: CompraEstadoHistorial[];
}

interface CompraEstadoHistorial {
  id: number;
  estado_anterior: string | null;
  estado_nuevo: string;
  motivo: string | null;
  usuario_nombre?: string | null;
  usuario_apellido?: string | null;
  usuario_email?: string | null;
  created_at?: string;
}

interface ComprasFilters {
  id: string;
  fecha: string;
  proveedor: string;
  estado: '' | 'Pendiente' | 'Recibida' | 'Cancelada';
}

interface StateChangeRequest {
  compra: Compra;
  from: 'Pendiente' | 'Recibida' | 'Cancelada';
  to: 'Pendiente' | 'Recibida' | 'Cancelada';
}

const normalizeEstadoCompra = (value: unknown): 'Pendiente' | 'Recibida' | 'Cancelada' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'recibida' || normalized === 'completada') return 'Recibida';
  if (normalized === 'cancelada' || normalized === 'cancelado' || normalized === 'anulada') return 'Cancelada';
  return 'Pendiente';
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

const normalizeDateFilterInput = (value: string): string => {
  const raw = value.trim();
  if (!raw) return '';

  const directMatch = raw.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return raw;
};

export function Compras() {
  const { user } = useAuth();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<ProductoOption[]>([]);
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState<ProveedorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert, AlertComponent } = useAlertDialog();

  useEffect(() => {
    loadCompras();
    loadCatalogos();
  }, []);

  const loadCatalogos = async () => {
    try {
      const [productosData, proveedoresData] = await Promise.all([
        productosAPI.getAll(),
        proveedoresAPI.getAll(),
      ]);

      const productosMapeados = (Array.isArray(productosData) ? productosData : []).map((p: any) => ({
        id: Number(p.id),
        nombre: String(p.nombre || ''),
        precio: Number(p.precio || 0),
        estado: String(p.estado || 'Activo'),
      })).filter((p) => p.estado === 'Activo');

      const proveedoresMapeados = (Array.isArray(proveedoresData) ? proveedoresData : [])
        .map((p: any) => ({
          id: Number(p.id),
          label: String(p.nombre_empresa || `${p.nombre || ''} ${p.apellido || ''}`.trim() || `Proveedor ${p.id}`),
          estado: String(p.estado || 'Activo'),
        }))
        .filter((p) => p.estado === 'Activo');

      setProductosDisponibles(productosMapeados);
      setProveedoresDisponibles(proveedoresMapeados);
    } catch (error) {
      console.error('Error cargando catalogos de compras:', error);
    }
  };

  const loadCompras = async () => {
    try {
      setLoading(true);
      const data = await comprasAPI.getAll();
      const normalizedCompras: Compra[] = (Array.isArray(data) ? data : []).map((compra: any) => ({
        id: String(compra.id),
        numero_compra: compra.numero_compra || `COM-${compra.id}`,
        proveedor_id: Number(compra.proveedor_id || 0),
        proveedor: compra.nombre_empresa || compra.proveedor_nombre || 'Sin proveedor',
        fecha: toDateOnly(compra.fecha),
        fechaCreacion: toDateOnly(compra.fecha_creacion || compra.fecha),
        fechaCompra: toDateOnly(compra.fecha),
        items: normalizeCompraItemsFromApi(compra.items),
        subtotal: Number(compra.subtotal || 0),
        iva: Number(compra.iva || 0),
        total: Number(compra.total || 0),
        estado: normalizeEstadoCompra(compra.estado),
        observaciones: compra.observaciones || '',
        historialEstados: [],
      }));

      setCompras(normalizedCompras);
    } catch (error) {
      console.error('Error al cargar compras:', error);
    } finally {
      setLoading(false);
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfContent, setPdfContent] = useState('');
  const [pendingStateChange, setPendingStateChange] = useState<StateChangeRequest | null>(null);
  const [stateChangeReason, setStateChangeReason] = useState('');
  const [stateChangeSaving, setStateChangeSaving] = useState(false);
  const [filters, setFilters] = useState<ComprasFilters>({
    id: '',
    fecha: '',
    proveedor: '',
    estado: '',
  });
  
  const [formData, setFormData] = useState({
    proveedor: '',
    fecha: new Date().toISOString().split('T')[0],
    items: [] as CompraItem[],
    observaciones: '',
  });

  const [currentItem, setCurrentItem] = useState({
    productoId: '',
    cantidad: 0,
    precioUnitario: 0,
    porcentajeGanancia: 25,
  });

  const canChangeCompraStatus =
    user?.rol === 'Administrador' || user?.rol === 'Asesor' || user?.rol === 'Productor';

  const subtotalCalculado = useMemo(
    () => formData.items.reduce((sum, item) => sum + item.subtotal, 0),
    [formData.items]
  );
  const ivaCalculado = useMemo(() => subtotalCalculado * 0.19, [subtotalCalculado]);
  const totalCalculado = useMemo(() => subtotalCalculado + ivaCalculado, [subtotalCalculado, ivaCalculado]);
  const canCreateCompra = Boolean(formData.proveedor) && formData.items.length > 0;
  const creationHelpMessage = useMemo(() => {
    if (!formData.proveedor && formData.items.length === 0) {
      return 'Selecciona un proveedor y agrega al menos un producto para poder crear la compra.';
    }

    if (!formData.proveedor) {
      return 'Debes seleccionar un proveedor para continuar.';
    }

    if (formData.items.length === 0) {
      return 'Debes agregar al menos un producto del proveedor para crear la compra.';
    }

    return '';
  }, [formData.items.length, formData.proveedor]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const columns: Column[] = [
    { key: 'id', label: 'ID Compra' },
    { key: 'proveedor', label: 'Proveedor' },
    { key: 'fecha', label: 'Fecha' },
    { 
      key: 'items', 
      label: 'Items',
      render: (items: CompraItem[] = []) => `${items.length} producto${items.length !== 1 ? 's' : ''}`
    },
    { 
      key: 'total', 
      label: 'Total',
      render: (total: number) => formatCurrency(total)
    },
    { 
      key: 'estado', 
      label: 'Estado',
      render: (estado: string, compra: Compra) => (
        normalizeEstadoCompra(estado) === 'Recibida' ? (
          <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Compra recibida completamente
          </span>
        ) : normalizeEstadoCompra(estado) === 'Cancelada' ? (
          <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
            Compra cancelada (estado final)
          </span>
        ) : (
          <select
            value={normalizeEstadoCompra(estado)}
            onChange={(event) =>
              handleEstadoChangeRequest(compra, event.target.value as 'Pendiente' | 'Recibida' | 'Cancelada')
            }
            disabled={!canChangeCompraStatus || stateChangeSaving}
            className={`min-h-8 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
              estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
            } ${!canChangeCompraStatus ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <option value="Pendiente">Pendiente</option>
            <option value="Recibida">Recibida</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        )
      )
    }
  ];

  const comprasFiltradas = useMemo(() => {
    return compras.filter((compra) => {
      const byId = !filters.id.trim() || String(compra.id).includes(filters.id.trim());
      const byFecha = !filters.fecha || toDateOnly(compra.fecha) === normalizeDateFilterInput(filters.fecha);
      const byProveedor =
        !filters.proveedor.trim() ||
        compra.proveedor.toLowerCase().includes(filters.proveedor.trim().toLowerCase());
      const byEstado = !filters.estado || normalizeEstadoCompra(compra.estado) === filters.estado;
      return byId && byFecha && byProveedor && byEstado;
    });
  }, [compras, filters]);

  const handleAdd = () => {
    setSelectedCompra(null);
    setFormData({ 
      proveedor: '', 
      fecha: new Date().toISOString().split('T')[0], 
      items: [],
      observaciones: '',
    });
    setCurrentItem({ productoId: '', cantidad: 0, precioUnitario: 0, porcentajeGanancia: 25 });
    setIsModalOpen(true);
  };

  const handleView = async (compra: Compra) => {
    try {
      const detalle = await comprasAPI.getById(Number(compra.id));
      const detalleItems = Array.isArray((detalle as any)?.detalles)
        ? (detalle as any).detalles.map((item: any) => ({
            productoId: Number(item.producto_id || 0),
            producto: String(item.producto_nombre || item.producto || ''),
            cantidad: Number(item.cantidad || 0),
            precioUnitario: Number(item.precio_unitario || 0),
            porcentajeGanancia: Number(item.porcentaje_ganancia ?? 0),
            subtotal: Number(item.subtotal || 0),
          }))
        : compra.items;

      const historialEstados = Array.isArray((detalle as any)?.historial_estados)
        ? (detalle as any).historial_estados.map((entry: any) => ({
            id: Number(entry.id || 0),
            estado_anterior: entry.estado_anterior ? normalizeEstadoCompra(entry.estado_anterior) : null,
            estado_nuevo: normalizeEstadoCompra(entry.estado_nuevo),
            motivo: entry.motivo || null,
            usuario_nombre: entry.usuario_nombre || null,
            usuario_apellido: entry.usuario_apellido || null,
            usuario_email: entry.usuario_email || null,
            created_at: entry.created_at || '',
          }))
        : [];

      setSelectedCompra({
        ...compra,
        fecha: toDateOnly((detalle as any)?.fecha ?? compra.fecha),
        fechaCompra: toDateOnly((detalle as any)?.fecha ?? compra.fechaCompra),
        fechaCreacion: toDateOnly((detalle as any)?.fecha_creacion ?? compra.fechaCreacion),
        items: detalleItems,
        subtotal: Number((detalle as any)?.subtotal ?? compra.subtotal),
        iva: Number((detalle as any)?.iva ?? compra.iva),
        total: Number((detalle as any)?.total ?? compra.total),
        estado: normalizeEstadoCompra((detalle as any)?.estado ?? compra.estado),
        observaciones: String((detalle as any)?.observaciones || compra.observaciones || ''),
        historialEstados,
      });
    } catch {
      setSelectedCompra(compra);
    }
    setIsDetailModalOpen(true);
  };

  const handleEstadoChangeRequest = (
    compra: Compra,
    targetState: 'Pendiente' | 'Recibida' | 'Cancelada'
  ) => {
    if (!canChangeCompraStatus) {
      showAlert({
        title: 'Sin permisos',
        description: 'Solo administradores, asesores o productores pueden cambiar el estado de la compra.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    const estadoActual = normalizeEstadoCompra(compra.estado);
    if (estadoActual === 'Recibida') {
      showAlert({
        title: 'Compra recibida',
        description: 'Esta compra ya fue recibida. El estado ya no puede modificarse.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    if (estadoActual === 'Cancelada') {
      showAlert({
        title: 'Compra cancelada',
        description: 'Esta compra ya fue cancelada. El estado no puede revertirse.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    if (estadoActual === targetState) return;

    setPendingStateChange({
      compra,
      from: estadoActual,
      to: targetState,
    });
    setStateChangeReason('');
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStateChange) return;

    if (pendingStateChange.to === 'Cancelada' && stateChangeReason.trim().length < 10) {
      showAlert({
        title: 'Motivo requerido',
        description: 'Para cancelar la compra debes indicar un motivo corto de al menos 10 caracteres.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      setStateChangeSaving(true);
      const response: any = await comprasAPI.updateStatus(Number(pendingStateChange.compra.id), {
        estado: pendingStateChange.to,
        motivo_cancelacion: stateChangeReason.trim() || undefined,
      });

      const estadoFinal = normalizeEstadoCompra(response?.estado || pendingStateChange.to);
      setCompras((current) =>
        current.map((compra) =>
          String(compra.id) === String(pendingStateChange.compra.id)
            ? {
                ...compra,
                estado: estadoFinal,
                observaciones: response?.observaciones ?? compra.observaciones,
              }
            : compra
        )
      );
      setSelectedCompra((current) =>
        current && String(current.id) === String(pendingStateChange.compra.id)
          ? {
              ...current,
              estado: estadoFinal,
              observaciones: response?.observaciones ?? current.observaciones,
            }
          : current
      );

      await loadCompras();

      setPendingStateChange(null);
      setStateChangeReason('');
      showAlert({
        title: 'Estado actualizado',
        description:
          estadoFinal === 'Recibida'
            ? 'La compra pasó a Recibida. El inventario aumentó y el precio de venta de cada producto se actualizó según costo y % de ganancia de la orden.'
            : 'La compra fue cancelada correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } catch (error: any) {
      showAlert({
        title: 'Error',
        description:
          error?.status === 403
            ? 'No tienes permisos para cambiar el estado de compras con este usuario.'
            : error?.message || 'No se pudo actualizar el estado de la compra.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setStateChangeSaving(false);
    }
  };

  const handleCancelStatusChange = () => {
    setPendingStateChange(null);
    setStateChangeReason('');
  };

  const handleGeneratePDF = (compra: Compra) => {
    const items = Array.isArray(compra.items) ? compra.items : [];
    const itemsDetail = items.length > 0
      ? items.map((item, index) => 
      `${index + 1}. ${item.producto}
   Cantidad: ${item.cantidad} unidades
   Costo unitario: ${formatCurrency(item.precioUnitario)}
   Ganancia: ${item.porcentajeGanancia}%
   Precio venta (estimado): ${formatCurrency(precioVentaDesdeItem(item))}
   Subtotal compra: ${formatCurrency(item.subtotal)}`
        ).join('\n\n')
      : 'Sin detalle de productos registrado';

    const content = `
╔════════════════════════════════════════════════════════════╗
║           GRANDMA'S LIQUEURS - ORDEN DE COMPRA            ║
╚════════════════════════════════════════════════════════════╝

ID Compra:          ${compra.id}
Proveedor:          ${compra.proveedor}
Fecha:              ${compra.fecha}
Estado:             ${compra.estado}

────────────────────────────────────────────────────────────
PRODUCTOS COMPRADOS:
────────────────────────────────────────────────────────────

${itemsDetail}

────────────────────────────────────────────────────────────
SUBTOTAL:           ${formatCurrency(compra.subtotal)}
IVA (19%):          ${formatCurrency(compra.iva)}
TOTAL:              ${formatCurrency(compra.total)}
────────────────────────────────────────────────────────────

Firma Autorización: _______________________

Fecha Impresión:    ${new Date().toLocaleString('es-CO')}
────────────────────────────────────────────────────────────
    `.trim();

    setPdfContent(content);
    setIsPdfModalOpen(true);
  };

  const handleAddItem = () => {
    const pct = Number(currentItem.porcentajeGanancia);
    if (pct < 0 || pct > 1000 || !Number.isFinite(pct)) {
      showAlert({
        title: 'Porcentaje invalido',
        description: 'El porcentaje de ganancia debe estar entre 0 y 1000.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    const cantidad = Number(currentItem.cantidad);
    const precioUnitario = Number(currentItem.precioUnitario);

    if (
      !currentItem.productoId ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0 ||
      !Number.isFinite(precioUnitario) ||
      precioUnitario <= 0
    ) {
      showAlert({
        title: 'Campos incompletos',
        description: 'Complete todos los campos del producto.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (formData.items.length >= 50) {
      showAlert({
        title: 'Limite alcanzado',
        description: 'No se pueden registrar mas de 50 productos por compra.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    const productoSeleccionado = productosDisponibles.find(
      (p) => p.id === Number(currentItem.productoId)
    );

    if (!productoSeleccionado) {
      showAlert({
        title: 'Producto no válido',
        description: 'Seleccione un producto válido antes de continuar.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }
    
    const newItem: CompraItem = {
      productoId: Number(currentItem.productoId),
      producto: productoSeleccionado.nombre,
      cantidad,
      precioUnitario,
      porcentajeGanancia: Number(currentItem.porcentajeGanancia) || 0,
      subtotal: cantidad * precioUnitario,
    };
    
    setFormData({
      ...formData,
      items: [...formData.items, newItem]
    });
    
    setCurrentItem({ productoId: '', cantidad: 0, precioUnitario: 0, porcentajeGanancia: 25 });
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.proveedor) {
      showAlert({
        title: 'Proveedor requerido',
        description: 'Debe seleccionar un proveedor activo para la compra.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (formData.items.length === 0) {
      showAlert({
        title: 'Compra sin productos',
        description: 'Debes agregar al menos un producto del proveedor para crear la compra.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (
      formData.items.some(
        (item) =>
          !Number.isFinite(Number(item.cantidad)) ||
          Number(item.cantidad) <= 0 ||
          !Number.isFinite(Number(item.precioUnitario)) ||
          Number(item.precioUnitario) <= 0 ||
          !Number.isFinite(Number(item.porcentajeGanancia)) ||
          Number(item.porcentajeGanancia) < 0 ||
          Number(item.porcentajeGanancia) > 1000
      )
    ) {
      showAlert({
        title: 'Valores invalidos',
        description: 'Revisa los items: cantidad y costo > 0, y porcentaje de ganancia entre 0 y 1000.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    let compraId = 0;
    try {
      const createResult: any = await comprasAPI.create({
        proveedor_id: Number(formData.proveedor),
        fecha: formData.fecha,
        subtotal: subtotalCalculado,
        iva: ivaCalculado,
        total: totalCalculado,
        estado: 'Pendiente',
        observaciones: formData.observaciones,
      });

      compraId = Number(createResult?.id);
      if (!compraId) {
        throw new Error('No se obtuvo el id de la compra creada');
      }

      await Promise.all(
        formData.items.map((item) =>
          comprasAPI.addProducto({
            compraId,
            productoId: Number(item.productoId),
            cantidad: Number(item.cantidad),
            precioUnitario: Number(item.precioUnitario),
            porcentajeGanancia: Number(item.porcentajeGanancia) || 0,
          })
        )
      );

      await loadCompras();
      setIsModalOpen(false);
      setFormData({
        proveedor: '',
        fecha: new Date().toISOString().split('T')[0],
        items: [],
        observaciones: '',
      });
      setCurrentItem({ productoId: '', cantidad: 0, precioUnitario: 0, porcentajeGanancia: 25 });
      showAlert({
        title: 'Éxito',
        description: 'Compra guardada correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } catch (error: any) {
      console.error('Error creando compra:', error);
      if (compraId) {
        try {
          await comprasAPI.delete(compraId);
        } catch {
          // Si falla el rollback, conservamos el error original.
        }
      }
      showAlert({
        title: 'Error',
        description: error?.message || 'No se pudo guardar la compra.',
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
          <h2>Gestión de Compras</h2>
          <p className="text-muted-foreground">Administra las órdenes de compra</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nueva Compra
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={filters.proveedor}
              onChange={(event) => setFilters((current) => ({ ...current, proveedor: event.target.value }))}
              placeholder="Buscar por proveedor..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setFilters({ id: '', fecha: '', proveedor: '', estado: '' })}
            disabled={!filters.id.trim() && !filters.fecha && !filters.proveedor.trim() && !filters.estado}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar compra por:</span>
          <input
            type="text"
            value={filters.id}
            onChange={(event) => setFilters((current) => ({ ...current, id: event.target.value }))}
            placeholder="ID"
            className="h-8 w-24 rounded-md border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="text"
            inputMode="numeric"
            value={filters.fecha}
            onChange={(event) => setFilters((current) => ({ ...current, fecha: event.target.value }))}
            placeholder="AAAA/MM/DD"
            className="h-8 rounded-md border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={filters.estado}
            onChange={(event) =>
              setFilters((current) => ({ ...current, estado: event.target.value as ComprasFilters['estado'] }))
            }
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Estado (todos)</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Recibida">Recibida</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={comprasFiltradas}
        actions={[
          commonActions.view(handleView),
          {
            label: 'Factura',
            icon: <FileText className="w-4 h-4" />,
            onClick: handleGeneratePDF,
          },
        ]}
      />

      {/* Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Compra"
        size="xl"
      >
        <Form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Proveedor"
              name="proveedor"
              type="select"
              value={formData.proveedor}
              onChange={(value) => setFormData({ ...formData, proveedor: value as string })}
              options={proveedoresDisponibles.map((p) => ({
                value: p.id.toString(),
                label: p.label,
              }))}
              required
            />
            
            <FormField
              label="Fecha"
              name="fecha"
              type="date"
              value={formData.fecha}
              onChange={(value) => setFormData({ ...formData, fecha: value as string })}
              required
            />
          </div>

          {/* Add Items Section */}
          <div className="border-t border-border pt-4 mt-4">
            <h4 className="mb-3">Agregar Productos</h4>
            
            {formData.items.length === 0 ? (
              <div className="mb-4 rounded-lg border-2 border-red-400 bg-red-50 px-4 py-3 text-sm">
                <p className="font-bold text-red-700">❌ ADVERTENCIA: Compra sin productos</p>
                <p className="text-red-600 mt-1 text-xs">
                  Debes agregar <strong>mínimo 1 producto</strong> antes de guardar la compra.
                </p>
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm">
                <p className="font-semibold text-green-700">✅ {formData.items.length} producto{formData.items.length !== 1 ? 's' : ''} agregado{formData.items.length !== 1 ? 's' : ''}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end mb-3">
              <div className="lg:col-span-2">
                <FormField
                  label="Producto"
                  name="producto"
                  type="select"
                  value={currentItem.productoId}
                  onChange={(value) => {
                    const productoSeleccionado = productosDisponibles.find(
                      (p) => p.id === Number(value)
                    );
                    setCurrentItem({
                      ...currentItem,
                      productoId: value as string,
                      // Sugerencia editable para acelerar el cargue.
                      precioUnitario: productoSeleccionado ? Number(productoSeleccionado.precio) || 0 : 0,
                    });
                  }}
                  options={productosDisponibles.map((p) => ({
                    value: p.id.toString(),
                    label: `COD-${p.id} · ${p.nombre}`,
                  }))}
                />
              </div>

              <FormField
                label="Cantidad"
                name="cantidad"
                type="number"
                value={currentItem.cantidad}
                onChange={(value) => setCurrentItem({ ...currentItem, cantidad: value as number })}
              />

              <FormField
                label="Precio compra (unit.)"
                name="precioUnitario"
                type="number"
                value={currentItem.precioUnitario}
                onChange={(value) =>
                  setCurrentItem({ ...currentItem, precioUnitario: Number(value) || 0 })
                }
                helperText="Costo que paga el negocio al proveedor."
              />

              <FormField
                label="% Ganancia (venta)"
                name="porcentajeGanancia"
                type="number"
                value={currentItem.porcentajeGanancia}
                onChange={(value) =>
                  setCurrentItem({ ...currentItem, porcentajeGanancia: Number(value) || 0 })
                }
                helperText="Sobre el costo. Al recibir la compra se actualiza el precio de venta del producto."
              />

              <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">Precio venta estimado</span>
                <span className="text-sm font-semibold">
                  {formatCurrency(precioVentaDesdeItem(currentItem))}
                </span>
              </div>

              <div className="flex items-end">
                <Button type="button" onClick={handleAddItem} className="w-full">
                  Agregar
                </Button>
              </div>
            </div>
          </div>

          {/* Items List */}
          {formData.items.length > 0 && (
            <div className="border border-border rounded-lg p-4 max-h-60 overflow-y-auto">
              <table className="w-full">
                <thead className="text-sm bg-muted">
                  <tr>
                    <th className="p-2 text-left">Codigo</th>
                    <th className="p-2 text-left">Producto</th>
                    <th className="p-2 text-right">Cantidad</th>
                    <th className="p-2 text-right">Costo unit.</th>
                    <th className="p-2 text-right">% Gan.</th>
                    <th className="p-2 text-right">P. venta</th>
                    <th className="p-2 text-right">Subtotal</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => (
                    <tr key={index} className="border-t border-border">
                      <td className="p-2">COD-{item.productoId}</td>
                      <td className="p-2">{item.producto}</td>
                      <td className="p-2 text-right">{item.cantidad}</td>
                      <td className="p-2 text-right">{formatCurrency(item.precioUnitario)}</td>
                      <td className="p-2 text-right">{item.porcentajeGanancia}%</td>
                      <td className="p-2 text-right">{formatCurrency(precioVentaDesdeItem(item))}</td>
                      <td className="p-2 text-right">{formatCurrency(item.subtotal)}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 hover:bg-destructive/10 text-destructive rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border">
                    <td colSpan={4} className="p-2 text-right">Total:</td>
                    <td className="p-2 text-right">
                      {formatCurrency(subtotalCalculado)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 p-4 rounded-lg border border-border bg-accent/20">
            <div>
              <p className="text-sm text-muted-foreground">Subtotal</p>
              <p className="font-medium">{formatCurrency(subtotalCalculado)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">IVA (19%)</p>
              <p className="font-medium">{formatCurrency(ivaCalculado)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="font-medium">{formatCurrency(totalCalculado)}</p>
            </div>
          </div>

          <FormField
            label="Observaciones"
            name="observaciones"
            type="textarea"
            value={formData.observaciones}
            onChange={(value) => setFormData({ ...formData, observaciones: value as string })}
            rows={3}
            placeholder="Notas de la compra"
          />

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canCreateCompra}>
              Crear Compra
            </Button>
          </FormActions>
        </Form>
      </Modal>

      <Modal
        isOpen={Boolean(pendingStateChange)}
        onClose={handleCancelStatusChange}
        title={`Cambiar estado - Compra ${pendingStateChange?.compra.id || ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-accent/30 p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Proveedor</p>
            <p>{pendingStateChange?.compra.proveedor || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">
              Estado actual: {pendingStateChange?.from || 'N/A'}
            </p>
            <p className="text-sm text-muted-foreground">
              Nuevo estado: {pendingStateChange?.to || 'N/A'}
            </p>
          </div>

          {pendingStateChange?.to === 'Recibida' ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2">
              <p className="font-medium">Productos recibidos completos y en perfecto estado?</p>
              <p>Al confirmar, la compra pasará a estado Recibida, se incrementará el inventario y el <strong>precio de venta</strong> de cada producto se actualizará según el costo de esta compra y el porcentaje de ganancia indicado en cada línea.</p>
            </div>
          ) : null}

          {pendingStateChange?.to === 'Cancelada' ? (
            <FormField
              label="Motivo de cancelación"
              name="motivo-cancelacion-compra"
              type="textarea"
              value={stateChangeReason}
              onChange={(value) => setStateChangeReason(String(value))}
              rows={3}
              required
              placeholder="Explica por qué se cancela la compra (mínimo 10 caracteres)"
            />
          ) : null}

          <FormActions>
            <Button
              variant="outline"
              onClick={handleCancelStatusChange}
              disabled={stateChangeSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmStatusChange} disabled={stateChangeSaving || !canChangeCompraStatus}>
              {stateChangeSaving
                ? 'Guardando...'
                : pendingStateChange?.to === 'Cancelada'
                  ? 'Confirmar cancelación de compra'
                  : 'Confirmar'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Detalle de Compra ${selectedCompra?.id}`}
        size="lg"
      >
        {selectedCompra && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Proveedor</p>
                <p>{selectedCompra.proveedor}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha de Compra</p>
                <p>{selectedCompra.fechaCompra}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha de Creación</p>
                <p>{selectedCompra.fechaCreacion}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedCompra.estado === 'Recibida' ? 'bg-green-100 text-green-700' :
                  selectedCompra.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedCompra.estado}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subtotal</p>
                <p>{formatCurrency(selectedCompra.subtotal)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">IVA (19%)</p>
                <p>{formatCurrency(selectedCompra.iva)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p>{formatCurrency(selectedCompra.total)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Observaciones</p>
                <p>{selectedCompra.observaciones || 'Sin observaciones'}</p>
              </div>
            </div>

            <div>
              <h4 className="mb-2">Productos</h4>
              <table className="w-full border border-border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left">Producto</th>
                    <th className="p-3 text-right">Cantidad</th>
                    <th className="p-3 text-right">Costo unit.</th>
                    <th className="p-3 text-right">% Gan.</th>
                    <th className="p-3 text-right">P. venta</th>
                    <th className="p-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedCompra.items || []).map((item, index) => (
                    <tr key={index} className="border-t border-border">
                      <td className="p-3">{item.producto}</td>
                      <td className="p-3 text-right">{item.cantidad}</td>
                      <td className="p-3 text-right">{formatCurrency(item.precioUnitario)}</td>
                      <td className="p-3 text-right">{item.porcentajeGanancia ?? 0}%</td>
                      <td className="p-3 text-right">{formatCurrency(precioVentaDesdeItem(item))}</td>
                      <td className="p-3 text-right">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border">
                    <td colSpan={5} className="p-3 text-right">Subtotal:</td>
                    <td className="p-3 text-right">{formatCurrency(selectedCompra.subtotal)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td colSpan={5} className="p-3 text-right">IVA (19%):</td>
                    <td className="p-3 text-right">{formatCurrency(selectedCompra.iva)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td colSpan={5} className="p-3 text-right">Total:</td>
                    <td className="p-3 text-right">{formatCurrency(selectedCompra.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <h4>Historial de estado</h4>
              {Array.isArray(selectedCompra.historialEstados) && selectedCompra.historialEstados.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedCompra.historialEstados.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-border bg-white p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {entry.estado_anterior ? `${entry.estado_anterior} → ${entry.estado_nuevo}` : `Inicial: ${entry.estado_nuevo}`}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString('es-CO') : ''}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.usuario_nombre || entry.usuario_apellido
                          ? `Por: ${[entry.usuario_nombre, entry.usuario_apellido].filter(Boolean).join(' ')}`
                          : entry.usuario_email
                            ? `Por: ${entry.usuario_email}`
                            : 'Por: Sistema'}
                      </p>
                      <p className="text-sm text-muted-foreground">{entry.motivo || 'Sin motivo registrado'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No hay historial de estado registrado para esta compra.
                </div>
              )}
            </div>

            <FormActions>
              <Button type="button" variant="outline" onClick={() => setIsDetailModalOpen(false)}>
                Cerrar
              </Button>
            </FormActions>
          </div>
        )}
      </Modal>

      {/* PDF Modal */}
      <Modal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        title="Orden de Compra"
        size="xl"
      >
        <div className="space-y-4">
          <pre className="whitespace-pre-wrap text-sm">
            {pdfContent}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => downloadPdfText(pdfContent, `compra-${selectedCompra?.numero_compra || selectedCompra?.id || 'compra'}.pdf`)}
            >
              Descargar PDF
            </Button>
            <Button variant="outline" onClick={() => setIsPdfModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}