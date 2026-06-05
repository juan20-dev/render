import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions, openPrintablePdf } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions, FieldError } from '../../Form';
import { Button } from '../../Button';
import { Plus, Trash2, Minus, Search, ShoppingCart, Package, X } from 'lucide-react';
import { api } from '../../../services/api';
import { settledValue } from '../../../services/routePermissions';
import { formatEntityCode } from '../../../services/mappers';
import { toast } from '../../AlertDialog';
import type { Venta, Cliente, Producto, Pedido, PedidoProducto } from '../../../services/types';
import { AlertDialog } from '../../AlertDialog';

const esProductoPreparacion = (producto?: Producto | null) => {
  const tipo = String(producto?.typo || '').toLowerCase().replace(/[\s-]+/g, '_');
  return tipo === 'de_preparacion' || tipo === 'preparacion' || tipo.includes('prepar');
};

interface VentaView extends Venta {
  clienteNombre?: string;
  pedidoNumero?: string;
}

interface ProductoEnForm {
  productoId: number;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export function Ventas() {
  const [ventas, setVentas] = useState<VentaView[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<VentaView | null>(null);
  const [ventaEstadoPendiente, setVentaEstadoPendiente] = useState<{
    venta: VentaView;
    to: Venta['estado'];
  } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [filtroMetodoPago, setFiltroMetodoPago] = useState<string>('');
  const [productosEnVenta, setProductosEnVenta] = useState<ProductoEnForm[]>([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [busquedaPedido, setBusquedaPedido] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [mostrarListaClientes, setMostrarListaClientes] = useState(false);
  const [mostrarListaPedidos, setMostrarListaPedidos] = useState(false);
  const [mostrarListaProductos, setMostrarListaProductos] = useState(false);
  const [mostrarNotaVenta, setMostrarNotaVenta] = useState(true);
  const [isSubmittingVenta, setIsSubmittingVenta] = useState(false);
  const [formData, setFormData] = useState({
    tipo: 'directa' as 'directa' | 'por pedido',
    clienteId: 0,
    pedidoId: undefined as number | undefined,
    metodoPago: 'efectivo' as 'efectivo' | 'transferencia',
    fecha: new Date().toISOString().split('T')[0]
  });

  // Validar stock en tiempo real
  const validarStockProducto = (productoId: number, cantidad: number): { valido: boolean; stockDisponible: number; stockRestante: number } => {
    const producto = productos.find(p => Number(p.id) === Number(productoId));
    if (!producto) return { valido: false, stockDisponible: 0, stockRestante: 0 };

    if (esProductoPreparacion(producto)) {
      return { valido: cantidad > 0, stockDisponible: 0, stockRestante: 0 };
    }

    const stockDisponible = Number(producto.stock ?? 0);
    const stockRestante = stockDisponible - cantidad;
    const valido = cantidad <= stockDisponible && cantidad > 0;

    return { valido, stockDisponible, stockRestante };
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Cerrar listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.venta-cliente-picker')) {
        setMostrarListaClientes(false);
      }
      if (!target.closest('.venta-pedido-picker')) {
        setMostrarListaPedidos(false);
      }
      if (!target.closest('.venta-producto-picker')) {
        setMostrarListaProductos(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  const cargarDatos = async () => {
    try {
      const [ventasR, clientesR, productosR, pedidosR] = await Promise.allSettled([
        api.ventas.getAll(),
        api.clientes.getAll(),
        api.productos.getAll(),
        api.pedidos.getAll(),
      ]);

      if (ventasR.status === 'rejected') {
        console.error('[Ventas] Error al cargar ventas:', ventasR.reason);
        toast.error('Error al cargar datos', {
          description:
            ventasR.reason instanceof Error ? ventasR.reason.message : 'No autorizado o error de red',
        });
        return;
      }

      const ventasData = ventasR.value;
      const clientesData = settledValue(clientesR, [] as Cliente[], 'clientes');
      const productosData = settledValue(productosR, [] as Producto[], 'productos');
      const pedidosData = settledValue(pedidosR, [] as Pedido[], 'pedidos');

      setClientes(clientesData.filter(c => c.estado === 'activo'));
      setProductos(productosData.filter((p) => p.estado === 'activo' && p.typo !== 'insumo'));
      // Solo exponer pedidos completados que ademas no tengan ya una venta no-cancelada.
      // Asi, una vez el pedido se asigna a una "venta por pedido", deja de aparecer
      // en el listado del campo "Pedido *" del formulario de nueva venta.
      const pedidosConVenta = new Set(
        ventasData
          .filter((v) => v.pedidoId != null && v.estado !== 'cancelada')
          .map((v) => Number(v.pedidoId))
      );
      setPedidos(
        pedidosData.filter(
          (p) => p.estado === 'completado' && !pedidosConVenta.has(Number(p.id))
        )
      );

      const ventasConInfo = ventasData.map(venta => {
        const cliente = clientesData.find(c => c.id === venta.clienteId);
        const pedido = venta.pedidoId ? pedidosData.find(p => p.id === venta.pedidoId) : null;
        return {
          ...venta,
          clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido',
          pedidoNumero: pedido ? formatEntityCode('P', pedido.id) : undefined
        };
      });

      setVentas(ventasConInfo);
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

  const opcionesEstadoVenta = (row: VentaView): { v: Venta['estado']; l: string }[] => {
    if (row.estado === 'pendiente') {
      return [
        { v: 'pendiente', l: 'Pendiente' },
        { v: 'completada', l: 'Completada' },
        { v: 'cancelada', l: 'Cancelada' }
      ];
    }
    const label =
      row.estado === 'completada' ? 'Completada' : row.estado === 'cancelada' ? 'Cancelada' : 'Pendiente';
    return [{ v: row.estado, l: label }];
  };

  const handleVentaEstadoSelect = (row: VentaView, to: Venta['estado']) => {
    if (row.estado === to) return;
    if (row.estado !== 'pendiente') {
      toast.error('La venta ya está en estado final y no puede modificarse');
      return;
    }
    setVentaEstadoPendiente({ venta: row, to });
  };

  /**
   * Abre vista PDF imprimible con el detalle completo de una venta. Incluye boton
   * "Descargar PDF" en la propia ventana (window.print del navegador).
   */
  const handleVerPdfVenta = (venta: VentaView) => {
    const cliente = clientes.find((c) => c.id === venta.clienteId);
    const opened = openPrintablePdf({
      title: `Venta ${formatEntityCode('V', venta.id)}`,
      subtitle: `Generado el ${new Date().toLocaleString('es-CO')}`,
      sections: [
        {
          title: 'Datos generales',
          rows: [
            { label: 'Tipo', value: venta.tipo === 'directa' ? 'Directa' : 'Por pedido' },
            {
              label: 'Cliente',
              value: cliente ? `${cliente.nombre} ${cliente.apellido}` : `ID ${venta.clienteId}`,
            },
            ...(venta.pedidoNumero
              ? [{ label: 'Pedido asociado', value: venta.pedidoNumero }]
              : []),
            { label: 'Fecha', value: venta.fecha },
            { label: 'Método de pago', value: venta.metodoPago },
            {
              label: 'Estado',
              value: venta.estado.charAt(0).toUpperCase() + venta.estado.slice(1),
            },
          ],
        },
        {
          title: 'Productos',
          table: {
            headers: ['Producto', 'Cantidad', 'Precio unit.', 'Subtotal'],
            rows: venta.productos.map((p) => {
              const prod = productos.find((x) => x.id === p.productoId);
              return [
                prod?.nombre || `Producto ${p.productoId}`,
                p.cantidad,
                formatCurrency(p.precio),
                formatCurrency(p.subtotal),
              ];
            }),
          },
        },
        {
          title: 'Totales',
          rows: [{ label: 'Total', value: formatCurrency(venta.total) }],
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

  const confirmarCambioEstadoVenta = async () => {
    const p = ventaEstadoPendiente;
    if (!p) return;
    try {
      await api.ventas.changeEstado(p.venta.id, p.to);
      toast.success('Estado de venta actualizado');
      await cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar estado');
      await cargarDatos();
    }
  };

  const columns: Column[] = [
    {
      key: 'id',
      label: 'ID Venta',
      render: (value: number) => formatEntityCode('V', value)
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (tipo: string) => (
        <span className={`px-3 py-1 rounded-full text-xs ${
          tipo === 'directa' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'
        }`}>
          {tipo === 'directa' ? 'Directa' : 'Por Pedido'}
        </span>
      )
    },
    {
      key: 'clienteNombre',
      label: 'Cliente'
    },
    {
      key: 'fecha',
      label: 'Fecha'
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
      key: 'total',
      label: 'Total',
      render: (total: number) => formatCurrency(total)
    },
    {
      key: 'metodoPago',
      label: 'Método Pago',
      render: (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: string, row: VentaView) => {
        const opts = opcionesEstadoVenta(row);
        const locked = opts.length === 1;
        const bg =
          row.estado === 'completada'
            ? '#dcfce7'
            : row.estado === 'cancelada'
              ? '#fee2e2'
              : '#fef9c3';
        const fg =
          row.estado === 'completada'
            ? '#166534'
            : row.estado === 'cancelada'
              ? '#991b1b'
              : '#854d0e';
        return (
          <select
            value={row.estado}
            onChange={(e) => handleVentaEstadoSelect(row, e.target.value as Venta['estado'])}
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

  const handleAdd = async () => {
    setFormData({
      tipo: 'directa',
      clienteId: 0,
      pedidoId: undefined,
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0]
    });
    setProductosEnVenta([]);
    setBusquedaCliente('');
    setBusquedaPedido('');
    setBusquedaProducto('');
    setMostrarListaClientes(false);
    setMostrarListaPedidos(false);
    setMostrarListaProductos(false);
    setMostrarNotaVenta(true);
    try {
      const productosData = await api.productos.getAll();
      setProductos(productosData.filter((p) => p.estado === 'activo' && p.typo !== 'insumo'));
    } catch {
      /* si falla el refetch, se siguen usando los productos ya cargados */
    }
    setIsModalOpen(true);
  };

  const handleEliminarProducto = (index: number) => {
    setProductosEnVenta(productosEnVenta.filter((_, i) => i !== index));
  };

  const handleUpdateProducto = (index: number, field: keyof ProductoEnForm, value: any) => {
    const newProductos = [...productosEnVenta];

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

    setProductosEnVenta(newProductos);
  };

  const calcularTotal = () => {
    return productosEnVenta.reduce((sum, p) => sum + p.subtotal, 0);
  };

  const cargarProductosDePedido = async (pedidoId: number) => {
    try {
      // getAll() solo trae un contador de ítems, no el detalle; hay que pedir el pedido completo.
      const pedido = await api.pedidos.getById(pedidoId);
      const productosForm: ProductoEnForm[] = pedido.productos.map((p) => {
        const producto = productos.find((prod) => prod.id === p.productoId);
        return {
          productoId: p.productoId,
          nombre: producto?.nombre || p.nombre || 'Desconocido',
          cantidad: p.cantidad,
          precio: p.precio,
          subtotal: p.subtotal,
        };
      });
      setProductosEnVenta(productosForm);
      setFormData((prev) => ({
        ...prev,
        clienteId: pedido.clienteId,
        metodoPago: 'transferencia',
      }));
    } catch {
      toast.error('No se pudieron cargar los productos del pedido');
      setProductosEnVenta([]);
    }
  };

  // Filtrar clientes según búsqueda
  const clientesFiltrados = clientes.filter(c => {
    const searchTerm = busquedaCliente.toLowerCase();
    const nombreCompleto = `${c.nombre} ${c.apellido}`.toLowerCase();
    const idStr = String(c.id);
    return nombreCompleto.includes(searchTerm) || idStr.includes(searchTerm) || c.numeroDocumento.includes(searchTerm);
  });

  // Filtrar pedidos según búsqueda
  const pedidosFiltrados = pedidos.filter(p => {
    const searchTerm = busquedaPedido.toLowerCase();
    const cliente = clientes.find(c => c.id === p.clienteId);
    const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}`.toLowerCase() : '';
    const idStr = String(p.id);
    return idStr.includes(searchTerm) || nombreCliente.includes(searchTerm);
  });

  // Filtrar productos según búsqueda (si no hay búsqueda, mostrar todos)
  const productosFiltrados = busquedaProducto.trim() === ''
    ? productos
    : productos.filter(p => {
        const searchTerm = busquedaProducto.toLowerCase();
        const nombre = p.nombre.toLowerCase();
        const idStr = String(p.id);
        return nombre.includes(searchTerm) || idStr.includes(searchTerm);
      });

  const seleccionarCliente = (cliente: Cliente) => {
    setFormData({ ...formData, clienteId: cliente.id });
    setBusquedaCliente(`${cliente.nombre} ${cliente.apellido}`);
    setMostrarListaClientes(false);
  };

  const seleccionarPedido = (pedido: Pedido) => {
    setFormData((prev) => ({ ...prev, pedidoId: pedido.id }));
    const cliente = clientes.find(c => c.id === pedido.clienteId);
    setBusquedaPedido(`${formatEntityCode('P', pedido.id)} - ${cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'}`);
    setMostrarListaPedidos(false);
    void cargarProductosDePedido(pedido.id);
  };

  const agregarProductoDesdeBusqueda = (producto: Producto) => {
    // Verificar si el producto ya está en la lista
    const productoExistente = productosEnVenta.find(p => Number(p.productoId) === Number(producto.id));

    if (productoExistente) {
      // Si ya existe, aumentar cantidad
      const nuevosProductos = productosEnVenta.map(p =>
        Number(p.productoId) === Number(producto.id)
          ? { ...p, cantidad: p.cantidad + 1, subtotal: p.precio * (p.cantidad + 1) }
          : p
      );
      setProductosEnVenta(nuevosProductos);
      toast.success(`Cantidad aumentada: ${producto.nombre}`);
    } else {
      // Si no existe, agregarlo nuevo
      const nuevoProducto: ProductoEnForm = {
        productoId: producto.id,
        nombre: producto.nombre,
        cantidad: 1,
        precio: producto.precioVenta,
        subtotal: producto.precioVenta
      };
      setProductosEnVenta([...productosEnVenta, nuevoProducto]);
      toast.success(`Producto agregado: ${producto.nombre}`);
    }

    setBusquedaProducto('');
    setMostrarListaProductos(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingVenta) return;

    // En venta directa el cliente es obligatorio. En venta por pedido el cliente
    // se hereda automaticamente del pedido seleccionado (no se pide en el form).
    if (formData.tipo === 'directa' && !formData.clienteId) {
      toast.error('Seleccione un cliente');
      return;
    }

    if (!String(formData.fecha || '').trim()) {
      toast.error('Seleccione la fecha de la venta');
      return;
    }

    if (formData.tipo === 'por pedido' && !formData.pedidoId) {
      toast.error('Seleccione un pedido');
      return;
    }

    if (formData.tipo === 'por pedido' && !formData.clienteId) {
      toast.error('El pedido seleccionado no tiene un cliente válido. Elija otro pedido.');
      return;
    }

    if (formData.tipo === 'por pedido' && productosEnVenta.length === 0) {
      toast.error('Espere a cargar los productos del pedido o elija otro pedido');
      return;
    }

    if (formData.tipo === 'directa' && productosEnVenta.length === 0) {
      toast.error('Debe agregar al menos un producto');
      return;
    }

    if (productosEnVenta.some(p => !p.productoId)) {
      toast.error('Complete todos los productos');
      return;
    }

    for (const p of productosEnVenta) {
      const productoCatalogo = productos.find((prod) => Number(prod.id) === Number(p.productoId));
      if (esProductoPreparacion(productoCatalogo)) continue;
      const v = validarStockProducto(p.productoId, p.cantidad);
      if (!v.valido) {
        toast.error(
          `Stock insuficiente para "${p.nombre}". Disponible: ${v.stockDisponible}, solicitado: ${p.cantidad}.`
        );
        return;
      }
    }

    const total = calcularTotal();
    if (total > 100_000_000) {
      toast.error('Total de venta demasiado alto', {
        description:
          'El total no puede superar $100.000.000 COP. Reduzca cantidades o precios de los productos.',
      });
      return;
    }
    const productosVenta: PedidoProducto[] = productosEnVenta.map(p => ({
      productoId: p.productoId,
      cantidad: p.cantidad,
      precio: p.precio,
      subtotal: p.subtotal
    }));

    try {
      setIsSubmittingVenta(true);
      const ventaCreada = await api.ventas.create({
        tipo: formData.tipo,
        clienteId: formData.clienteId,
        pedidoId: formData.pedidoId,
        productos: productosVenta,
        total,
        metodoPago: formData.tipo === 'por pedido' ? 'transferencia' : formData.metodoPago,
        fecha: formData.fecha,
        estado: formData.tipo === 'directa' ? 'completada' : 'pendiente'
      });

      const ventaId = ventaCreada?.id;
      toast.success('Venta registrada exitosamente', {
        description: `Venta ${formatEntityCode('V', ventaId)} registrada por ${formatCurrency(total)}. Stock actualizado.`
      });
      setIsModalOpen(false);
      cargarDatos();
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : String(error ?? '');
      const msg =
        /total|999999|100\.?000\.?000|validaci[oó]n|superar|monto/i.test(raw)
          ? 'El total de la venta supera el máximo permitido ($100.000.000 COP). Revise cantidades y precios.'
          : raw || 'Error al crear venta';
      toast.error('No se pudo registrar la venta', { description: msg });
      if (import.meta.env.DEV) {
        console.error('Error al crear venta', error);
      }
    } finally {
      setIsSubmittingVenta(false);
    }
  };

  const ventasFiltradas = ventas.filter(venta => {
    const matchBusqueda = busqueda.length === 0 ||
      busqueda.length >= 2 &&
      (venta.clienteNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
       String(venta.id).includes(busqueda));

    const matchTipo = !filtroTipo || venta.tipo === filtroTipo;
    const matchEstado = !filtroEstado || venta.estado === filtroEstado;
    const matchFecha = !filtroFecha || venta.fecha === filtroFecha;
    const matchMetodoPago = !filtroMetodoPago || venta.metodoPago === filtroMetodoPago;

    return matchBusqueda && matchTipo && matchEstado && matchFecha && matchMetodoPago;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Ventas</h2>
          <p className="text-muted-foreground">Registra las ventas realizadas</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nueva Venta
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-border p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar ..."
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por tipo de venta</option>
              <option value="directa">Directa</option>
              <option value="por pedido">Por Pedido</option>
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por estado</option>
              <option value="pendiente">Pendiente</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[150px]"
            />
            <select
              value={filtroMetodoPago}
              onChange={(e) => setFiltroMetodoPago(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por metodo de pago</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroTipo('');
                setFiltroEstado('');
                setFiltroFecha('');
                setFiltroMetodoPago('');
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
        data={ventasFiltradas}
        actions={[
          commonActions.view((venta) => {
            setSelectedVenta(venta);
            setIsDetailModalOpen(true);
          }),
          commonActions.pdf((venta) => handleVerPdfVenta(venta as VentaView)),
        ]}
      />

      <AlertDialog
        isOpen={!!ventaEstadoPendiente}
        onClose={() => {
          setVentaEstadoPendiente(null);
        }}
        onConfirm={confirmarCambioEstadoVenta}
        title={
          ventaEstadoPendiente?.to === 'completada'
            ? 'Completar venta'
            : 'Cancelar venta'
        }
        description={
          ventaEstadoPendiente?.to === 'completada'
            ? '¿Confirma completar esta venta? El estado pasará a Completada y no podrá modificarse después.'
            : '¿Confirma cancelar esta venta? El estado pasará a Cancelada y no podrá modificarse después.'
        }
        type="warning"
        confirmText={ventaEstadoPendiente?.to === 'completada' ? 'Completar' : 'Cancelar venta'}
      />

      {/* Modal de formulario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Venta"
        size="xl"
      >
        <Form onSubmit={handleSubmit} noValidate>
          {mostrarNotaVenta ? (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-blue-700">
                  <strong>Nota:</strong> Las ventas directas descuentan stock inmediatamente. Las ventas por pedido descuentan stock al completar el pedido.
                </p>
                <button
                  type="button"
                  onClick={() => setMostrarNotaVenta(false)}
                  className="rounded-md p-1 text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-900"
                  aria-label="Cerrar nota informativa"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Tipo de Venta"
              name="tipo"
              type="select"
              value={formData.tipo}
              onChange={(value) => {
                const nuevoTipo = value as 'directa' | 'por pedido';
                setFormData({
                  ...formData,
                  tipo: nuevoTipo,
                  pedidoId: undefined,
                  metodoPago: nuevoTipo === 'por pedido' ? 'transferencia' : formData.metodoPago,
                  // Al cambiar de tipo el cliente se recalcula: en directa se vuelve a elegir,
                  // en por pedido se infiere automaticamente al elegir el pedido.
                  clienteId: 0,
                });
                setProductosEnVenta([]);
                setBusquedaCliente('');
                setBusquedaPedido('');
                setMostrarListaClientes(false);
                setMostrarListaPedidos(false);
              }}
              options={[
                { value: 'directa', label: 'Venta Directa' },
                { value: 'por pedido', label: 'Venta por Pedido' }
              ]}
              required
            />

            {/* Campo Cliente: solo visible para venta directa.
                En venta por pedido el cliente se infiere del pedido seleccionado. */}
            {formData.tipo === 'directa' && (
              <div className="relative venta-cliente-picker">
                <label className="block text-sm font-medium mb-2">Cliente *</label>
                <input
                  type="text"
                  value={busquedaCliente}
                  onChange={(e) => {
                    setBusquedaCliente(e.target.value);
                    setMostrarListaClientes(true);
                  }}
                  onFocus={() => setMostrarListaClientes(true)}
                  placeholder="Escribe nombre, ID o documento del cliente..."
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={60}
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
            )}

            {formData.tipo === 'por pedido' && (
              <div className="col-span-2 relative venta-pedido-picker">
                <label className="block text-sm font-medium mb-2">Pedido *</label>
                <input
                  type="text"
                  value={busquedaPedido}
                  onChange={(e) => {
                    setBusquedaPedido(e.target.value);
                    setMostrarListaPedidos(true);
                  }}
                  onFocus={() => setMostrarListaPedidos(true)}
                  placeholder="Escribe ID del pedido o nombre del cliente..."
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={60}
                  required
                />
                {mostrarListaPedidos && busquedaPedido && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {pedidosFiltrados.length > 0 ? (
                      pedidosFiltrados.map(p => {
                        const cliente = clientes.find(c => c.id === p.clienteId);
                        return (
                          <div
                            key={p.id}
                            onClick={() => seleccionarPedido(p)}
                            className="px-3 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                          >
                            <div className="font-medium">Pedido {formatEntityCode('P', p.id)}</div>
                            <div className="text-sm text-muted-foreground">
                              Cliente: {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'} | Total: {formatCurrency(p.total)}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2 text-muted-foreground text-sm">No se encontraron pedidos</div>
                    )}
                  </div>
                )}
                {formData.pedidoId && formData.clienteId > 0 && (() => {
                  const cli = clientes.find((c) => c.id === formData.clienteId);
                  return cli ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Cliente del pedido: <strong>{cli.nombre} {cli.apellido}</strong> (se asigna automáticamente).
                    </p>
                  ) : null;
                })()}
              </div>
            )}

            {formData.tipo === 'directa' ? (
              <FormField
                label="Método de Pago"
                name="metodoPago"
                type="select"
                value={formData.metodoPago}
                onChange={(value) =>
                  setFormData({ ...formData, metodoPago: value as 'efectivo' | 'transferencia' })
                }
                options={[
                  { value: 'efectivo', label: 'Efectivo' },
                  { value: 'transferencia', label: 'Transferencia' },
                ]}
                required
              />
            ) : (
              <input type="hidden" name="metodoPago" value="transferencia" />
            )}

            <FormField
              label="Fecha"
              name="fecha"
              type="date"
              value={formData.fecha}
              onChange={(value) => setFormData({ ...formData, fecha: value as string })}
              required
            />
          </div>

          {formData.tipo === 'directa' && (
            <div className="space-y-4">
              {/* Buscador de productos */}
              <div className="relative venta-producto-picker">
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Agregar Productos *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={busquedaProducto}
                    onChange={(e) => {
                      setBusquedaProducto(e.target.value);
                      setMostrarListaProductos(true);
                    }}
                    onFocus={() => setMostrarListaProductos(true)}
                    placeholder="Busca por nombre o ID, o haz clic para ver todos los productos..."
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base"
                    maxLength={60}
                  />
                </div>
                {mostrarListaProductos && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {productosFiltrados.length > 0 ? (
                      <>
                        {/* Encabezado con contador */}
                        <div className="bg-primary/10 px-4 py-2 border-b border-border font-medium text-sm">
                          {busquedaProducto.trim() === ''
                            ? `Todos los productos (${productosFiltrados.length})`
                            : `${productosFiltrados.length} producto(s) encontrado(s)`
                          }
                        </div>

                        {productosFiltrados.map(p => {
                          const esPrep = esProductoPreparacion(p);
                          const stockDisponible = Number(p.stock ?? 0);
                          const enVenta = productosEnVenta.find(pv => Number(pv.productoId) === Number(p.id));
                          const cantidadEnVenta = enVenta ? enVenta.cantidad : 0;
                          const stockRestante = esPrep ? 1 : stockDisponible - cantidadEnVenta;
                          const puedeAgregar = esPrep || stockRestante > 0;

                          return (
                            <div
                              key={p.id}
                              onClick={() => (puedeAgregar ? agregarProductoDesdeBusqueda(p) : null)}
                              className={`px-4 py-3 border-b border-border last:border-b-0 ${
                                puedeAgregar
                                  ? 'hover:bg-accent cursor-pointer'
                                  : 'bg-gray-50 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <Package className="w-4 h-4 text-primary" />
                                    <span className="font-medium">{p.nombre}</span>
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    {esPrep ? (
                                      <>
                                        ID: {p.id} | Precio: {formatCurrency(p.precioVenta)}
                                        {cantidadEnVenta > 0 && (
                                          <span className="ml-2 text-blue-600">({cantidadEnVenta} en esta venta)</span>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        ID: {p.id} | Precio: {formatCurrency(p.precioVenta)} |
                                        Stock: <span className={stockRestante <= 5 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                          {stockRestante} disponibles
                                        </span>
                                        {cantidadEnVenta > 0 && (
                                          <span className="ml-2 text-blue-600">({cantidadEnVenta} en esta venta)</span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                                {puedeAgregar && (
                                  <Plus className="w-5 h-5 text-primary" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <div className="px-4 py-3 text-muted-foreground text-sm text-center">No se encontraron productos</div>
                    )}
                  </div>
                )}
              </div>

              {/* Lista de productos agregados */}
              {productosEnVenta.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Productos agregados ({productosEnVenta.length})
                  </label>
                  {productosEnVenta.map((producto, index) => {
                    const productoData = productos.find(p => Number(p.id) === Number(producto.productoId));
                    const esPrep = esProductoPreparacion(productoData);
                    const stockDisponible = Number(productoData?.stock ?? 0);
                    const maxCantidad = esPrep ? 9999 : Math.max(stockDisponible, producto.cantidad, 1);
                    const validacionStock = validarStockProducto(producto.productoId, producto.cantidad);
                    const stockBajo = !esPrep && validacionStock.stockRestante <= 5 && validacionStock.stockRestante >= 0;

                    return (
                      <div key={index} className="bg-accent/30 border border-border rounded-lg p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Package className="w-4 h-4 text-primary" />
                              <h4 className="font-medium">{producto.nombre}</h4>
                            </div>
                            <div className="text-sm text-muted-foreground mb-2">
                              Precio unitario: {formatCurrency(producto.precio)}
                              {!esPrep && ` | Stock disponible: ${maxCantidad}`}
                            </div>

                            {/* Validación visual de stock */}
                            {!esPrep && !validacionStock.valido && (
                              <div className="mt-2">
                                <FieldError>
                                  La cantidad excede el stock disponible ({maxCantidad} unidades).
                                </FieldError>
                              </div>
                            )}
                            {!esPrep && validacionStock.valido && validacionStock.stockRestante === 0 && (
                              <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                                <p className="text-xs text-yellow-700">
                                  <strong>⚠️ Advertencia:</strong> Esta venta agotará el stock de este producto.
                                </p>
                              </div>
                            )}
                            {!esPrep && validacionStock.valido && stockBajo && validacionStock.stockRestante > 0 && (
                              <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                                <p className="text-xs text-yellow-700">
                                  <strong>⚠️ Advertencia:</strong> Este producto tiene stock bajo. Quedarán {validacionStock.stockRestante} unidades disponibles.
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Controles de cantidad */}
                            <div className="flex items-center gap-2 bg-white border border-border rounded-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  if (producto.cantidad > 1) {
                                    handleUpdateProducto(index, 'cantidad', String(producto.cantidad - 1));
                                  }
                                }}
                                className="p-2 hover:bg-accent rounded-l-lg disabled:opacity-50"
                                disabled={producto.cantidad <= 1}
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={maxCantidad}
                                className="w-16 text-center border-0 focus:outline-none"
                                value={producto.cantidad}
                                onChange={(e) => {
                                  const valor = parseInt(e.target.value) || 1;
                                  const cantidadFinal = Math.min(Math.max(valor, 1), maxCantidad);
                                  handleUpdateProducto(index, 'cantidad', String(cantidadFinal));
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (producto.cantidad < maxCantidad) {
                                    handleUpdateProducto(index, 'cantidad', String(producto.cantidad + 1));
                                  }
                                }}
                                className="p-2 hover:bg-accent rounded-r-lg disabled:opacity-50"
                                disabled={producto.cantidad >= maxCantidad}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Subtotal */}
                            <div className="text-right min-w-[100px]">
                              <div className="text-xs text-muted-foreground">Subtotal</div>
                              <div className="font-semibold text-lg">{formatCurrency(producto.subtotal)}</div>
                            </div>

                            {/* Botón eliminar */}
                            <button
                              type="button"
                              onClick={() => handleEliminarProducto(index)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Total de la venta */}
                  <div className="bg-primary/10 border-2 border-primary rounded-lg p-4 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium">Total de la venta:</span>
                      <span className="text-2xl font-bold text-primary">{formatCurrency(calcularTotal())}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center border-2 border-dashed rounded-lg text-muted-foreground bg-accent/20">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No hay productos agregados</p>
                  <p className="text-sm mt-1">Busca y selecciona productos arriba para agregarlos a la venta</p>
                </div>
              )}
            </div>
          )}

          {formData.tipo === 'por pedido' && formData.pedidoId && (
            <div className="p-4 bg-accent/50 rounded-lg">
              <label className="text-sm text-muted-foreground block mb-3 font-medium">Productos del Pedido</label>
              <div className="space-y-2">
                {productosEnVenta.map((producto, index) => (
                  <div key={index} className="flex justify-between p-2 bg-background rounded border text-sm">
                    <span>{producto.nombre} x{producto.cantidad}</span>
                    <span className="font-medium">{formatCurrency(producto.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between p-2 bg-background rounded border text-sm font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(calcularTotal())}</span>
                </div>
              </div>
            </div>
          )}

          <FormActions>
            <Button variant="outline" disabled={isSubmittingVenta} onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmittingVenta}>
              {isSubmittingVenta ? 'Guardando...' : 'Crear Venta'}
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Venta"
        size="lg"
      >
        {selectedVenta && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">Venta {formatEntityCode('V', selectedVenta.id)}</h3>
                <p className="text-sm text-muted-foreground">{selectedVenta.clienteNombre}</p>
              </div>
              <div className="flex gap-2">
                <span className={`px-4 py-2 rounded-full text-sm ${
                  selectedVenta.tipo === 'directa' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'
                }`}>
                  {selectedVenta.tipo === 'directa' ? 'Directa' : 'Por Pedido'}
                </span>
                <span
                  className={`px-4 py-2 rounded-full text-sm ${
                    selectedVenta.estado === 'completada'
                      ? 'bg-green-100 text-green-700'
                      : selectedVenta.estado === 'cancelada'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {selectedVenta.estado === 'completada'
                    ? 'Completada'
                    : selectedVenta.estado === 'cancelada'
                      ? 'Cancelada'
                      : 'Pendiente'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Cliente</label>
                <p className="mt-1">{selectedVenta.clienteNombre}</p>
              </div>
              {selectedVenta.pedidoNumero && (
                <div>
                  <label className="text-sm text-muted-foreground">Pedido</label>
                  <p className="mt-1">{selectedVenta.pedidoNumero}</p>
                </div>
              )}
              <div>
                <label className="text-sm text-muted-foreground">Método de Pago</label>
                <p className="mt-1 capitalize">{selectedVenta.metodoPago}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha</label>
                <p className="mt-1">{selectedVenta.fecha}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Total</label>
                <p className="mt-1 font-semibold text-lg">{formatCurrency(selectedVenta.total)}</p>
              </div>
            </div>

            <div className="p-4 bg-accent/50 rounded-lg">
              <label className="text-sm text-muted-foreground block mb-3 font-medium">Productos</label>
              <div className="space-y-2">
                {selectedVenta.productos.map((producto, index) => {
                  const prod = productos.find(p => Number(p.id) === Number(producto.productoId));
                  return (
                    <div key={index} className="flex justify-between p-2 bg-background rounded border text-sm">
                      <span>{prod?.nombre || 'Desconocido'} x{producto.cantidad}</span>
                      <span className="font-medium">{formatCurrency(producto.subtotal)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

