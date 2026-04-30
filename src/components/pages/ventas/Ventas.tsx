import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, ShoppingBag, Trash2, Search, RotateCcw } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { ventas as ventasAPI, clientes as clientesAPI, productos as productosAPI, pedidos as pedidosAPI } from '../../../services/api';
import { downloadPdfText } from '../../../utils/pdf';

interface VentaItem {
  producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface Venta {
  id: string;
  numero_venta: string;
  tipo: string;
  cliente?: string;
  cliente_id: number;
  pedido_id?: number;
  fecha: string;
  metodopago: string;
  total: number;
  estado: string;
  items?: VentaItem[];
}

interface Cliente {
  id: number;
  nombre: string;
  apellido: string;
  documento: string;
}

interface Producto {
  id: number;
  nombre: string;
  precio: number;
  stock: number;
}

interface StateChangeRequest {
  venta: Venta;
  from: string;
  to: string;
}

/** Obtiene id de respuesta crear venta tras apiCall ({ id } o { data: { id } }). */
function parseVentaCreacionId(payload: unknown): number {
  if (payload === null || typeof payload !== 'object') return Number.NaN;
  const obj = payload as Record<string, unknown>;
  const topId = obj.id ?? obj.Id;
  if (topId != null) {
    const n = Number(topId);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  const inner = obj.data;
  if (inner !== null && typeof inner === 'object') {
    const mid = (inner as Record<string, unknown>).id;
    if (mid != null) {
      const n = Number(mid);
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
  }
  return Number.NaN;
}

const formatDateOnly = (value: string) => {
  if (!value) return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return value;
};

export function Ventas() {
  const isVentaEstadoFinal = (estado: string) => estado === 'Completada' || estado === 'Cancelada';
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidosDisponibles, setPedidosDisponibles] = useState<any[]>([]);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<any>(null);
  const [isProductosFromPedido, setIsProductosFromPedido] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    query: '',
    fecha: '',
    metodopago: '',
    estado: ''
  });

  useEffect(() => {
    loadVentas();
    loadClientes();
    loadProductos();
    loadPedidos();
  }, []);

  const loadVentas = async (options?: { rethrow?: boolean }) => {
    try {
      setLoading(true);
      const data = await ventasAPI.getAll();
      if (!Array.isArray(data)) {
        throw new Error('No se pudieron obtener las ventas: respuesta inválida.');
      }
      setVentas(data);
    } catch (error) {
      console.error('Error al cargar ventas:', error);
      if (options?.rethrow) {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  };

  const loadClientes = async () => {
    try {
      const data = await clientesAPI.getAll();
      const activos = Array.isArray(data)
        ? data.filter((cliente: any) => String(cliente?.estado || 'Activo').toLowerCase() === 'activo')
        : [];
      setClientes(activos);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    }
  };

  const loadProductos = async (options?: { rethrow?: boolean }) => {
    try {
      const data = await productosAPI.getAll();
      if (!Array.isArray(data)) {
        throw new Error('No se pudieron obtener los productos: respuesta inválida.');
      }
      setProductos(data.filter((p: any) => p.estado === 'Activo'));
    } catch (error) {
      console.error('Error al cargar productos:', error);
      if (options?.rethrow) {
        throw error;
      }
    }
  };

  const loadPedidos = async () => {
    try {
      const data = await pedidosAPI.getAll();
      if (!Array.isArray(data)) {
        throw new Error('Respuesta de pedidos inválida');
      }
      // Filtrar pedidos que no estén Cancelados
      const pedidosActivos = data.filter((p: any) => p.estado !== 'Cancelado');
      setPedidosDisponibles(pedidosActivos);
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
    }
  };

  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [pendingStateChange, setPendingStateChange] = useState<StateChangeRequest | null>(null);
  const [stateChangeReason, setStateChangeReason] = useState('');
  const [stateChangeSaving, setStateChangeSaving] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfContent, setPdfContent] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showAlert, AlertComponent } = useAlertDialog();
  const [formData, setFormData] = useState({
    tipo: 'Directa' as 'Directa' | 'Por Pedido',
    cliente_id: '',
    pedido: '',
    metodopago: 'Efectivo',
    metodo_pago: 'Efectivo',
    esquema_abono: '100%',
    abono_recibido: 0,
    items: [] as VentaItem[]
  });
  const [currentItem, setCurrentItem] = useState({
    producto: '',
    producto_id: '',
    cantidad: 0,
    precio_unitario: 0
  });

  const disponibleParaLineaActual = useMemo(() => {
    if (!currentItem.producto_id) return null;
    const p = productos.find((x) => x.id.toString() === currentItem.producto_id);
    if (!p) return null;
    const cantidadLista = formData.items
      .filter((i) => i.producto === p.nombre)
      .reduce((acc, i) => acc + i.cantidad, 0);
    const disponible = Math.max(0, Number(p.stock || 0) - cantidadLista);
    return {
      disponible,
      stock: Number(p.stock || 0)
    };
  }, [currentItem.producto_id, productos, formData.items]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const columns: Column[] = [
    { key: 'numero_venta', label: 'Número Venta' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'cliente', label: 'Cliente' },
    {
      key: 'fecha',
      label: 'Fecha',
      render: (fecha: string) => formatDateOnly(fecha),
    },
    { 
      key: 'items', 
      label: 'Items',
      render: (items: VentaItem[]) => items && items.length > 0 ? `${items.length} producto${items.length !== 1 ? 's' : ''}` : '0 productos'
    },
    { 
      key: 'total', 
      label: 'Total',
      render: (total: number) => formatCurrency(total)
    },
    { key: 'metodopago', label: 'Método Pago' },
    { 
      key: 'estado', 
      label: 'Estado',
      render: (estado: string, venta: Venta) => (
        <select
          value={estado}
          onChange={(event) => handleEstadoChangeRequest(venta, event.target.value)}
          disabled={stateChangeSaving || isVentaEstadoFinal(estado)}
          className={`min-h-8 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            estado === 'Completada' ? 'bg-green-100 text-green-700' :
            estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}
        >
          <option value="Pendiente">Pendiente</option>
          <option value="Completada">Completada</option>
          <option value="Cancelada">Cancelada</option>
        </select>
      )
    }
  ];

  const ventasFiltradas = useMemo(() => {
    const normalizedQuery = filters.query.trim().toLowerCase();

    return ventas.filter((venta) => {
      const matchesQuery =
        !normalizedQuery ||
        String(venta.numero_venta || '').toLowerCase().includes(normalizedQuery) ||
        String(venta.cliente || '').toLowerCase().includes(normalizedQuery);
      const matchesFecha = !filters.fecha || String(venta.fecha || '').includes(filters.fecha);
      const matchesMetodo = !filters.metodopago || venta.metodopago === filters.metodopago;
      const matchesEstado = !filters.estado || venta.estado === filters.estado;
      return matchesQuery && matchesFecha && matchesMetodo && matchesEstado;
    });
  }, [ventas, filters]);

  const handleView = (venta: Venta) => {
    setSelectedVenta(venta);
    setIsDetailModalOpen(true);
  };

  const handleEstadoChangeRequest = (venta: Venta, nuevoEstado: string) => {
    if (venta.estado === nuevoEstado) return;
    if (isVentaEstadoFinal(venta.estado)) {
      showAlert({
        title: 'Estado bloqueado',
        description: 'Una venta en estado Completada o Cancelada no se puede modificar.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    setPendingStateChange({
      venta,
      from: venta.estado,
      to: nuevoEstado,
    });
    setStateChangeReason('');
  };

  const handleConfirmEstadoChange = async () => {
    if (!pendingStateChange) return;
    if (isVentaEstadoFinal(pendingStateChange.from)) {
      setPendingStateChange(null);
      setStateChangeReason('');
      showAlert({
        title: 'Estado bloqueado',
        description: 'Una venta en estado Completada o Cancelada no se puede modificar.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    if (pendingStateChange.to === 'Cancelada' && stateChangeReason.trim().length < 10) {
      showAlert({
        title: 'Motivo requerido',
        description: 'Para cancelar la venta debes indicar un motivo de al menos 10 caracteres.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      setStateChangeSaving(true);
      await ventasAPI.update(pendingStateChange.venta.id, { estado: pendingStateChange.to });
      await loadVentas();
      setPendingStateChange(null);
      setStateChangeReason('');
    } catch (error) {
      console.error('Error actualizando estado de venta:', error);
      showAlert({
        title: 'Error',
        description: 'No se pudo actualizar el estado de la venta.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setStateChangeSaving(false);
    }
  };

  const handleCancelEstadoChange = () => {
    setPendingStateChange(null);
    setStateChangeReason('');
  };

  const handleGeneratePDF = (venta: Venta) => {
    const itemsDetail = venta.items && venta.items.length > 0 ? venta.items.map((item, index) => 
      `${index + 1}. ${item.producto}
   Cantidad: ${item.cantidad} unidades
   Precio Unitario: ${formatCurrency(item.precio_unitario)}
   Subtotal: ${formatCurrency(item.subtotal)}`
    ).join('\n\n') : 'Sin items';

    const content = `
╔════════════════════════════════════════════════════════════╗
║           GRANDMA'S LIQUEURS - FACTURA DE VENTA           ║
╚════════════════════════════════════════════════════════════╝

Número Venta:       ${venta.numero_venta}
Cliente:            ${venta.cliente || 'N/A'}
Fecha:              ${formatDateOnly(venta.fecha)}
Método de Pago:     ${venta.metodopago}
Estado:             ${venta.estado}

────────────────────────────────────────────────────────────
PRODUCTOS VENDIDOS:
────────────────────────────────────────────────────────────

${itemsDetail}

────────────────────────────────────────────────────────────
TOTAL:              ${formatCurrency(venta.total)}
────────────────────────────────────────────────────────────

Gracias por su compra

Fecha Impresión:    ${new Date().toLocaleString('es-CO')}
────────────────────────────────────────────────────────────
    `.trim();

    setPdfContent(content);
    setIsPdfModalOpen(true);
  };

  const handleAddItem = () => {
    if (!currentItem.producto || !currentItem.producto_id) {
      showAlert({
        title: 'Producto requerido',
        description: 'Selecciona un producto antes de agregar líneas.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    const productoSeleccionado = productos.find((p) => p.id.toString() === currentItem.producto_id);
    if (!productoSeleccionado) {
      return;
    }

    const cantidadParsed = Number(currentItem.cantidad);
    if (!Number.isFinite(cantidadParsed) || cantidadParsed <= 0 || !Number.isInteger(cantidadParsed)) {
      showAlert({
        title: 'Cantidad inválida',
        description: 'Indica una cantidad entera mayor que cero.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (currentItem.precio_unitario <= 0) {
      return;
    }

    const stockTotal = Number(productoSeleccionado.stock || 0);
    const cantidadYaEnLista = formData.items
      .filter((i) => i.producto === productoSeleccionado.nombre)
      .reduce((acc, i) => acc + i.cantidad, 0);
    const disponible = stockTotal - cantidadYaEnLista;

    if (disponible <= 0) {
      showAlert({
        title: 'Sin stock',
        description: `No hay unidades disponibles de "${productoSeleccionado.nombre}".`,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (cantidadParsed > disponible) {
      showAlert({
        title: 'Stock insuficiente',
        description: `Solo puedes vender hasta ${disponible} unidad${disponible !== 1 ? 'es' : ''} de "${productoSeleccionado.nombre}" (en inventario: ${stockTotal}).`,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          producto: currentItem.producto,
          cantidad: cantidadParsed,
          precio_unitario: currentItem.precio_unitario,
          subtotal: cantidadParsed * currentItem.precio_unitario
        }
      ]
    });
    setCurrentItem({ producto: '', producto_id: '', cantidad: 0, precio_unitario: 0 });
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleSaveVenta = async () => {
    if (formData.cliente_id && formData.items.length > 0) {
      try {
        const clienteSeleccionado = clientes.find((cliente) => cliente.id.toString() === formData.cliente_id);
        if (!clienteSeleccionado) {
          showAlert({
            title: 'Cliente no disponible',
            description: 'Solo puedes crear ventas con clientes activos.',
            type: 'warning',
            confirmText: 'Entendido',
            onConfirm: () => {}
          });
          return;
        }

        const acumuladoPorProducto = new Map<number, { nombre: string; cantidad: number; stock: number }>();
        for (const item of formData.items) {
          const productoSel = productos.find((p) => p.nombre === item.producto);
          if (!productoSel) {
            showAlert({
              title: 'Producto no encontrado',
              description: `No se pudo validar el producto "${item.producto}". Recarga el listado e inténtalo de nuevo.`,
              type: 'warning',
              confirmText: 'Entendido',
              onConfirm: () => {}
            });
            return;
          }
          const prev = acumuladoPorProducto.get(productoSel.id);
          const cantidad = Number(item.cantidad);
          if (!Number.isFinite(cantidad) || cantidad <= 0) {
            showAlert({
              title: 'Cantidad inválida',
              description: 'Revisa las cantidades de cada línea.',
              type: 'warning',
              confirmText: 'Entendido',
              onConfirm: () => {}
            });
            return;
          }
          acumuladoPorProducto.set(productoSel.id, {
            nombre: productoSel.nombre,
            cantidad: (prev?.cantidad ?? 0) + cantidad,
            stock: Number(productoSel.stock || 0)
          });
        }

        for (const [, row] of acumuladoPorProducto.entries()) {
          if (row.stock < row.cantidad) {
            showAlert({
              title: row.stock <= 0 ? 'Sin stock' : 'Stock insuficiente',
              description:
                row.stock <= 0
                  ? `"${row.nombre}" no tiene unidades disponibles en inventario.`
                  : `Para "${row.nombre}" no alcanza el inventario: hay ${row.stock} unidad${row.stock !== 1 ? 'es' : ''} y la venta suma ${row.cantidad}.`,
              type: 'warning',
              confirmText: 'Entendido',
              onConfirm: () => {}
            });
            return;
          }
        }

        // Validar abono si esquema es 50%
        const totalVenta = formData.items.reduce((acc, item) => acc + item.subtotal, 0);
        if (formData.esquema_abono === '50%') {
          const abonoRequerido = totalVenta * 0.5;
          if (formData.abono_recibido < abonoRequerido) {
            showAlert({
              title: 'Abono insuficiente',
              description: `Debe recibir mínimo ${formatCurrency(abonoRequerido)} (50% del total)`,
              type: 'warning',
              confirmText: 'Entendido',
              onConfirm: () => {}
            });
            return;
          }
        }

        const newVenta = {
          numero_venta: `VEN-${Date.now()}`,
          tipo: formData.tipo,
          cliente_id: parseInt(formData.cliente_id),
          pedido_id: formData.pedido ? parseInt(formData.pedido) : null,
          fecha: new Date().toISOString().split('T')[0],
          metodopago: formData.metodopago,
          metodo_pago: formData.metodo_pago,
          esquema_abono: formData.esquema_abono,
          abono_recibido: formData.abono_recibido,
          total: totalVenta,
          estado: 'Completada',
          items: formData.items.map((item) => {
            const productoSeleccionado = productos.find((p) => p.nombre === item.producto);
            if (!productoSeleccionado) {
              throw new Error(`No se pudo resolver el producto para el item: ${item.producto}`);
            }
            return {
              productoId: Number(productoSeleccionado.id),
              cantidad: Number(item.cantidad),
              precioUnitario: Number(item.precio_unitario)
            };
          })
        };

        const createResult: unknown = await ventasAPI.createCompleta(newVenta);
        const rawId = parseVentaCreacionId(createResult);

        if (!Number.isFinite(rawId) || rawId <= 0) {
          throw new Error('La venta no se registró: no hubo respuesta válida del servidor.');
        }

        await loadVentas({ rethrow: true });
        await loadProductos({ rethrow: true });

        setIsModalOpen(false);
        setFormData({
          tipo: 'Directa',
          cliente_id: '',
          pedido: '',
          metodopago: 'Efectivo',
          metodo_pago: 'Efectivo',
          esquema_abono: '100%',
          abono_recibido: 0,
          items: []
        });
        setIsProductosFromPedido(false);
        setPedidoSeleccionado(null);
        setCurrentItem({ producto: '', producto_id: '', cantidad: 0, precio_unitario: 0 });
        showAlert({
          title: 'Éxito',
          description: `Venta #${rawId} guardada correctamente.`,
          type: 'success',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      } catch (error: unknown) {
        console.error('Error al guardar venta:', error);
        const mensaje =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: string }).message)
            : 'No se pudo guardar la venta.';
        showAlert({
          title: 'Error',
          description: mensaje,
          type: 'danger',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      }
    } else {
        showAlert({
          title: 'Datos incompletos',
          description: 'Debe seleccionar un cliente y agregar al menos un producto.',
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
    }
  };

  const handleProductoChange = (productoId: string) => {
    const productoSeleccionado = productos.find(p => p.id.toString() === productoId);
    if (productoSeleccionado) {
      if (Number(productoSeleccionado.stock || 0) <= 0) {
        showAlert({
          title: 'Sin stock',
          description: `"${productoSeleccionado.nombre}" no tiene unidades disponibles en inventario.`,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
        setCurrentItem({
          ...currentItem,
          producto_id: '',
          producto: '',
          precio_unitario: 0
        });
        return;
      }
      setCurrentItem({
        ...currentItem,
        producto_id: productoId,
        producto: productoSeleccionado.nombre,
        precio_unitario: productoSeleccionado.precio
      });
    } else {
      setCurrentItem({
        ...currentItem,
        producto_id: '',
        producto: '',
        precio_unitario: 0
      });
    }
  };

  const handlePedidoSelected = async (pedidoId: string) => {
    try {
      // Cargar detalles del pedido
      const detalles = await pedidosAPI.getDetalles(pedidoId);
      if (!Array.isArray(detalles)) {
        throw new Error('Respuesta de detalles inválida');
      }

      // Convertir detalles a items de venta
      const itemsDelPedido: VentaItem[] = detalles.map((detalle: any) => ({
        producto: detalle.producto_nombre || detalle.nombre,
        cantidad: Number(detalle.cantidad),
        precio_unitario: Number(detalle.precio_unitario),
        subtotal: Number(detalle.subtotal)
      }));

      // Actualizar formData
      setFormData({
        ...formData,
        pedido: pedidoId,
        items: itemsDelPedido
      });

      setPedidoSeleccionado(pedidosDisponibles.find(p => p.id.toString() === pedidoId));
      setIsProductosFromPedido(true);

      showAlert({
        title: 'Pedido cargado',
        description: `Se cargaron ${itemsDelPedido.length} producto(s) del pedido`,
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } catch (error) {
      console.error('Error al cargar pedido:', error);
      showAlert({
        title: 'Error',
        description: 'No se pudo cargar el pedido y sus productos',
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
          <h2>Gestión de Ventas</h2>
          <p className="text-muted-foreground">Consulta y administra las ventas realizadas</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={() => setIsModalOpen(true)}>
          Nueva Venta
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar venta por número o cliente..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setFilters({ query: '', fecha: '', metodopago: '', estado: '' })}
            disabled={!filters.query.trim() && !filters.fecha && !filters.metodopago && !filters.estado}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          <input
            type="date"
            value={filters.fecha}
            onChange={(event) => setFilters((current) => ({ ...current, fecha: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={filters.metodopago}
            onChange={(event) => setFilters((current) => ({ ...current, metodopago: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Metodo de Pago (todos)</option>
            <option value="Efectivo">Efectivo</option>
            <option value="Tarjeta">Tarjeta</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Credito">Credito</option>
          </select>
          <select
            value={filters.estado}
            onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Estado (todos)</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Completada">Completada</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={ventasFiltradas}
        actions={[
          commonActions.view(handleView),
          commonActions.pdf(handleGeneratePDF),
        ]}
      />

      <Modal
        isOpen={Boolean(pendingStateChange)}
        onClose={handleCancelEstadoChange}
        title={`Cambiar estado - Venta ${pendingStateChange?.venta.numero_venta || ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-accent/30 p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Estado actual: {pendingStateChange?.from || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Nuevo estado: {pendingStateChange?.to || 'N/A'}</p>
          </div>

          {pendingStateChange?.to === 'Cancelada' ? (
            <FormField
              label="Motivo del cambio"
              name="motivo-cambio-venta"
              type="textarea"
              value={stateChangeReason}
              onChange={(value) => setStateChangeReason(String(value))}
              rows={3}
              required
              placeholder="Explica por qué se cancela la venta (mínimo 10 caracteres)"
            />
          ) : null}

          <FormActions>
            <Button variant="outline" onClick={handleCancelEstadoChange} disabled={stateChangeSaving}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmEstadoChange} disabled={stateChangeSaving}>
              {stateChangeSaving ? 'Guardando...' : 'Confirmar'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Detalle de Venta ${selectedVenta?.numero_venta}`}
        size="lg"
      >
        {selectedVenta && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p>{selectedVenta.cliente || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha</p>
                <p>{formatDateOnly(selectedVenta.fecha)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Método de Pago</p>
                <p>{selectedVenta.metodopago}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedVenta.estado === 'Completada' ? 'bg-green-100 text-green-700' :
                  selectedVenta.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedVenta.estado}
                </span>
              </div>
            </div>

            <div>
              <h4 className="mb-2">Productos</h4>
              {selectedVenta.items && selectedVenta.items.length > 0 ? (
              <table className="w-full border border-border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left">Producto</th>
                    <th className="p-3 text-right">Cantidad</th>
                    <th className="p-3 text-right">Precio Unit.</th>
                    <th className="p-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedVenta.items.map((item, index) => (
                    <tr key={index} className="border-t border-border">
                      <td className="p-3">{item.producto}</td>
                      <td className="p-3 text-right">{item.cantidad}</td>
                      <td className="p-3 text-right">{formatCurrency(item.precio_unitario)}</td>
                      <td className="p-3 text-right">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-accent/50">
                    <td colSpan={3} className="p-3 text-right">Total:</td>
                    <td className="p-3 text-right">{formatCurrency(selectedVenta.total)}</td>
                  </tr>
                </tbody>
              </table>
              ) : (
                <p className="text-muted-foreground">No hay items en esta venta</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        title="Factura de Venta"
        size="lg"
      >
        <div className="space-y-4">
          <pre className="p-4 bg-accent/50 rounded-lg text-sm">
            {pdfContent}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => downloadPdfText(pdfContent, `factura-venta-${selectedVenta?.numero_venta || 'venta'}.pdf`)}
            >
              Descargar PDF
            </Button>
            <Button variant="outline" onClick={() => setIsPdfModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Venta"
        size="lg"
      >
        <div className="space-y-4">
          <FormField
            label="Tipo de Venta"
            name="tipo"
            type="select"
            value={formData.tipo}
            onChange={(value) => setFormData({ ...formData, tipo: value as 'Directa' | 'Por Pedido' })}
            options={[
              { value: 'Directa', label: 'Venta Directa' },
              { value: 'Por Pedido', label: 'Venta Por Pedido' }
            ]}
            required
          />

          <FormField
            label="Cliente"
            name="cliente_id"
            type="select"
            value={formData.cliente_id}
            onChange={(value) => setFormData({ ...formData, cliente_id: value as string })}
            options={[
              { value: '', label: 'Seleccionar cliente...' },
              ...clientes.map(c => ({
                value: c.id.toString(),
                label: `${c.nombre} ${c.apellido} - ${c.documento}`
              }))
            ]}
            placeholder="Seleccionar cliente"
            required
          />

          {formData.tipo === 'Por Pedido' && (
            <FormField
              label="Número de Pedido"
              name="pedido"
              type="select"
              value={formData.pedido}
              onChange={(value) => handlePedidoSelected(value as string)}
              options={[
                { value: '', label: 'Seleccionar pedido...' },
                ...pedidosDisponibles.map(p => ({
                  value: p.id.toString(),
                  label: `[ID: ${p.id} | ${p.numero_pedido}] - Cliente: ${p.cliente} - ${p.productos} producto${p.productos !== 1 ? 's' : ''}`
                }))
              ]}
              placeholder="Buscar y seleccionar pedido"
              required
            />
          )}

          <FormField
            label="Método de Pago"
            name="metodopago"
            type="select"
            value={formData.metodopago}
            onChange={(value) => setFormData({ ...formData, metodopago: value as string })}
            options={[
              { value: 'Efectivo', label: 'Efectivo' },
              { value: 'Tarjeta', label: 'Tarjeta' },
              { value: 'Transferencia', label: 'Transferencia' }
            ]}
            required
          />

          <FormField
            label="Esquema de Abono"
            name="esquema_abono"
            type="select"
            value={formData.esquema_abono}
            onChange={(value) => setFormData({ ...formData, esquema_abono: value as string })}
            options={[
              { label: '50% (Abono Inicial)', value: '50%' },
              { label: '100% (Total)', value: '100%' }
            ]}
            required
          />

          {formData.esquema_abono === '50%' && (
            <>
              <FormField
                label="Abono Recibido"
                name="abono_recibido"
                type="number"
                value={formData.abono_recibido}
                onChange={(value) => setFormData({ ...formData, abono_recibido: parseFloat(value as string) || 0 })}
                min="0"
                step="0.01"
                placeholder="0"
              />
              <div className="p-3 bg-orange-50 border border-orange-300 rounded-lg">
                <p className="text-sm text-orange-700">
                  📊 Total: {formatCurrency(formData.items.reduce((acc, item) => acc + item.subtotal, 0))} | 
                  Abono requerido (50%): {formatCurrency((formData.items.reduce((acc, item) => acc + item.subtotal, 0) * 0.5))} |
                  Recibido: {formatCurrency(formData.abono_recibido)}
                </p>
              </div>
            </>
          )}

          <div className="space-y-4 border-t border-border pt-4">
            {!isProductosFromPedido && (
              <>
                <h4>Agregar Productos</h4>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    label="Producto"
                    name="producto"
                    type="select"
                    value={currentItem.producto_id}
                    onChange={(value) => handleProductoChange(value as string)}
                    options={[
                      { value: '', label: 'Seleccionar producto...' },
                      ...productos.map(p => ({
                        value: p.id.toString(),
                        label: `${p.nombre} (Stock: ${p.stock}) - ${formatCurrency(p.precio)}`
                      }))
                    ]}
                    placeholder="Seleccionar producto"
                  />

                  <FormField
                    label="Cantidad"
                    name="cantidad"
                    type="number"
                    value={currentItem.cantidad}
                    onChange={(value) => setCurrentItem({ ...currentItem, cantidad: value as number })}
                    placeholder="0"
                  />

                  <FormField
                    label="Precio Unitario"
                    name="precio_unitario"
                    type="number"
                    value={currentItem.precio_unitario}
                    onChange={(value) => setCurrentItem({ ...currentItem, precio_unitario: value as number })}
                    placeholder="0"
                    disabled
                  />
                </div>

                {disponibleParaLineaActual !== null ? (
                  <p className="text-xs text-muted-foreground">
                    Puedes agregar hasta {disponibleParaLineaActual.disponible} unidad
                    {disponibleParaLineaActual.disponible !== 1 ? 'es' : ''} (
                    inventario actual: {disponibleParaLineaActual.stock}
                    ).
                  </p>
                ) : null}

                <Button type="button" onClick={handleAddItem} icon={<Plus className="w-4 h-4" />}>
                  Agregar Producto
                </Button>
              </>
            )}

            {isProductosFromPedido && (
              <div className="p-4 bg-green-50 border border-green-300 rounded-lg">
                <h4 className="font-semibold text-green-700 mb-2">✓ Productos cargados del Pedido</h4>
                <p className="text-sm text-green-600">
                  {formData.items.length} producto{formData.items.length !== 1 ? 's' : ''} del pedido seleccionado
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  🔒 Los productos están vinculados al pedido. No se pueden modificar.
                </p>
              </div>
            )}

          {formData.items.length > 0 && (
            <div className="space-y-2">
              <h4>Productos Agregados</h4>
              {isProductosFromPedido && (
                <div className="absolute top-2 right-2 bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-semibold">
                  🔒 Vinculados al pedido
                </div>
              )}
              <table className="w-full border border-border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left">Producto</th>
                    <th className="p-3 text-right">Cantidad</th>
                    <th className="p-3 text-right">Precio Unit.</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => (
                    <tr key={index} className={`border-t border-border ${isProductosFromPedido ? 'bg-gray-50' : ''}`}>
                      <td className={`p-3 ${isProductosFromPedido ? 'text-gray-600' : ''}`}>{item.producto}</td>
                      <td className={`p-3 text-right ${isProductosFromPedido ? 'text-gray-600' : ''}`}>{item.cantidad}</td>
                      <td className={`p-3 text-right ${isProductosFromPedido ? 'text-gray-600' : ''}`}>{formatCurrency(item.precio_unitario)}</td>
                      <td className={`p-3 text-right ${isProductosFromPedido ? 'text-gray-600' : ''}`}>{formatCurrency(item.subtotal)}</td>
                      <td className="p-3 text-right">
                        {!isProductosFromPedido ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">🔒 Bloqueado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-accent/50">
                    <td colSpan={3} className="p-3 text-right">Total:</td>
                    <td className="p-3 text-right">{formatCurrency(formData.items.reduce((acc, item) => acc + item.subtotal, 0))}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3 pt-4 justify-end">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsModalOpen(false);
                setFormData({
                  tipo: 'Directa',
                  cliente_id: '',
                  pedido: '',
                  metodopago: 'Efectivo',
                  metodo_pago: 'Efectivo',
                  esquema_abono: '100%',
                  abono_recibido: 0,
                  items: []
                });
                setIsProductosFromPedido(false);
                setPedidoSeleccionado(null);
                setCurrentItem({ producto: '', producto_id: '', cantidad: 0, precio_unitario: 0 });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveVenta} disabled={formData.items.length === 0}>
              Guardar Venta
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
