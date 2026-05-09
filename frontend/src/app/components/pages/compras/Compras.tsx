import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions, openPrintablePdf } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Eye, Trash2, Package, Search, ShoppingCart } from 'lucide-react';
import { api } from '../../../services/api';
import type { Compra, Producto, Proveedor, CompraProducto } from '../../../services/types';
import { toast } from '../../AlertDialog';
import { AlertDialog } from '../../AlertDialog';

export function Compras() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEstadoModalOpen, setIsEstadoModalOpen] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState<'pendiente' | 'recibida' | 'cancelada'>('pendiente');
  const [compraRecibidaPendiente, setCompraRecibidaPendiente] = useState<Compra | null>(null);

  const [formData, setFormData] = useState({
    proveedorId: 0,
    fecha: '',
    productos: [] as CompraProducto[]
  });

  const [productoActual, setProductoActual] = useState({
    productoId: 0,
    cantidad: 0,
    precioCompra: 0,
    ganancia: 0
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todos');
  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const [mostrarListaProveedores, setMostrarListaProveedores] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [mostrarListaProductos, setMostrarListaProductos] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  // Cerrar listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setMostrarListaProveedores(false);
        setMostrarListaProductos(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const productosFiltrados = (() => {
    const term = busquedaProducto.trim().toLowerCase();
    if (term === '') return productos;
    return productos.filter((p) => {
      const nombre = String(p.nombre || '').toLowerCase();
      const id = String(p.id);
      return nombre.includes(term) || id.includes(term);
    });
  })();

  const seleccionarProductoCompra = (producto: Producto) => {
    setProductoActual({ ...productoActual, productoId: producto.id });
    setBusquedaProducto(`${producto.nombre} (ID: ${producto.id})`);
    setMostrarListaProductos(false);
  };

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [comprasData, productosData, proveedoresData] = await Promise.all([
        api.compras.getAll(),
        api.productos.getAll(),
        api.proveedores.getAll()
      ]);
      setCompras(comprasData);
      setProductos(productosData.filter(p => p.estado === 'activo'));
      setProveedores(proveedoresData.filter(p => p.estado === 'activo'));
    } catch (error: any) {
      toast.error('Error al cargar datos', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  // Filtrar proveedores según búsqueda
  const proveedoresFiltrados = proveedores.filter(p => {
    const searchTerm = busquedaProveedor.toLowerCase();
    const idStr = String(p.id);
    const nombre = p.nombreRazonSocial.toLowerCase();
    const nit = p.nit ? p.nit.toLowerCase() : '';
    return idStr.includes(searchTerm) || nombre.includes(searchTerm) || nit.includes(searchTerm);
  });

  const seleccionarProveedor = (proveedor: Proveedor) => {
    setFormData({ ...formData, proveedorId: proveedor.id });
    setBusquedaProveedor(proveedor.nombreRazonSocial);
    setMostrarListaProveedores(false);
  };

  // Filtrar compras
  const comprasFiltradas = compras.filter(c => {
    const proveedor = proveedores.find(p => p.id === c.proveedorId);
    const matchBusqueda = searchQuery.length < 2 ||
      c.id.toString().includes(searchQuery) ||
      proveedor?.nombreRazonSocial.toLowerCase().includes(searchQuery.toLowerCase());

    const matchEstado = filtroEstado === 'Todos' || c.estado === filtroEstado.toLowerCase();

    return matchBusqueda && matchEstado;
  });

  const opcionesEstadoCompra = (row: Compra): { v: Compra['estado']; l: string }[] => {
    if (row.estado === 'recibida') return [{ v: 'recibida', l: 'Recibida' }];
    if (row.estado === 'cancelada') return [{ v: 'cancelada', l: 'Cancelada' }];
    return [
      { v: 'pendiente', l: 'Pendiente' },
      { v: 'recibida', l: 'Recibida' },
      { v: 'cancelada', l: 'Cancelada' }
    ];
  };

  const columns: Column[] = [
    {
      key: 'id',
      label: 'ID Compra',
      render: (id: number) => `#${id}`
    },
    {
      key: 'proveedorId',
      label: 'Proveedor',
      render: (proveedorId: number) => {
        const proveedor = proveedores.find(p => p.id === proveedorId);
        return proveedor?.nombreRazonSocial || 'Desconocido';
      }
    },
    {
      key: 'fecha',
      label: 'Fecha',
      render: (fecha: string) => new Date(fecha).toLocaleDateString('es-CO')
    },
    {
      key: 'productos',
      label: 'Productos',
      render: (productos: CompraProducto[]) => (
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
      key: 'estado',
      label: 'Estado',
      render: (_: any, row: Compra) => {
        const opts = opcionesEstadoCompra(row);
        const locked = opts.length === 1;
        const bg =
          row.estado === 'recibida' ? '#dcfce7' :
          row.estado === 'pendiente' ? '#fef9c3' : '#fee2e2';
        const fg =
          row.estado === 'recibida' ? '#166534' :
          row.estado === 'pendiente' ? '#854d0e' : '#991b1b';
        return (
          <select
            value={row.estado}
            onChange={(e) => handleEstadoChange(row, e.target.value as 'pendiente' | 'recibida' | 'cancelada')}
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

  const handleEstadoChange = (compra: Compra, estado: 'pendiente' | 'recibida' | 'cancelada') => {
    if (compra.estado === estado) return;
    if (compra.estado === 'recibida' || compra.estado === 'cancelada') {
      toast.warning('No se puede modificar el estado de una compra finalizada');
      return;
    }
    if (estado === 'recibida') {
      setCompraRecibidaPendiente(compra);
      return;
    }
    if (estado === 'cancelada') {
      setSelectedCompra(compra);
      setNuevoEstado('cancelada');
      setMotivoCancelacion('');
      setIsEstadoModalOpen(true);
    }
  };

  const confirmarRecibidaCompra = async () => {
    if (!compraRecibidaPendiente) return;
    try {
      await api.compras.changeEstado(compraRecibidaPendiente.id, 'recibida');
      toast.success('Estado actualizado', {
        description: 'Compra recibida y stock actualizado exitosamente'
      });
      setCompraRecibidaPendiente(null);
      cargarDatos();
    } catch (error: any) {
      toast.error('Error al cambiar estado', { description: error.message });
      cargarDatos();
    }
  };

  const confirmarCambioEstado = async () => {
    if (!selectedCompra) return;

    if (nuevoEstado === 'cancelada') {
      if (motivoCancelacion.length < 10 || motivoCancelacion.length > 50) {
        toast.error('Error de validación', {
          description: 'El motivo debe tener entre 10 y 50 caracteres'
        });
        return;
      }
    }

    try {
      await api.compras.changeEstado(
        selectedCompra.id,
        nuevoEstado,
        nuevoEstado === 'cancelada' ? motivoCancelacion : undefined
      );

      toast.success('Estado actualizado', {
        description: 'Compra cancelada exitosamente',
      });

      setIsEstadoModalOpen(false);
      setMotivoCancelacion('');
      setSelectedCompra(null);
      cargarDatos();
    } catch (error: any) {
      toast.error('Error al cambiar estado', { description: error.message });
      cargarDatos();
    }
  };

  const handleAdd = () => {
    setSelectedCompra(null);
    const hoy = new Date();
    const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}T${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`;

    setFormData({
      proveedorId: 0,
      fecha: fechaHoy,
      productos: []
    });
    setProductoActual({
      productoId: 0,
      cantidad: 0,
      precioCompra: 0,
      ganancia: 0
    });
    setBusquedaProveedor('');
    setMostrarListaProveedores(false);
    setBusquedaProducto('');
    setMostrarListaProductos(false);
    setIsModalOpen(true);
  };

  const handleView = (compra: Compra) => {
    setSelectedCompra(compra);
    setIsDetailModalOpen(true);
  };

  /**
   * Abre una vista imprimible (PDF) con todos los datos de la compra y un boton
   * "Descargar PDF" que invoca el dialogo de impresion del navegador.
   */
  const handleVerPdf = (compra: Compra) => {
    const proveedor = proveedores.find((p) => p.id === compra.proveedorId);
    const opened = openPrintablePdf({
      title: `Compra #${compra.id}`,
      subtitle: `Generado el ${new Date().toLocaleString('es-CO')}`,
      sections: [
        {
          title: 'Datos generales',
          rows: [
            { label: 'ID compra', value: `#${compra.id}` },
            { label: 'Proveedor', value: proveedor?.nombreRazonSocial || `ID ${compra.proveedorId}` },
            ...(proveedor?.nit ? [{ label: 'NIT/Documento proveedor', value: proveedor.nit }] : []),
            { label: 'Fecha de compra', value: new Date(compra.fecha).toLocaleString('es-CO') },
            {
              label: 'Estado',
              value: compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1),
            },
          ],
        },
        {
          title: 'Productos',
          table: {
            headers: ['Producto', 'Cantidad', 'Precio unit.', 'Subtotal'],
            rows: compra.productos.map((prod) => {
              const producto = productos.find((p) => p.id === prod.productoId);
              return [
                producto?.nombre || `Producto ${prod.productoId}`,
                prod.cantidad,
                formatCurrency(prod.precioCompra),
                formatCurrency(prod.subtotal),
              ];
            }),
          },
        },
        {
          title: 'Totales',
          rows: [
            { label: 'Subtotal', value: formatCurrency(compra.subtotal) },
            { label: 'IVA (19%)', value: formatCurrency(compra.iva) },
            { label: 'Total', value: formatCurrency(compra.total) },
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

  const agregarProducto = () => {
    // Validaciones
    if (productoActual.productoId === 0) {
      toast.error('Error', { description: 'Debe seleccionar un producto' });
      return;
    }

    if (productoActual.cantidad <= 0) {
      toast.error('Error', { description: 'La cantidad debe ser mayor a 0' });
      return;
    }

    if (productoActual.precioCompra <= 0) {
      toast.error('Error', { description: 'El precio de compra debe ser mayor a 0' });
      return;
    }

    if (productoActual.ganancia < 0) {
      toast.error('Error', { description: 'La ganancia no puede ser negativa' });
      return;
    }

    if (productoActual.ganancia > 100) {
      toast.error('Error', { description: 'La ganancia debe estar entre 0% y 100%' });
      return;
    }

    // Verificar si el producto ya está en la lista
    const yaExiste = formData.productos.find(p => p.productoId === productoActual.productoId);
    if (yaExiste) {
      toast.error('Error', { description: 'El producto ya está en la lista' });
      return;
    }

    const nuevoProducto: CompraProducto = {
      productoId: productoActual.productoId,
      cantidad: productoActual.cantidad,
      precioCompra: productoActual.precioCompra,
      ganancia: productoActual.ganancia,
      subtotal: productoActual.cantidad * productoActual.precioCompra
    };

    setFormData({
      ...formData,
      productos: [...formData.productos, nuevoProducto]
    });

    // Limpiar formulario de producto
    setProductoActual({
      productoId: 0,
      cantidad: 0,
      precioCompra: 0,
      ganancia: 0
    });
    setBusquedaProducto('');
    setMostrarListaProductos(false);

    toast.success('Producto agregado');
  };

  const eliminarProducto = (productoId: number) => {
    setFormData({
      ...formData,
      productos: formData.productos.filter(p => p.productoId !== productoId)
    });
    toast.success('Producto eliminado');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones
    if (formData.proveedorId === 0) {
      toast.error('Error', { description: 'Debe seleccionar un proveedor' });
      return;
    }

    if (!formData.fecha) {
      toast.error('Error', { description: 'Debe seleccionar una fecha' });
      return;
    }

    // Fecha de compra: no permitir días anteriores al de hoy (solo comparación por calendario local)
    const fechaSeleccionada = new Date(formData.fecha);
    const ahora = new Date();
    const inicioDiaSel = new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), fechaSeleccionada.getDate()).getTime();
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
    if (inicioDiaSel < inicioHoy) {
      toast.error('Error', { description: 'La fecha no puede ser anterior a hoy' });
      return;
    }

    if (formData.productos.length === 0) {
      toast.error('Error', { description: 'Debe agregar al menos un producto' });
      return;
    }

    try {
      const subtotal = formData.productos.reduce((sum, p) => sum + p.subtotal, 0);
      const iva = subtotal * 0.19;
      const total = subtotal + iva;

      const nuevaCompra = {
        proveedorId: formData.proveedorId,
        fecha: formData.fecha,
        productos: formData.productos,
        subtotal,
        iva,
        total,
        estado: 'pendiente' as const
      };

      await api.compras.create(nuevaCompra);

      toast.success('Compra creada', {
        description: 'La compra ha sido creada exitosamente en estado pendiente'
      });

      setIsModalOpen(false);
      cargarDatos();
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error desconocido al guardar';
      toast.error('No se pudo crear la compra', { description: msg });
    }
  };

  // Spinner solo en la carga inicial: en recargas la UI permanece para no perder foco al buscar.
  if (loading && compras.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando compras...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Compras</h2>
          <p className="text-muted-foreground">Administra las compras a proveedores</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nueva Compra
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-border p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar... (mín. 2, máx. 50 caracteres)"
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px] text-gray-500"
            >
              <option value="Todos">Filtrar por estado</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Recibida">Recibida</option>
              <option value="Cancelada">Cancelada</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setFiltroEstado('Todos');
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
        data={comprasFiltradas}
        actions={[
          {
            label: 'Ver Detalle',
            icon: <Eye className="w-4 h-4" />,
            onClick: handleView,
            variant: 'default'
          },
          commonActions.pdf(handleVerPdf),
        ]}
      />

      <AlertDialog
        isOpen={!!compraRecibidaPendiente}
        onClose={() => setCompraRecibidaPendiente(null)}
        onConfirm={confirmarRecibidaCompra}
        title="Confirmar recepción de compra"
        description="¿Confirma que los productos llegaron completos? Al confirmar, se incrementará el stock de los productos y el estado pasará a Recibida (no podrá cambiarse después)."
        type="warning"
        confirmText="Confirmar recepción"
      />

      {/* Modal Nueva Compra */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Compra"
        size="xl"
      >
        <Form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-2 gap-4">
            {/* Campo de búsqueda de Proveedor */}
            <div className="relative">
              <label className="block text-sm font-medium mb-2">Proveedor *</label>
              <input
                type="text"
                value={busquedaProveedor}
                onChange={(e) => {
                  setBusquedaProveedor(e.target.value);
                  setMostrarListaProveedores(true);
                }}
                onFocus={() => setMostrarListaProveedores(true)}
                placeholder="Escribe ID, nombre/razón social o NIT..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              {mostrarListaProveedores && busquedaProveedor && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {proveedoresFiltrados.length > 0 ? (
                    proveedoresFiltrados.map(p => (
                      <div
                        key={p.id}
                        onClick={() => seleccionarProveedor(p)}
                        className="px-3 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                      >
                        <div className="font-medium">{p.nombreRazonSocial}</div>
                        <div className="text-sm text-muted-foreground">
                          {p.nit && `NIT: ${p.nit} | `}Tipo: {p.tipo === 'persona_natural' ? 'Persona Natural' : 'Persona Jurídica'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-muted-foreground text-sm">No se encontraron proveedores</div>
                  )}
                </div>
              )}
            </div>

            <FormField
              label="Fecha y Hora *"
              name="fecha"
              type="datetime-local"
              value={formData.fecha}
              onChange={(value) => setFormData({ ...formData, fecha: value as string })}
              required
            />
          </div>

          {/* Agregar Productos */}
          <div className="border border-border rounded-lg p-4 bg-accent/30 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4" />
              Agregar Productos
            </h3>

            {/* Buscador de productos (mismo diseno que "Agregar Productos" en Nueva Venta) */}
            <div className="relative">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Producto *
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value);
                    setMostrarListaProductos(true);
                    if (productoActual.productoId !== 0) {
                      setProductoActual({ ...productoActual, productoId: 0 });
                    }
                  }}
                  onFocus={() => setMostrarListaProductos(true)}
                  placeholder="Busca por nombre o ID, o haz clic para ver todos los productos..."
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base bg-white"
                />
              </div>
              {mostrarListaProductos && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {productosFiltrados.length > 0 ? (
                    <>
                      <div className="sticky top-0 bg-primary/10 px-4 py-2 border-b border-border font-medium text-sm">
                        {busquedaProducto.trim() === ''
                          ? `Todos los productos (${productosFiltrados.length})`
                          : `${productosFiltrados.length} producto(s) encontrado(s)`}
                      </div>
                      {productosFiltrados.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => seleccionarProductoCompra(p)}
                          className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-primary" />
                                <span className="font-medium">{p.nombre}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                ID: {p.id} | Stock actual: {p.stock}
                              </div>
                            </div>
                            <Plus className="w-5 h-5 text-primary" />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="px-4 py-3 text-muted-foreground text-sm text-center">No se encontraron productos</div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                label="Cantidad *"
                name="cantidad"
                type="number"
                value={productoActual.cantidad === 0 ? '' : productoActual.cantidad}
                onChange={(value) => {
                  const num = parseInt(value as string) || 0;
                  if (num < 0) {
                    toast.warning('No se permiten números negativos');
                    return;
                  }
                  setProductoActual({ ...productoActual, cantidad: num });
                }}
                min={1}
              />

              <FormField
                label="Precio de Compra *"
                name="precioCompra"
                type="number"
                value={productoActual.precioCompra === 0 ? '' : productoActual.precioCompra}
                onChange={(value) => {
                  const num = parseInt(value as string) || 0;
                  if (num < 0) {
                    toast.warning('No se permiten números negativos');
                    return;
                  }
                  setProductoActual({ ...productoActual, precioCompra: num });
                }}
                min={1}
              />

              <FormField
                label="Ganancia (%) *"
                name="ganancia"
                type="number"
                value={productoActual.ganancia === 0 ? '' : productoActual.ganancia}
                onChange={(value) => {
                  const num = parseInt(value as string) || 0;
                  if (num < 0) {
                    toast.warning('No se permiten números negativos');
                    return;
                  }
                  if (num > 100) {
                    toast.warning('La ganancia no puede ser mayor al 100%');
                    return;
                  }
                  setProductoActual({ ...productoActual, ganancia: num });
                }}
                min={0}
                max={100}
              />
            </div>

            <Button type="button" onClick={agregarProducto} size="sm">
              Agregar Producto
            </Button>
          </div>

          {/* Lista de productos agregados */}
          {formData.productos.length > 0 && (
            <div className="border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-3">Productos Agregados ({formData.productos.length})</h4>
              <div className="space-y-2">
                {formData.productos.map((prod) => {
                  const producto = productos.find(p => p.id === prod.productoId);
                  return (
                    <div key={prod.productoId} className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{producto?.nombre}</p>
                        <p className="text-sm text-muted-foreground">
                          Cantidad: {prod.cantidad} | Precio: {formatCurrency(prod.precioCompra)} |
                          Ganancia: {prod.ganancia}% | Subtotal: {formatCurrency(prod.subtotal)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => eliminarProducto(prod.productoId)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">
                    {formatCurrency(formData.productos.reduce((sum, p) => sum + p.subtotal, 0))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>IVA (19%):</span>
                  <span className="font-medium">
                    {formatCurrency(formData.productos.reduce((sum, p) => sum + p.subtotal, 0) * 0.19)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-primary">
                    {formatCurrency(formData.productos.reduce((sum, p) => sum + p.subtotal, 0) * 1.19)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={formData.productos.length === 0}>
              Crear Compra
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedCompra(null);
        }}
        title={`Detalle de Compra #${selectedCompra?.id}`}
        size="lg"
      >
        {selectedCompra && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Proveedor</p>
                <p className="font-medium">
                  {proveedores.find(p => p.id === selectedCompra.proveedorId)?.nombreRazonSocial}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha de Compra</p>
                <p className="font-medium">{new Date(selectedCompra.fecha).toLocaleString('es-CO')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha de Creación</p>
                <p className="font-medium">{new Date(selectedCompra.createdAt).toLocaleString('es-CO')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedCompra.estado === 'recibida' ? 'bg-green-100 text-green-700' :
                  selectedCompra.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedCompra.estado.charAt(0).toUpperCase() + selectedCompra.estado.slice(1)}
                </span>
              </div>
            </div>

            {/* Productos */}
            <div>
              <h4 className="font-medium mb-3">Productos</h4>
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
                    {selectedCompra.productos.map((prod, index) => {
                      const producto = productos.find(p => p.id === prod.productoId);
                      return (
                        <tr key={index} className="border-t">
                          <td className="p-2">{producto?.nombre || 'Producto desconocido'}</td>
                          <td className="text-right p-2">{prod.cantidad}</td>
                          <td className="text-right p-2">{formatCurrency(prod.precioCompra)}</td>
                          <td className="text-right p-2">{formatCurrency(prod.subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totales */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-medium">{formatCurrency(selectedCompra.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA (19%):</span>
                <span className="font-medium">{formatCurrency(selectedCompra.iva)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(selectedCompra.total)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => handleVerPdf(selectedCompra)}>
                Descargar PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedCompra(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Cambio de Estado */}
      <Modal
        isOpen={isEstadoModalOpen}
        onClose={() => {
          setIsEstadoModalOpen(false);
          setMotivoCancelacion('');
          setSelectedCompra(null);
        }}
        title="Cambiar Estado de Compra"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cancelación de la compra <strong>#{selectedCompra?.id}</strong>. Indique el motivo.
          </p>

          <FormField
            label="Motivo de cancelación"
            name="motivo"
            type="textarea"
            value={motivoCancelacion}
            onChange={(value) => setMotivoCancelacion(value as string)}
            placeholder="Ingrese el motivo de la cancelación (10-50 caracteres)"
            required
            minLength={10}
            maxLength={50}
          />

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setIsEstadoModalOpen(false);
                setMotivoCancelacion('');
                setSelectedCompra(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarCambioEstado}>
              Confirmar Cambio
            </Button>
          </FormActions>
        </div>
      </Modal>
    </div>
  );
}

