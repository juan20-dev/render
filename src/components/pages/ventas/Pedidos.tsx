import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Button } from '../../Button';
import { Form, FormField, FormActions } from '../../Form';
import { Plus, Eye, Trash2, Minus, DollarSign, Search, RotateCcw } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { pedidos as pedidosAPI, clientes as clientesAPI, productos as productosAPI, abonos as abonosAPI } from '../../../services/api';
import { downloadPdfText } from '../../../utils/pdf';

interface Pedido {
  id: string;
  numero_pedido?: string;
  cliente_id: number;
  cliente?: string;
  productos?: number;
  total: number;
  fecha: string;
  fecha_entrega: string;
  estado: 'Pendiente' | 'En Proceso' | 'Completado' | 'Cancelado';
}

interface Producto {
  id: string | number;
  nombre: string;
  precio: number;
}

interface ProductoEnPedido {
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface StateChangeRequest {
  pedido: Pedido;
  from: Pedido['estado'];
  to: Pedido['estado'];
}

export function Pedidos() {
  const isPedidoEstadoFinal = (estado: Pedido['estado'] | string) =>
    estado === 'Completado' || estado === 'Cancelado';
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    query: '',
    fecha: '',
    estado: ''
  });
  const [productosDisponibles, setProductosDisponibles] = useState<Producto[]>([]);
  const [clientesDisponibles, setClientesDisponibles] = useState<Array<{value: string, label: string}>>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [selectedEstado, setSelectedEstado] = useState<'Pendiente' | 'En Proceso' | 'Completado' | 'Cancelado'>('Pendiente');
  const [pendingStateChange, setPendingStateChange] = useState<StateChangeRequest | null>(null);
  const [stateChangeReason, setStateChangeReason] = useState('');
  const [stateChangeSaving, setStateChangeSaving] = useState(false);
  const [isAbonosModalOpen, setIsAbonosModalOpen] = useState(false);
  const [pedidoParaAbonos, setPedidoParaAbonos] = useState<Pedido | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfContent, setPdfContent] = useState('');
  const [abonosDelPedido, setAbonosDelPedido] = useState<any[]>([]);
  const [loadingAbonos, setLoadingAbonos] = useState(false);
  const { showAlert, AlertComponent } = useAlertDialog();
  
  // Form data para crear/editar
  const [formData, setFormData] = useState({
    cliente_id: 0,
    fecha: new Date().toISOString().split('T')[0],
    fecha_entrega: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadPedidos();
    loadProductos();
    loadClientes();
  }, []);

  const loadPedidos = async () => {
    try {
      setLoading(true);
      const data = await pedidosAPI.getAll();
      setPedidos(data);
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProductos = async () => {
    try {
      const data = await productosAPI.getAll();
      setProductosDisponibles(data.filter((p: any) => p.estado === 'Activo'));
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const loadClientes = async () => {
    try {
      const data = await clientesAPI.getAll();
      setClientesDisponibles(data
        .filter((c: any) => c.estado === 'Activo')
        .map((c: any) => ({
          value: c.id.toString(),
          label: c.nombre
        })));
    } catch (error) {
      console.error('Error cargando clientes:', error);
    }
  };
  
  const [productosEnPedido, setProductosEnPedido] = useState<ProductoEnPedido[]>([]);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const columns: Column[] = [
    { key: 'numero_pedido', label: 'ID Pedido' },
    { key: 'cliente', label: 'Cliente' },
    { 
      key: 'productos', 
      label: 'Productos',
      render: (value: number) => `${value || 0} producto${value !== 1 ? 's' : ''}`
    },
    { 
      key: 'total', 
      label: 'Total',
      render: (total: number) => formatCurrency(total)
    },
    { key: 'fecha', label: 'Fecha Pedido' },
    { key: 'fecha_entrega', label: 'Fecha Entrega' },
    { 
      key: 'estado', 
      label: 'Estado',
      render: (estado: string, pedido: Pedido) => (
        <select
          value={estado}
          onChange={(event) => handleEstadoChangeRequest(pedido, event.target.value as Pedido['estado'])}
          disabled={stateChangeSaving || isPedidoEstadoFinal(estado)}
          className={`min-h-8 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            estado === 'Completado' ? 'bg-green-100 text-green-700' :
            estado === 'En Proceso' ? 'bg-blue-100 text-blue-700' :
            estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}
        >
          <option value="Pendiente">Pendiente</option>
          <option value="En Proceso">En Proceso</option>
          <option value="Completado">Completado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      )
    }
  ];

  const pedidosFiltrados = useMemo(() => {
    const normalizedQuery = filters.query.trim().toLowerCase();

    return pedidos.filter((pedido) => {
      const matchesQuery =
        !normalizedQuery ||
        String(pedido.numero_pedido || pedido.id).toLowerCase().includes(normalizedQuery) ||
        String(pedido.cliente || '').toLowerCase().includes(normalizedQuery);
      const matchesFecha = !filters.fecha || String(pedido.fecha || '').includes(filters.fecha);
      const matchesEstado = !filters.estado || pedido.estado === filters.estado;
      return matchesQuery && matchesFecha && matchesEstado;
    });
  }, [pedidos, filters]);

  // Calcular total del pedido
  const calcularTotal = () => {
    return productosEnPedido.reduce((sum, p) => sum + p.subtotal, 0);
  };

  // Agregar producto al pedido
  const handleAgregarProducto = () => {
    setProductosEnPedido([
      ...productosEnPedido,
      {
        producto_id: '',
        nombre: '',
        cantidad: 1,
        precio_unitario: 0,
        subtotal: 0
      }
    ]);
  };

  // Eliminar producto del pedido
  const handleEliminarProducto = (index: number) => {
    setProductosEnPedido(productosEnPedido.filter((_, i) => i !== index));
  };

  // Actualizar producto en el pedido
  const handleUpdateProducto = (index: number, field: keyof ProductoEnPedido, value: any) => {
    const newProductos = [...productosEnPedido];
    
    if (field === 'producto_id') {
      const producto = productosDisponibles.find((p) => String(p.id) === String(value));
      if (producto) {
        newProductos[index] = {
          ...newProductos[index],
          producto_id: String(producto.id),
          nombre: producto.nombre,
          precio_unitario: Number(producto.precio) || 0,
          subtotal: (Number(producto.precio) || 0) * newProductos[index].cantidad
        };
      }
    } else if (field === 'cantidad') {
      const cantidad = parseInt(value) || 1;
      newProductos[index] = {
        ...newProductos[index],
        cantidad,
        subtotal: newProductos[index].precio_unitario * cantidad
      };
    } else if (field === 'precio_unitario') {
      const precio = parseFloat(value) || 0;
      newProductos[index] = {
        ...newProductos[index],
        precio_unitario: precio,
        subtotal: precio * newProductos[index].cantidad
      };
    }
    
    setProductosEnPedido(newProductos);
  };

  // Crear nuevo pedido
  const handleCreatePedido = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (productosEnPedido.length === 0) {
      showAlert({
        title: 'Pedido sin productos',
        description: 'Debe agregar al menos un producto al pedido.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }
    
    if (productosEnPedido.some(p => !p.producto_id)) {
      showAlert({
        title: 'Producto faltante',
        description: 'Debe seleccionar un producto para cada fila.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }
    
    try {
      const newPedido = {
        cliente_id: formData.cliente_id,
        total: calcularTotal(),
        fecha: formData.fecha,
        fecha_entrega: formData.fecha_entrega,
        estado: 'Pendiente' as const
      };

      const createResult: any = await pedidosAPI.create(newPedido);
      const pedidoId = Number(createResult?.id);

      if (!pedidoId) {
        throw new Error('No se obtuvo el id del pedido creado');
      }

      await Promise.all(
        productosEnPedido.map((item) =>
          pedidosAPI.addProducto({
            pedidoId,
            productoId: Number(item.producto_id),
            cantidad: Number(item.cantidad),
            precioUnitario: Number(item.precio_unitario),
          })
        )
      );

      await loadPedidos();
      setIsCreateModalOpen(false);
      
      // Limpiar formulario
      setFormData({
        cliente_id: 0,
        fecha: new Date().toISOString().split('T')[0],
        fecha_entrega: new Date().toISOString().split('T')[0],
      });
      setProductosEnPedido([]);
      showAlert({
        title: 'Éxito',
        description: 'Pedido creado correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } catch (error) {
      console.error('Error creando pedido:', error);
      showAlert({
        title: 'Error',
        description: 'No se pudo crear el pedido.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    }
  };

  const handleEstadoChangeRequest = (pedido: Pedido, nuevoEstado: Pedido['estado']) => {
    if (pedido.estado === nuevoEstado) return;
    if (isPedidoEstadoFinal(pedido.estado)) {
      showAlert({
        title: 'Estado bloqueado',
        description: 'Un pedido en estado Completado o Cancelado no se puede modificar.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    setPendingStateChange({
      pedido,
      from: pedido.estado,
      to: nuevoEstado,
    });
    setStateChangeReason('');
  };

  const handleConfirmEstadoChange = async () => {
    if (!pendingStateChange) return;
    if (isPedidoEstadoFinal(pendingStateChange.from)) {
      setPendingStateChange(null);
      setStateChangeReason('');
      showAlert({
        title: 'Estado bloqueado',
        description: 'Un pedido en estado Completado o Cancelado no se puede modificar.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    if (pendingStateChange.to === 'Cancelado' && stateChangeReason.trim().length < 10) {
      showAlert({
        title: 'Motivo requerido',
        description: 'Para cancelar el pedido debes indicar un motivo de al menos 10 caracteres.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      setStateChangeSaving(true);
      await pedidosAPI.updateStatus(Number(pendingStateChange.pedido.id), { 
        estado: pendingStateChange.to,
        motivo: pendingStateChange.to === 'Cancelado' ? stateChangeReason : undefined
      });
      await loadPedidos();
      setPendingStateChange(null);
      setStateChangeReason('');
    } catch (error) {
      console.error('Error actualizando estado:', error);
    } finally {
      setStateChangeSaving(false);
    }
  };

  const handleCancelEstadoChange = () => {
    setPendingStateChange(null);
    setStateChangeReason('');
  };

  const handleEdit = (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setSelectedEstado(pedido.estado);
    setFormData({
      cliente_id: pedido.cliente_id,
      fecha: pedido.fecha,
      fecha_entrega: pedido.fecha_entrega
    });
    // Inicializar con productos de ejemplo
    setProductosEnPedido([
      {
        producto_id: 'PROD-001',
        nombre: 'Producto ejemplo',
        cantidad: 2,
        precio_unitario: 120000,
        subtotal: 240000
      }
    ]);
    setIsEditModalOpen(true);
  };

  const handleUpdatePedido = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (productosEnPedido.length === 0) {
      showAlert({
        title: 'Pedido sin productos',
        description: 'Debe agregar al menos un producto al pedido.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }
    
    if (productosEnPedido.some(p => !p.producto_id)) {
      showAlert({
        title: 'Producto faltante',
        description: 'Debe seleccionar un producto para cada fila.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }
    
    if (selectedPedido) {
      try {
        await pedidosAPI.update(Number(selectedPedido.id), {
          cliente_id: formData.cliente_id,
          fecha: formData.fecha,
          fecha_entrega: formData.fecha_entrega,
          total: calcularTotal(),
          estado: selectedEstado
        });
        await loadPedidos();
        setIsEditModalOpen(false);
        setSelectedPedido(null);
        setProductosEnPedido([]);
        showAlert({
          title: 'Éxito',
          description: 'Pedido actualizado correctamente.',
          type: 'success',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      } catch (error) {
        console.error('Error actualizando pedido:', error);
        showAlert({
          title: 'Error',
          description: 'No se pudo actualizar el pedido.',
          type: 'danger',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      }
    }
  };

  const handleVerAbonos = async (pedido: Pedido) => {
    setPedidoParaAbonos(pedido);
    setIsAbonosModalOpen(true);
    setLoadingAbonos(true);
    try {
      const data = await abonosAPI.getByPedido(Number(pedido.id));
      setAbonosDelPedido(data || []);
    } catch (error) {
      console.error('Error cargando abonos:', error);
      setAbonosDelPedido([]);
    } finally {
      setLoadingAbonos(false);
    }
  };

  const getPedidoAbonos = () => {
    return abonosDelPedido;
  };

  const handleGeneratePDF = async (pedido: Pedido) => {
    setLoadingAbonos(true);
    try {
      const abonos = await abonosAPI.getByPedido(Number(pedido.id));
      const totalAbonado = abonos.reduce((sum: number, a: any) => sum + a.monto, 0);
      const saldoPendiente = pedido.total - totalAbonado;

    const abonosDetail = abonos.length > 0 
      ? abonos.map((abono: any, index: number) => 
          `${index + 1}. ${abono.numero_abono || abono.id} - ${formatCurrency(abono.monto)} (${abono.metodo_pago}) - ${abono.fecha}`
        ).join('\n')
      : 'Sin abonos registrados';

    const content = `
╔════════════════════════════════════════════════════════════╗
║           GRANDMA'S LIQUEURS - DETALLE DE PEDIDO          ║
╚════════════════════════════════════════════════════════════╝

ID Pedido:          ${pedido.id}
Cliente:            ${pedido.cliente}
Fecha Pedido:       ${pedido.fecha}
Fecha Entrega:      ${pedido.fechaEntrega}
Estado:             ${pedido.estado}

──────────────────────────────────────���─────────────────────
RESUMEN DEL PEDIDO:
────────────────────────────────────────────────────────────

Productos:          ${pedido.productos} items
Total Pedido:       ${formatCurrency(pedido.total)}

────────────────────────────────────────────────────────────
ABONOS REGISTRADOS:
────────────────────────────────────────────────────────────

${abonosDetail}

────────────────────────────────────────────────────────────
Total Abonado:      ${formatCurrency(totalAbonado)}
Saldo Pendiente:    ${formatCurrency(saldoPendiente)}
────────────────────────────────────────────────────────────

Firma Cliente:      _______________________

Firma Autorizado:   _______________________

Fecha Impresión:    ${new Date().toLocaleString('es-CO')}
──────���─────────────────────────────────────────────────────
    `.trim();

    setPdfContent(content);
    setIsPdfModalOpen(true);
    } catch (error) {
      console.error('Error generando PDF:', error);
      showAlert({
        title: 'Error',
        description: 'No se pudo cargar los abonos para generar el PDF.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } finally {
      setLoadingAbonos(false);
    }
  };

  return (
    <div className="space-y-6">
      {AlertComponent}
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Pedidos</h2>
          <p className="text-muted-foreground">Administra los pedidos de clientes</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={() => setIsCreateModalOpen(true)}>
          Nuevo Pedido
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
              placeholder="Buscar pedido por ID o cliente..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setFilters({ query: '', fecha: '', estado: '' })}
            disabled={!filters.query.trim() && !filters.fecha && !filters.estado}
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
            value={filters.estado}
            onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Estado (todos)</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En Proceso">En Proceso</option>
            <option value="Completado">Completado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={pedidosFiltrados}
        actions={[
          commonActions.view((pedido) => {
            setSelectedPedido(pedido);
            setIsDetailModalOpen(true);
          }),
          {
            label: 'Ver Abonos',
            icon: <DollarSign className="w-4 h-4" />,
            onClick: handleVerAbonos,
            variant: 'outline'
          },
          commonActions.edit(handleEdit),
          commonActions.pdf(handleGeneratePDF),
        ]}
      />

      <Modal
        isOpen={Boolean(pendingStateChange)}
        onClose={handleCancelEstadoChange}
        title={`Cambiar estado - Pedido ${pendingStateChange?.pedido.numero_pedido || pendingStateChange?.pedido.id || ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-accent/30 p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Estado actual: {pendingStateChange?.from || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Nuevo estado: {pendingStateChange?.to || 'N/A'}</p>
          </div>

          {pendingStateChange?.to === 'Cancelado' ? (
            <FormField
              label="Motivo del cambio"
              name="motivo-cambio-pedido"
              type="textarea"
              value={stateChangeReason}
              onChange={(value) => setStateChangeReason(String(value))}
              rows={3}
              required
              placeholder="Explica por qué se cancela el pedido (mínimo 10 caracteres)"
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

      {loading && (
        <div className="text-center py-8">
          <p>Cargando pedidos...</p>
        </div>
      )}

      {/* Modal de Crear Pedido */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setFormData({
            cliente_id: 0,
            fecha: new Date().toISOString().split('T')[0],
            fecha_entrega: new Date().toISOString().split('T')[0],
          });
          setProductosEnPedido([]);
        }}
        title="Crear Nuevo Pedido"
        size="xl"
      >
        <Form onSubmit={handleCreatePedido}>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              label="Cliente"
              name="cliente_id"
              type="select"
              value={formData.cliente_id.toString()}
              onChange={(value) => setFormData({ ...formData, cliente_id: parseInt(value as string) })}
              options={clientesDisponibles}
              required
            />
            
            <FormField
              label="Fecha Pedido"
              name="fecha"
              type="date"
              value={formData.fecha}
              onChange={(value) => setFormData({ ...formData, fecha: value as string })}
              required
            />
            
            <FormField
              label="Fecha Entrega"
              name="fecha_entrega"
              type="date"
              value={formData.fecha_entrega}
              onChange={(value) => setFormData({ ...formData, fecha_entrega: value as string })}
              required
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label>Productos del Pedido</label>
              <Button 
                type="button"
                size="sm" 
                icon={<Plus className="w-4 h-4" />} 
                onClick={handleAgregarProducto}
              >
                Agregar Producto
              </Button>
            </div>

            {productosEnPedido.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left">Producto</th>
                      <th className="px-4 py-2 text-left w-24">Cantidad</th>
                      <th className="px-4 py-2 text-left w-32">Precio Unit.</th>
                      <th className="px-4 py-2 text-left w-32">Subtotal</th>
                      <th className="px-4 py-2 text-center w-20">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosEnPedido.map((producto, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">
                          <select
                            className="w-full px-3 py-1 border rounded"
                            value={producto.producto_id}
                            onChange={(e) => handleUpdateProducto(index, 'producto_id', e.target.value)}
                            required
                          >
                            <option value="">Seleccionar producto...</option>
                            {productosDisponibles.map(p => (
                              <option key={String(p.id)} value={String(p.id)}>{p.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="1"
                            className="w-full px-3 py-1 border rounded"
                            value={producto.cantidad}
                            onChange={(e) => handleUpdateProducto(index, 'cantidad', e.target.value)}
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            className="w-full px-3 py-1 border rounded"
                            value={producto.precio_unitario}
                            onChange={(e) => handleUpdateProducto(index, 'precio_unitario', e.target.value)}
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          {formatCurrency(producto.subtotal)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleEliminarProducto(index)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right">
                        <strong>Total:</strong>
                      </td>
                      <td colSpan={2} className="px-4 py-2">
                        <strong>{formatCurrency(calcularTotal())}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed rounded-lg text-muted-foreground">
                No hay productos agregados. Haz clic en "Agregar Producto" para comenzar.
              </div>
            )}
          </div>
          
          <FormActions>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreateModalOpen(false);
                setFormData({
                  cliente_id: 0,
                  fecha: new Date().toISOString().split('T')[0],
                  fecha_entrega: new Date().toISOString().split('T')[0],
                });
                setProductosEnPedido([]);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Crear Pedido
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)}
        title={`Detalle de Pedido ${selectedPedido?.id}`}
        size="lg"
      >
        {selectedPedido && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">ID Pedido</p>
                <p>{selectedPedido.id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p>{selectedPedido.cliente}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Productos</p>
                <p>{selectedPedido.productos} producto{selectedPedido.productos !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p>{formatCurrency(selectedPedido.total)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha Pedido</p>
                <p>{selectedPedido.fecha}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha Entrega</p>
                <p>{selectedPedido.fecha_entrega}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedPedido.estado === 'Completado' ? 'bg-green-100 text-green-700' :
                  selectedPedido.estado === 'En Proceso' ? 'bg-blue-100 text-blue-700' :
                  selectedPedido.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedPedido.estado}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Edición */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedPedido(null);
          setProductosEnPedido([]);
        }}
        title={`Editar Pedido ${selectedPedido?.id}`}
        size="xl"
      >
        {selectedPedido && (
          <Form onSubmit={handleUpdatePedido}>
            <div className="grid grid-cols-3 gap-4">
              <FormField
                label="Cliente"
                name="cliente_id"
                type="select"
                value={formData.cliente_id.toString()}
                onChange={(value) => setFormData({ ...formData, cliente_id: parseInt(value as string) })}
                options={clientesDisponibles}
                required
              />
              
              <FormField
                label="Fecha Pedido"
                name="fecha"
                type="date"
                value={formData.fecha}
                onChange={(value) => setFormData({ ...formData, fecha: value as string })}
                required
              />
              
              <FormField
                label="Fecha Entrega"
                name="fecha_entrega"
                type="date"
                value={formData.fecha_entrega}
                onChange={(value) => setFormData({ ...formData, fecha_entrega: value as string })}
                required
              />
            </div>

            <div className="rounded-lg border border-border bg-accent/20 px-3 py-2">
              <label className="text-sm text-muted-foreground block">Estado del Pedido</label>
              <p className="text-sm">{selectedPedido.estado}</p>
              <p className="text-xs text-muted-foreground mt-1">Para cambiar el estado usa el selector de la tabla.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label>Productos del Pedido</label>
                <Button 
                  type="button"
                  size="sm" 
                  icon={<Plus className="w-4 h-4" />} 
                  onClick={handleAgregarProducto}
                >
                  Agregar Producto
                </Button>
              </div>

              {productosEnPedido.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left">Producto</th>
                        <th className="px-4 py-2 text-left w-24">Cantidad</th>
                        <th className="px-4 py-2 text-left w-32">Precio Unit.</th>
                        <th className="px-4 py-2 text-left w-32">Subtotal</th>
                        <th className="px-4 py-2 text-center w-20">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosEnPedido.map((producto, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2">
                            <select
                              className="w-full px-3 py-1 border rounded"
                              value={producto.producto_id}
                              onChange={(e) => handleUpdateProducto(index, 'producto_id', e.target.value)}
                              required
                            >
                              <option value="">Seleccionar producto...</option>
                              {productosDisponibles.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="1"
                              className="w-full px-3 py-1 border rounded"
                              value={producto.cantidad}
                              onChange={(e) => handleUpdateProducto(index, 'cantidad', e.target.value)}
                              required
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              className="w-full px-3 py-1 border rounded"
                              value={producto.precio_unitario}
                              onChange={(e) => handleUpdateProducto(index, 'precio_unitario', e.target.value)}
                              required
                            />
                          </td>
                          <td className="px-4 py-2">
                            {formatCurrency(producto.subtotal)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleEliminarProducto(index)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right">
                          <strong>Total:</strong>
                        </td>
                        <td colSpan={2} className="px-4 py-2">
                          <strong>{formatCurrency(calcularTotal())}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center border-2 border-dashed rounded-lg text-muted-foreground">
                  No hay productos agregados. Haz clic en "Agregar Producto" para comenzar.
                </div>
              )}
            </div>

            {/* Acciones del modal */}
            <FormActions>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedPedido(null);
                  setProductosEnPedido([]);
                }}
              >
                Cerrar
              </Button>
              <Button 
                type="submit"
                disabled={selectedPedido.estado === 'Cancelado'}
              >
                Guardar Cambios
              </Button>
            </FormActions>
          </Form>
        )}
      </Modal>

      {/* Modal de Abonos */}
      <Modal
        isOpen={isAbonosModalOpen}
        onClose={() => setIsAbonosModalOpen(false)}
        title={`Abonos del Pedido ${pedidoParaAbonos?.id}`}
        size="lg"
      >
        <div className="space-y-4">
          {getPedidoAbonos().length > 0 ? (
            <>
              <div className="space-y-2">
                {getPedidoAbonos().map((abono) => (
                  <div key={abono.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{abono.id}</p>
                        <p className="text-sm text-muted-foreground">{abono.fecha}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(abono.monto)}</p>
                        <p className="text-sm text-muted-foreground">{abono.metodoPago}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-accent rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Abonado:</span>
                  <span className="font-medium">
                    {formatCurrency(getPedidoAbonos().reduce((sum, a) => sum + a.monto, 0))}
                  </span>
                </div>
                {pedidoParaAbonos && (
                  <div className="flex justify-between items-center mt-2 text-sm text-muted-foreground">
                    <span>Saldo Pendiente:</span>
                    <span>
                      {formatCurrency(
                        pedidoParaAbonos.total - getPedidoAbonos().reduce((sum, a) => sum + a.monto, 0)
                      )}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No hay abonos registrados para este pedido
            </div>
          )}
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={() => setIsAbonosModalOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de PDF */}
      <Modal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        title={`PDF del Pedido ${selectedPedido?.id}`}
        size="lg"
      >
        <div className="space-y-4">
          <pre className="p-4 bg-accent rounded-lg text-sm">
            {pdfContent}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => downloadPdfText(pdfContent, `pedido-${selectedPedido?.numero_pedido || selectedPedido?.id || 'pedido'}.pdf`)}
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