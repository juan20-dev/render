import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions, openPrintablePdf } from '../../DataTable';
import { Modal } from '../../Modal';
import { Button } from '../../Button';
import { Form, FormField, FormActions } from '../../Form';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import type { Pedido, Cliente, Producto, PedidoProducto } from '../../../services/types';
import { MotivoModal } from '../../MotivoModal';
import { AlertDialog } from '../../AlertDialog';

interface PedidoView extends Pedido {
  clienteNombre?: string;
}

interface ProductoEnForm {
  productoId: number;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export function Pedidos() {
  const [pedidos, setPedidos] = useState<PedidoView[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [pedidoPending, setPedidoPending] = useState<{
    pedido: PedidoView;
    to: Pedido['estado'];
  } | null>(null);
  const [motivoEstado, setMotivoEstado] = useState('');
  const [selectedPedido, setSelectedPedido] = useState<PedidoView | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroMetodoPago, setFiltroMetodoPago] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [productosEnPedido, setProductosEnPedido] = useState<ProductoEnForm[]>([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [mostrarListaClientes, setMostrarListaClientes] = useState(false);
  const [formData, setFormData] = useState({
    clienteId: 0,
    metodoPago: 'efectivo' as 'efectivo' | 'transferencia',
    porcentajeAbono: 50,
    fechaPedido: new Date().toISOString().split('T')[0],
    fechaEntrega: new Date().toISOString().split('T')[0],
    direccion: '',
    telefono: ''
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  // Cerrar listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setMostrarListaClientes(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cargarDatos = async () => {
    try {
      const [pedidosData, clientesData, productosData] = await Promise.all([
        api.pedidos.getAll(),
        api.clientes.getAll(),
        api.productos.getAll()
      ]);

      setClientes(clientesData.filter(c => c.estado === 'activo'));
      setProductos(productosData.filter(p => p.estado === 'activo'));

      const pedidosConInfo = pedidosData.map(pedido => {
        const cliente = clientesData.find(c => c.id === pedido.clienteId);
        return {
          ...pedido,
          clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'
        };
      });

      setPedidos(pedidosConInfo);
    } catch (error) {
      toast.error('Error al cargar datos');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const pedidoEstadoOpciones = (
    estado: Pedido['estado']
  ): { v: Pedido['estado']; l: string }[] => {
    if (estado === 'pendiente') {
      return [
        { v: 'pendiente', l: 'Pendiente' },
        { v: 'en proceso', l: 'En Proceso' },
        { v: 'cancelado', l: 'Cancelado' }
      ];
    }
    if (estado === 'en proceso') {
      return [
        { v: 'en proceso', l: 'En Proceso' },
        { v: 'completado', l: 'Completado' },
        { v: 'cancelado', l: 'Cancelado' }
      ];
    }
    if (estado === 'completado') {
      return [{ v: 'completado', l: 'Completado' }];
    }
    if (estado === 'cancelado') {
      return [{ v: 'cancelado', l: 'Cancelado' }];
    }
    return [{ v: estado, l: estado }];
  };

  const ejecutarPedidoCambioEstado = async (
    pedido: PedidoView,
    to: Pedido['estado'],
    motivo?: string
  ) => {
    try {
      await api.pedidos.changeEstado(pedido.id, to, motivo);
      toast.success(`Estado cambiado a ${to}`);
      setPedidoPending(null);
      setMotivoEstado('');
      cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
      setPedidoPending(null);
      setMotivoEstado('');
      cargarDatos();
    }
  };

  const handlePedidoEstadoSelect = (pedido: PedidoView, to: Pedido['estado']) => {
    if (pedido.estado === to) return;
    if (pedido.estado === 'completado' || pedido.estado === 'cancelado') {
      toast.error('No se puede modificar el estado de un pedido en estado final');
      return;
    }
    if (to === 'cancelado') {
      setPedidoPending({ pedido, to });
      setMotivoEstado('');
      return;
    }
    if (to === 'completado') {
      setPedidoPending({ pedido, to });
      return;
    }
    void ejecutarPedidoCambioEstado(pedido, to);
  };

  const confirmPedidoCancelMotivo = async () => {
    if (!pedidoPending || pedidoPending.to !== 'cancelado') return;
    const m = motivoEstado.trim();
    if (m.length < 10 || m.length > 50) {
      toast.error('El motivo de cancelación debe tener entre 10 y 50 caracteres');
      return;
    }
    await ejecutarPedidoCambioEstado(pedidoPending.pedido, 'cancelado', m);
  };

  const confirmPedidoCompletar = () => {
    if (!pedidoPending || pedidoPending.to !== 'completado') return;
    void ejecutarPedidoCambioEstado(pedidoPending.pedido, 'completado');
  };

  const columns: Column[] = [
    {
      key: 'id',
      label: 'ID Pedido',
      render: (value: number) => `#${String(value).padStart(4, '0')}`
    },
    {
      key: 'clienteNombre',
      label: 'Cliente'
    },
    {
      key: 'productos',
      label: 'Productos',
      render: (productos: any[]) => (
        <span className="text-sm">
          {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
        </span>
      )
    },
    {
      key: 'metodoPago',
      label: 'Método de Pago',
      render: (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
    },
    {
      key: 'fechaPedido',
      label: 'Fecha Pedido'
    },
    {
      key: 'fechaEntrega',
      label: 'Fecha Entrega'
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: string, row: PedidoView) => {
        const opts = pedidoEstadoOpciones(row.estado);
        const locked = opts.length === 1;
        const bg =
          row.estado === 'completado'
            ? '#dcfce7'
            : row.estado === 'en proceso'
              ? '#dbeafe'
              : row.estado === 'pendiente'
                ? '#fef9c3'
                : '#fee2e2';
        const fg =
          row.estado === 'completado'
            ? '#166534'
            : row.estado === 'en proceso'
              ? '#1e40af'
              : row.estado === 'pendiente'
                ? '#854d0e'
                : '#991b1b';
        return (
          <select
            value={row.estado}
            onChange={(e) =>
              handlePedidoEstadoSelect(row, e.target.value as Pedido['estado'])
            }
            disabled={locked}
            className="px-3 py-1 rounded-full text-xs border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: bg, color: fg }}
            onClick={(e) => e.stopPropagation()}
          >
            {opts.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        );
      }
    }
  ];

  const handleAdd = () => {
    setSelectedPedido(null);
    setFormData({
      clienteId: 0,
      metodoPago: 'efectivo',
      porcentajeAbono: 0,
      fechaPedido: new Date().toISOString().split('T')[0],
      fechaEntrega: new Date().toISOString().split('T')[0],
      direccion: '',
      telefono: ''
    });
    setProductosEnPedido([]);
    setBusquedaCliente('');
    setMostrarListaClientes(false);
    setIsModalOpen(true);
  };

  const handleEdit = async (pedido: PedidoView) => {
    if (pedido.estado !== 'pendiente') {
      toast.error('Solo se pueden editar pedidos en estado pendiente');
      return;
    }

    const completo = await cargarPedidoCompleto(pedido);
    setSelectedPedido(completo);
    setFormData({
      clienteId: completo.clienteId,
      metodoPago: completo.metodoPago,
      porcentajeAbono: completo.porcentajeAbono,
      fechaPedido: completo.fechaPedido,
      fechaEntrega: completo.fechaEntrega,
      direccion: completo.direccion || '',
      telefono: completo.telefono || ''
    });

    const productosForm: ProductoEnForm[] = completo.productos.map(p => {
      const producto = productos.find(prod => prod.id === p.productoId);
      return {
        productoId: p.productoId,
        nombre: p.nombre || producto?.nombre || 'Desconocido',
        cantidad: p.cantidad,
        precio: p.precio,
        subtotal: p.subtotal
      };
    });
    setProductosEnPedido(productosForm);
    setIsModalOpen(true);
  };

  /** Carga el pedido completo (con productos, nombres y subtotales) desde el backend. */
  const cargarPedidoCompleto = async (pedido: PedidoView): Promise<PedidoView> => {
    try {
      const full = await api.pedidos.getById(pedido.id);
      const cliente = clientes.find((c) => c.id === full.clienteId);
      return {
        ...pedido,
        ...full,
        clienteNombre:
          pedido.clienteNombre ||
          (cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'),
      };
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo cargar el detalle del pedido');
      return pedido;
    }
  };

  const handleVerDetallePedido = async (pedido: PedidoView) => {
    const completo = await cargarPedidoCompleto(pedido);
    setSelectedPedido(completo);
    setIsDetailModalOpen(true);
  };

  const buildPedidoPdf = (pedido: PedidoView) => {
    const cliente = clientes.find((c) => c.id === pedido.clienteId);
    const opened = openPrintablePdf({
      title: `Pedido #${String(pedido.id).padStart(4, '0')}`,
      subtitle: `Generado el ${new Date().toLocaleString('es-CO')}`,
      sections: [
        {
          title: 'Datos generales',
          rows: [
            {
              label: 'Cliente',
              value: cliente ? `${cliente.nombre} ${cliente.apellido}` : `ID ${pedido.clienteId}`,
            },
            ...(cliente?.numeroDocumento
              ? [{ label: 'Documento cliente', value: cliente.numeroDocumento }]
              : []),
            { label: 'Fecha del pedido', value: pedido.fechaPedido },
            { label: 'Fecha de entrega', value: pedido.fechaEntrega },
            { label: 'Dirección de entrega', value: pedido.direccion || 'No especificada' },
            { label: 'Teléfono de contacto', value: pedido.telefono || 'No especificado' },
            { label: 'Método de pago', value: pedido.metodoPago },
            {
              label: 'Estado',
              value:
                pedido.estado === 'completado'
                  ? 'Completado'
                  : pedido.estado === 'en proceso'
                    ? 'En Proceso'
                    : pedido.estado === 'pendiente'
                      ? 'Pendiente'
                      : 'Cancelado',
            },
          ],
        },
        {
          title: 'Productos',
          table: {
            headers: ['Producto', 'Cantidad', 'Precio unit.', 'Subtotal'],
            rows: pedido.productos.map((p) => {
              const prod = productos.find((x) => x.id === p.productoId);
              return [
                p.nombre || prod?.nombre || `Producto ${p.productoId}`,
                p.cantidad,
                formatCurrency(p.precio),
                formatCurrency(p.subtotal),
              ];
            }),
          },
        },
        {
          title: 'Totales y abono',
          rows: [
            { label: 'Total', value: formatCurrency(pedido.total) },
            {
              label: 'Abono',
              value: `${pedido.porcentajeAbono}% (${formatCurrency(pedido.montoAbonado)})`,
            },
            {
              label: 'Saldo pendiente',
              value: formatCurrency(pedido.total - pedido.montoAbonado),
            },
          ],
        },
      ],
      footer: 'Comprobante generado por Grandma\u2019s Liquors. Use "Descargar PDF" para guardar o imprimir.',
    });
    if (!opened) {
      toast.error('No se pudo abrir la vista PDF', {
        description: 'Permita las ventanas emergentes para este sitio.',
      });
    }
  };

  /**
   * Abre vista PDF imprimible con el detalle completo del pedido y un boton
   * "Descargar PDF" que dispara el dialogo de impresion del navegador.
   */
  const handleVerPdfPedido = async (pedido: PedidoView) => {
    const completo = await cargarPedidoCompleto(pedido);
    buildPedidoPdf(completo);
  };

  const handleAgregarProducto = () => {
    setProductosEnPedido([
      ...productosEnPedido,
      {
        productoId: 0,
        nombre: '',
        cantidad: 1,
        precio: 0,
        subtotal: 0
      }
    ]);
  };

  const handleEliminarProducto = (index: number) => {
    setProductosEnPedido(productosEnPedido.filter((_, i) => i !== index));
  };

  const handleUpdateProducto = (index: number, field: keyof ProductoEnForm, value: any) => {
    const newProductos = [...productosEnPedido];

    if (field === 'productoId') {
      const producto = productos.find(p => p.id === Number(value));
      if (producto) {
        newProductos[index] = {
          ...newProductos[index],
          productoId: producto.id,
          nombre: producto.nombre,
          precio: producto.precioVenta,
          subtotal: producto.precioVenta * newProductos[index].cantidad
        };
      }
    } else if (field === 'cantidad') {
      const cantidad = parseInt(value) || 1;
      newProductos[index] = {
        ...newProductos[index],
        cantidad,
        subtotal: newProductos[index].precio * cantidad
      };
    }

    setProductosEnPedido(newProductos);
  };

  const calcularTotal = () => {
    return productosEnPedido.reduce((sum, p) => sum + p.subtotal, 0);
  };

  const calcularMontoAbonado = (total: number, porcentaje: number) => {
    return Math.round(total * (porcentaje / 100));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clienteId) {
      toast.error('Seleccione un cliente');
      return;
    }

    if (productosEnPedido.length === 0) {
      toast.error('Debe agregar al menos un producto');
      return;
    }

    if (productosEnPedido.some(p => !p.productoId)) {
      toast.error('Complete todos los productos');
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];
    if (formData.fechaEntrega < hoy) {
      toast.error('La fecha de entrega no puede ser una fecha pasada');
      return;
    }

    if (new Date(formData.fechaEntrega) < new Date(formData.fechaPedido)) {
      toast.error('La fecha de entrega debe ser mayor o igual a la fecha del pedido');
      return;
    }

    if (![50, 100].includes(Number(formData.porcentajeAbono))) {
      toast.error('El porcentaje de abono debe ser 50 o 100');
      return;
    }

    const total = calcularTotal();
    const montoAbonado = calcularMontoAbonado(total, formData.porcentajeAbono);

    const telDigits = String(formData.telefono || '').replace(/\D/g, '');
    if (telDigits.length !== 10) {
      toast.error('Teléfono de contacto', {
        description: 'Ingrese exactamente 10 dígitos del teléfono de contacto.',
      });
      return;
    }

    const productosPedido: PedidoProducto[] = productosEnPedido.map(p => ({
      productoId: p.productoId,
      cantidad: p.cantidad,
      precio: p.precio,
      subtotal: p.subtotal
    }));

    try {
      if (selectedPedido) {
        await api.pedidos.update(selectedPedido.id, {
          clienteId: formData.clienteId,
          productos: productosPedido,
          total,
          metodoPago: formData.metodoPago,
          porcentajeAbono: formData.porcentajeAbono,
          montoAbonado,
          fechaPedido: formData.fechaPedido,
          fechaEntrega: formData.fechaEntrega,
          direccion: formData.direccion,
          telefono: telDigits
        });
        toast.success('Pedido actualizado exitosamente');
      } else {
        await api.pedidos.create({
          clienteId: formData.clienteId,
          productos: productosPedido,
          total,
          metodoPago: formData.metodoPago,
          porcentajeAbono: formData.porcentajeAbono,
          montoAbonado,
          fechaPedido: formData.fechaPedido,
          fechaEntrega: formData.fechaEntrega,
          direccion: formData.direccion,
          telefono: telDigits,
          estado: 'pendiente'
        });
        toast.success('Pedido creado exitosamente');
      }

      setIsModalOpen(false);
      cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar pedido');
    }
  };

  // Filtrar clientes según búsqueda
  const clientesFiltrados = clientes.filter(c => {
    const searchTerm = busquedaCliente.toLowerCase();
    const nombreCompleto = `${c.nombre} ${c.apellido}`.toLowerCase();
    const idStr = String(c.id);
    return nombreCompleto.includes(searchTerm) || idStr.includes(searchTerm) || c.numeroDocumento.includes(searchTerm);
  });

  const seleccionarCliente = (cliente: Cliente) => {
    setFormData({ 
      ...formData, 
      clienteId: cliente.id,
      direccion: cliente.direccion || '',
      telefono: cliente.telefono || ''
    });
    setBusquedaCliente(`${cliente.nombre} ${cliente.apellido}`);
    setMostrarListaClientes(false);
  };

  const pedidosFiltrados = pedidos.filter(pedido => {
    const matchBusqueda = busqueda.length === 0 ||
      busqueda.length >= 2 &&
      (pedido.clienteNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
       String(pedido.id).includes(busqueda));

    const matchEstado = !filtroEstado || pedido.estado === filtroEstado;
    const matchMetodoPago = !filtroMetodoPago || pedido.metodoPago === filtroMetodoPago;
    const matchFecha = !filtroFecha || pedido.fechaPedido === filtroFecha;

    return matchBusqueda && matchEstado && matchMetodoPago && matchFecha;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Pedidos</h2>
          <p className="text-muted-foreground">Administra los pedidos de clientes</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Pedido
        </Button>
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
          <div className="flex gap-2">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por estado</option>
              <option value="pendiente">Pendiente</option>
              <option value="en proceso">En Proceso</option>
              <option value="completado">Completado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select
              value={filtroMetodoPago}
              onChange={(e) => setFiltroMetodoPago(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por metodo de pago</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[150px]"
            />
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroEstado('');
                setFiltroMetodoPago('');
                setFiltroFecha('');
              }}
              className="px-4"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={pedidosFiltrados}
        actions={[
          commonActions.view((pedido) => {
            void handleVerDetallePedido(pedido as PedidoView);
          }),
          commonActions.edit((pedido) => {
            void handleEdit(pedido as PedidoView);
          }),
          commonActions.pdf((pedido) => {
            void handleVerPdfPedido(pedido as PedidoView);
          }),
        ]}
      />

      <MotivoModal
        isOpen={!!pedidoPending && pedidoPending.to === 'cancelado'}
        onClose={() => {
          setPedidoPending(null);
          setMotivoEstado('');
        }}
        title="Cancelar pedido"
        description={
          pedidoPending ? (
            <>
              <p>
                <strong>Pedido:</strong> #
                {String(pedidoPending.pedido.id).padStart(4, '0')}
              </p>
              <p className="text-muted-foreground">
                Estado actual: {pedidoPending.pedido.estado}
              </p>
            </>
          ) : null
        }
        motivo={motivoEstado}
        onMotivoChange={setMotivoEstado}
        onConfirm={confirmPedidoCancelMotivo}
      />

      <AlertDialog
        isOpen={!!pedidoPending && pedidoPending.to === 'completado'}
        onClose={() => {
          setPedidoPending(null);
          setMotivoEstado('');
        }}
        onConfirm={confirmPedidoCompletar}
        title="Marcar pedido como completado"
        description="Esta acción es final. Se creará domicilio automáticamente si aplica. ¿Desea continuar?"
        type="warning"
        confirmText="Completar"
      />

      {/* Modal de formulario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedPedido ? 'Editar Pedido' : 'Nuevo Pedido'}
        size="xl"
      >
        <Form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            {/* Campo de búsqueda de Cliente */}
            <div className="relative">
              <label className="block text-sm font-medium mb-2">Cliente *</label>
              <input
                type="text"
                value={busquedaCliente}
                onChange={(e) => {
                  setBusquedaCliente(e.target.value);
                  setMostrarListaClientes(true);
                }}
                onFocus={() => setMostrarListaClientes(true)}
                placeholder="Escribe ID, nombre o documento del cliente..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              {mostrarListaClientes && busquedaCliente && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {clientesFiltrados.length > 0 ? (
                    clientesFiltrados.map(c => (
                      <div
                        key={c.id}
                        onClick={() => seleccionarCliente(c)}
                        className="px-3 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                      >
                        <div className="font-medium">{c.nombre} {c.apellido}</div>
                        <div className="text-sm text-muted-foreground">ID: {c.id} | {c.tipoDocumento}: {c.numeroDocumento}</div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-muted-foreground text-sm">No se encontraron clientes</div>
                  )}
                </div>
              )}
            </div>

            <FormField
              label="Método de Pago"
              name="metodoPago"
              type="select"
              value={formData.metodoPago}
              onChange={(value) => setFormData({ ...formData, metodoPago: value as 'efectivo' | 'transferencia' })}
              options={[
                { value: 'efectivo', label: 'Efectivo' },
                { value: 'transferencia', label: 'Transferencia' }
              ]}
              required
            />

            <FormField
              label="Dirección de Entrega"
              name="direccion"
              type="text"
              value={formData.direccion}
              onChange={(value) => setFormData({ ...formData, direccion: value as string })}
              placeholder="Editable - se cargó del cliente registrado"
            />

            <FormField
              label="Teléfono de Contacto"
              name="telefono"
              type="text"
              value={formData.telefono}
              onChange={(value) => setFormData({ ...formData, telefono: value as string })}
              placeholder="10 dígitos"
              required
              inputDigitRule="telefono10"
            />

            <div className="col-span-2">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-700">
                  ℹ️ La fecha del pedido se registra automáticamente con la fecha actual del sistema
                </p>
              </div>
            </div>

            <FormField
              label="Fecha Entrega * (solo fechas futuras)"
              name="fechaEntrega"
              type="date"
              value={formData.fechaEntrega}
              onChange={(value) => {
                const fechaEnt = value as string;
                const hoy = new Date().toISOString().split('T')[0];
                if (fechaEnt < hoy) {
                  toast.warning('La fecha de entrega no puede ser una fecha pasada');
                  return;
                }
                if (fechaEnt < formData.fechaPedido) {
                  toast.warning('La fecha de entrega debe ser mayor o igual a la fecha del pedido');
                }
                setFormData({ ...formData, fechaEntrega: fechaEnt });
              }}
              min={new Date().toISOString().split('T')[0]}
              required
            />

            <div className="col-span-2">
              <FormField
                label="Porcentaje de Abono"
                name="porcentajeAbono"
                type="select"
                value={formData.porcentajeAbono}
                onChange={(value) => {
                  const porcentaje = Number(value);
                  setFormData({ ...formData, porcentajeAbono: porcentaje });
                }}
                options={[
                  { value: 50, label: '50%' },
                  { value: 100, label: '100%' }
                ]}
                required
              />
              {formData.porcentajeAbono > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Monto a abonar: {formatCurrency(calcularMontoAbonado(calcularTotal(), formData.porcentajeAbono))}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label>Productos del Pedido *</label>
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
                      <th className="px-4 py-2 text-left w-32">Precio</th>
                      <th className="px-4 py-2 text-left w-32">Subtotal</th>
                      <th className="px-4 py-2 text-center w-20">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosEnPedido.map((producto, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">
                          <select
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            value={producto.productoId}
                            onChange={(e) => handleUpdateProducto(index, 'productoId', e.target.value)}
                            required
                          >
                            <option value={0}>Seleccionar producto...</option>
                            {productos.map(p => (
                              <option key={p.id} value={p.id}>{p.nombre} - {formatCurrency(p.precioVenta)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="1"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            value={producto.cantidad}
                            onChange={(e) => handleUpdateProducto(index, 'cantidad', e.target.value)}
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          {formatCurrency(producto.precio)}
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
                No hay productos agregados. Haz clic en "Agregar Producto".
              </div>
            )}
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              {selectedPedido ? 'Actualizar' : 'Crear'} Pedido
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Pedido"
        size="lg"
      >
        {selectedPedido && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">Pedido #{String(selectedPedido.id).padStart(4, '0')}</h3>
                <p className="text-sm text-muted-foreground">{selectedPedido.clienteNombre}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm ${
                selectedPedido.estado === 'completado' ? 'bg-green-100 text-green-700' :
                selectedPedido.estado === 'en proceso' ? 'bg-blue-100 text-blue-700' :
                selectedPedido.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {selectedPedido.estado === 'completado' ? 'Completado' :
                 selectedPedido.estado === 'en proceso' ? 'En Proceso' :
                 selectedPedido.estado === 'pendiente' ? 'Pendiente' : 'Cancelado'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Cliente</label>
                <p className="mt-1">{selectedPedido.clienteNombre}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Método de Pago</label>
                <p className="mt-1 capitalize">{selectedPedido.metodoPago}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Dirección de Entrega</label>
                <p className="mt-1">{selectedPedido.direccion || 'No especificada'}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Teléfono de Contacto</label>
                <p className="mt-1">{selectedPedido.telefono || 'No especificado'}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Total</label>
                <p className="mt-1">{formatCurrency(selectedPedido.total)}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Abono</label>
                <p className="mt-1">{selectedPedido.porcentajeAbono}% ({formatCurrency(selectedPedido.montoAbonado)})</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Saldo Pendiente</label>
                <p className="mt-1">{formatCurrency(selectedPedido.total - selectedPedido.montoAbonado)}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha Pedido</label>
                <p className="mt-1">{selectedPedido.fechaPedido}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha Entrega</label>
                <p className="mt-1">{selectedPedido.fechaEntrega}</p>
              </div>
            </div>

            <div className="p-4 bg-accent/50 rounded-lg">
              <label className="text-sm text-muted-foreground block mb-3 font-medium">Productos</label>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-accent/50">
                    <tr>
                      <th className="text-left p-2">Producto</th>
                      <th className="text-right p-2">Cantidad</th>
                      <th className="text-right p-2">Precio Unit.</th>
                      <th className="text-right p-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPedido.productos.map((producto, index) => {
                      const prod = productos.find((p) => p.id === producto.productoId);
                      return (
                        <tr key={index} className="border-t">
                          <td className="p-2">{producto.nombre || prod?.nombre || 'Producto desconocido'}</td>
                          <td className="text-right p-2">{producto.cantidad}</td>
                          <td className="text-right p-2">{formatCurrency(producto.precio)}</td>
                          <td className="text-right p-2">{formatCurrency(producto.subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

