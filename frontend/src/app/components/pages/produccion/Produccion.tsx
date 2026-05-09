import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions, FieldError, FieldSuccess } from '../../Form';
import { Button } from '../../Button';
import { Plus, FileText, Calendar, Search, Package, ShoppingCart } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import type { OrdenProduccion, Producto, Usuario, ProductoInsumoRecetaLine } from '../../../services/types';
import { MotivoModal } from '../../MotivoModal';
import { AlertDialog } from '../../AlertDialog';

function totalRequeridoLinea(cantidadRequerida: number, ordenCantidad: number): number {
  return Number(cantidadRequerida) * Math.max(1, ordenCantidad);
}

function totalMlVolumen(unidad: string, totalLinea: number): number | null {
  const u = String(unidad || '')
    .trim()
    .toLowerCase();
  if (u === 'mililitros') return totalLinea;
  if (u === 'litros') return totalLinea * 1000;
  return null;
}

function etiquetaEnvasesAprox(unidad: string, totalLinea: number, envaseMl: number): string {
  const ml = totalMlVolumen(unidad, totalLinea);
  if (ml == null) return '—';
  if (envaseMl <= 0) return '—';
  return String(Math.ceil(ml / envaseMl));
}

interface OrdenProduccionView extends OrdenProduccion {
  productoNombre?: string;
  productorNombre?: string;
}

export function Produccion() {
  const [ordenes, setOrdenes] = useState<OrdenProduccionView[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productores, setProductores] = useState<Usuario[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfContent, setPdfContent] = useState('');
  const [selectedOrden, setSelectedOrden] = useState<OrdenProduccionView | null>(null);
  const [produccionPending, setProduccionPending] = useState<{
    orden: OrdenProduccionView;
    to: OrdenProduccion['estado'];
  } | null>(null);
  const [motivoProduccion, setMotivoProduccion] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [busquedaProductor, setBusquedaProductor] = useState('');
  const [mostrarListaProductos, setMostrarListaProductos] = useState(false);
  const [mostrarListaProductores, setMostrarListaProductores] = useState(false);
  const [formData, setFormData] = useState({
    productoId: 0,
    cantidad: 1,
    productorId: 0,
    fechaInicio: new Date().toISOString().split('T')[0],
    tiempoPreparacion: 60
  });

  // Estados para validaciones en tiempo real
  const [fechaValida, setFechaValida] = useState<boolean | null>(null);
  const [tiempoValido, setTiempoValido] = useState<boolean | null>(null);
  const [recetaLineas, setRecetaLineas] = useState<ProductoInsumoRecetaLine[]>([]);
  const [envaseMl, setEnvaseMl] = useState('');
  const [detalleReceta, setDetalleReceta] = useState<ProductoInsumoRecetaLine[]>([]);
  const [detalleEnvaseMl, setDetalleEnvaseMl] = useState('');

  useEffect(() => {
    if (!formData.productoId) {
      setRecetaLineas([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.productoInsumos.getByProducto(formData.productoId);
        if (!cancelled) setRecetaLineas(rows as ProductoInsumoRecetaLine[]);
      } catch {
        if (!cancelled) setRecetaLineas([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formData.productoId]);

  useEffect(() => {
    if (!isDetailModalOpen || !selectedOrden?.productoId) {
      setDetalleReceta([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.productoInsumos.getByProducto(selectedOrden.productoId);
        if (!cancelled) setDetalleReceta(rows as ProductoInsumoRecetaLine[]);
      } catch {
        if (!cancelled) setDetalleReceta([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDetailModalOpen, selectedOrden?.productoId]);

  // Cerrar listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setMostrarListaProductos(false);
        setMostrarListaProductores(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cargarDatos = async () => {
    try {
      const [ordenesData, productosData, usuariosData] = await Promise.all([
        api.produccion.getAll(),
        api.productos.getAll(),
        api.usuarios.getAll()
      ]);

      const productoresData = usuariosData.filter(u => u.rol === 'Productor' && u.estado === 'activo');
      setProductores(productoresData);
      setProductos(productosData.filter(p => p.typo === 'de preparacion' && p.estado === 'activo'));

      const ordenesConInfo = ordenesData.map(orden => {
        const producto = productosData.find(p => p.id === orden.productoId);
        const productor = usuariosData.find(u => u.id === orden.productorId);
        return {
          ...orden,
          productoNombre: producto?.nombre,
          productorNombre: productor ? `${productor.nombre} ${productor.apellido}` : 'Desconocido'
        };
      });

      setOrdenes(ordenesConInfo);
    } catch (error) {
      toast.error('Error al cargar datos');
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Filtrar productos según búsqueda
  const productosFiltrados = productos.filter(p => {
    const searchTerm = busquedaProducto.toLowerCase();
    const idStr = String(p.id);
    const nombre = p.nombre.toLowerCase();
    return idStr.includes(searchTerm) || nombre.includes(searchTerm);
  });

  // Filtrar productores según búsqueda
  const productoresFiltrados = productores.filter(p => {
    const searchTerm = busquedaProductor.toLowerCase();
    const nombreCompleto = `${p.nombre} ${p.apellido}`.toLowerCase();
    const idStr = String(p.id);
    return nombreCompleto.includes(searchTerm) || idStr.includes(searchTerm);
  });

  const seleccionarProducto = (producto: Producto) => {
    setFormData({ ...formData, productoId: producto.id });
    setBusquedaProducto(producto.nombre);
    setMostrarListaProductos(false);
  };

  const seleccionarProductor = (productor: Usuario) => {
    setFormData({ ...formData, productorId: productor.id });
    setBusquedaProductor(`${productor.nombre} ${productor.apellido}`);
    setMostrarListaProductores(false);
  };

  const columns: Column[] = [
    {
      key: 'idOrden',
      label: 'ID Orden',
      render: (value: number) => `#${String(value).padStart(4, '0')}`
    },
    {
      key: 'productoNombre',
      label: 'Producto'
    },
    {
      key: 'cantidad',
      label: 'Cantidad',
      render: (cantidad: number) => `${cantidad} unidades`
    },
    {
      key: 'productorNombre',
      label: 'Productor'
    },
    {
      key: 'fechaInicio',
      label: 'Fecha Inicio'
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: string, row: OrdenProduccionView) => {
        if (row.estado === 'completada' || row.estado === 'cancelada') {
          return (
            <span
              className={`px-3 py-1 rounded-full text-xs ${
                row.estado === 'completada'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {row.estado === 'completada' ? 'Completada' : 'Cancelada'}
            </span>
          );
        }
        const options: { v: OrdenProduccion['estado']; l: string }[] =
          row.estado === 'pendiente'
            ? [
                { v: 'pendiente', l: 'Pendiente' },
                { v: 'en proceso', l: 'En Proceso' },
                { v: 'cancelada', l: 'Cancelada' }
              ]
            : [
                { v: 'en proceso', l: 'En Proceso' },
                { v: 'completada', l: 'Completada' },
                { v: 'cancelada', l: 'Cancelada' }
              ];
        const bg =
          row.estado === 'completada'
            ? '#dcfce7'
            : row.estado === 'en proceso'
              ? '#dbeafe'
              : row.estado === 'pendiente'
                ? '#fef9c3'
                : '#fee2e2';
        const fg =
          row.estado === 'completada'
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
              handleProduccionEstadoSelect(row, e.target.value as OrdenProduccion['estado'])
            }
            className="px-3 py-1 rounded-full text-xs border-0 cursor-pointer"
            style={{ backgroundColor: bg, color: fg }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((o) => (
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
    setSelectedOrden(null);
    const fechaHoy = new Date().toISOString().split('T')[0];
    setFormData({
      productoId: 0,
      cantidad: 1,
      productorId: 0,
      fechaInicio: fechaHoy,
      tiempoPreparacion: 60
    });
    setBusquedaProducto('');
    setBusquedaProductor('');
    setMostrarListaProductos(false);
    setMostrarListaProductores(false);
    // Resetear validaciones
    setFechaValida(true); // Fecha de hoy es válida
    setTiempoValido(true); // 60 minutos es válido
    setEnvaseMl('');
    setIsModalOpen(true);
  };

  const handleViewDetail = (orden: OrdenProduccionView) => {
    setSelectedOrden(orden);
    setDetalleEnvaseMl('');
    setIsDetailModalOpen(true);
  };

  const ejecutarProduccionCambio = async (
    orden: OrdenProduccionView,
    to: OrdenProduccion['estado'],
    motivo?: string
  ) => {
    try {
      await api.produccion.changeEstado(orden.id, to, motivo);
      let mensaje = '';
      if (to === 'en proceso') {
        mensaje = `Se ha notificado al productor ${orden.productorNombre}.`;
      } else if (to === 'completada') {
        mensaje = 'Se ha actualizado el inventario de productos.';
      } else if (to === 'cancelada') {
        mensaje = motivo ? `Motivo: ${motivo}` : '';
      } else {
        mensaje = `Estado: ${to}`;
      }
      toast.success('Estado actualizado', { description: mensaje });
      setProduccionPending(null);
      setMotivoProduccion('');
      cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
      setProduccionPending(null);
      setMotivoProduccion('');
      cargarDatos();
    }
  };

  const handleProduccionEstadoSelect = (orden: OrdenProduccionView, to: OrdenProduccion['estado']) => {
    if (orden.estado === to) return;
    if (to === 'cancelada') {
      setProduccionPending({ orden, to });
      setMotivoProduccion('');
      return;
    }
    if (to === 'completada') {
      setProduccionPending({ orden, to });
      return;
    }
    void ejecutarProduccionCambio(orden, to);
  };

  const confirmProduccionCancelMotivo = async () => {
    if (!produccionPending || produccionPending.to !== 'cancelada') return;
    const m = motivoProduccion.trim();
    if (m.length < 10 || m.length > 50) {
      toast.error('El motivo debe tener entre 10 y 50 caracteres');
      return;
    }
    await ejecutarProduccionCambio(produccionPending.orden, 'cancelada', m);
  };

  const confirmProduccionCompletar = () => {
    if (!produccionPending || produccionPending.to !== 'completada') return;
    void ejecutarProduccionCambio(produccionPending.orden, 'completada');
  };

  const handleGeneratePDF = (orden: OrdenProduccionView) => {
    const content = `
============================================================
           GRANDMA'S LIQUEURS - ORDEN DE PRODUCCION
============================================================

ID Orden:           #${String(orden.idOrden).padStart(4, '0')}
Producto:           ${orden.productoNombre}
Cantidad:           ${orden.cantidad} unidades
Productor:          ${orden.productorNombre}
Fecha Inicio:       ${orden.fechaInicio}
Tiempo Preparación: ${orden.tiempoPreparacion} minutos
Estado:             ${orden.estado}
${orden.motivoCancelacion ? `Motivo Cancelación: ${orden.motivoCancelacion}` : ''}

------------------------------------------------------------
Firma Productor:    _______________________

Firma Supervisor:   _______________________

Fecha Impresión:    ${new Date().toLocaleString('es-CO')}
------------------------------------------------------------
    `.trim();

    setPdfContent(content);
    setIsPdfModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.productoId) {
      toast.error('Seleccione un producto');
      return;
    }

    if (formData.cantidad < 1) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }

    if (!formData.productorId) {
      toast.error('Seleccione un productor');
      return;
    }

    if (formData.tiempoPreparacion < 15) {
      toast.error('El tiempo de preparación debe ser al menos 15 minutos');
      return;
    }

    // Validar fecha no sea pasada
    const fechaHoy = new Date().toISOString().split('T')[0];
    if (formData.fechaInicio < fechaHoy) {
      toast.error('La fecha de inicio no puede ser una fecha pasada');
      return;
    }

    try {
      const ordenCreada = await api.produccion.create({
        productoId: formData.productoId,
        cantidad: formData.cantidad,
        productorId: formData.productorId,
        fechaInicio: formData.fechaInicio,
        tiempoPreparacion: formData.tiempoPreparacion,
        estado: 'pendiente'
      });

      const productor = productores.find(p => p.id === formData.productorId);
      const nombreProductor = productor ? `${productor.nombre} ${productor.apellido}` : 'el productor';
      const ordenId = ordenCreada?.idOrden || 'XXXX';

      toast.success('Orden de producción creada exitosamente', {
        description: `Orden #${String(ordenId).padStart(4, '0')} asignada a ${nombreProductor}. Estado: Pendiente.`
      });
      setIsModalOpen(false);
      cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear orden');
    }
  };

  const ordenesFiltradas = ordenes.filter(orden => {
    const matchBusqueda = busqueda.length === 0 ||
      busqueda.length >= 2 &&
      (orden.productoNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
       orden.productorNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
       String(orden.idOrden).includes(busqueda));

    const matchEstado = !filtroEstado || orden.estado === filtroEstado;
    const matchFecha = !filtroFecha || orden.fechaInicio === filtroFecha;

    return matchBusqueda && matchEstado && matchFecha;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Producción</h2>
          <p className="text-muted-foreground">Administra las órdenes de producción de bebidas</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nueva Orden
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
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px] text-gray-500"
            >
              <option value="">Filtrar por estado</option>
              <option value="pendiente">Pendiente</option>
              <option value="en proceso">En Proceso</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <div className="relative min-w-[180px]">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                placeholder="Filtrar por fecha"
                className="w-full pl-10 pr-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary text-gray-500"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroEstado('');
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
        data={ordenesFiltradas}
        actions={[
          commonActions.view(handleViewDetail),
          commonActions.pdf(handleGeneratePDF)
        ]}
      />

      <MotivoModal
        isOpen={!!produccionPending && produccionPending.to === 'cancelada'}
        onClose={() => {
          setProduccionPending(null);
          setMotivoProduccion('');
        }}
        title="Cancelar orden de producción"
        description={
          produccionPending ? (
            <>
              <p>
                <strong>Orden:</strong> #
                {String(produccionPending.orden.idOrden).padStart(4, '0')}
              </p>
              <p className="text-muted-foreground">Indique el motivo de cancelación.</p>
            </>
          ) : null
        }
        motivo={motivoProduccion}
        onMotivoChange={setMotivoProduccion}
        onConfirm={confirmProduccionCancelMotivo}
      />

      <AlertDialog
        isOpen={!!produccionPending && produccionPending.to === 'completada'}
        onClose={() => setProduccionPending(null)}
        onConfirm={confirmProduccionCompletar}
        title="Completar orden"
        description="Esta acción marca la orden como completada y actualiza inventario. ¿Desea continuar?"
        type="warning"
        confirmText="Completar"
      />

      {/* Modal de formulario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Orden de Producción"
        size="lg"
      >
        <Form onSubmit={handleSubmit}>
          {/* Nota informativa sobre órdenes de producción */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
            <p className="text-sm text-blue-700">
              <strong>Nota:</strong> Las órdenes de producción se crean en estado Pendiente. Cambia el estado a 'En Proceso' cuando el productor comience el trabajo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                El ID de Orden se generará automáticamente
              </p>
            </div>

            {/* Campo de busqueda de Producto (mismo diseno que "Agregar Productos" en Nueva Venta) */}
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
                  }}
                  onFocus={() => setMostrarListaProductos(true)}
                  placeholder="Busca por nombre o ID, o haz clic para ver todos los productos..."
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base"
                  required
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
                          onClick={() => seleccionarProducto(p)}
                          className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-primary" />
                                <span className="font-medium">{p.nombre}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                ID: {p.id}
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

            <FormField
              label="Cantidad"
              name="cantidad"
              type="number"
              value={formData.cantidad}
              onChange={(value) => setFormData({ ...formData, cantidad: value as number })}
              placeholder="Unidades a producir"
              required
            />

            {/* Campo de búsqueda de Productor */}
            <div className="relative">
              <label className="block text-sm font-medium mb-2">Productor *</label>
              <input
                type="text"
                value={busquedaProductor}
                onChange={(e) => {
                  setBusquedaProductor(e.target.value);
                  setMostrarListaProductores(true);
                }}
                onFocus={() => setMostrarListaProductores(true)}
                placeholder="Escribe ID, nombre o apellido..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              {mostrarListaProductores && busquedaProductor && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {productoresFiltrados.length > 0 ? (
                    productoresFiltrados.map(p => (
                      <div
                        key={p.id}
                        onClick={() => seleccionarProductor(p)}
                        className="px-3 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                      >
                        <div className="font-medium">{p.nombre} {p.apellido}</div>
                        <div className="text-sm text-muted-foreground">ID: {p.id}</div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-muted-foreground text-sm">No se encontraron productores</div>
                  )}
                </div>
              )}
            </div>

            {/* Fecha de Inicio con validación visual */}
            <div>
              <label className="block text-sm font-medium mb-2">Fecha de Inicio *</label>
              <input
                type="date"
                value={formData.fechaInicio}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  const value = e.target.value;
                  const fechaHoy = new Date().toISOString().split('T')[0];
                  if (value && value < fechaHoy) {
                    setFechaValida(false);
                    return;
                  }
                  setFormData({ ...formData, fechaInicio: value });
                  setFechaValida(value >= fechaHoy);
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                  fechaValida === null ? 'border-border focus:ring-primary' :
                  fechaValida ? 'border-green-500 ring-1 ring-green-500/20 focus:ring-green-500'
                              : 'border-destructive ring-1 ring-destructive/20 focus:ring-destructive'
                }`}
                required
              />
              <div className="mt-1.5">
                {fechaValida === false && (
                  <FieldError>No se puede seleccionar una fecha pasada. Elija hoy o una fecha futura.</FieldError>
                )}
                {fechaValida === true && formData.fechaInicio !== new Date().toISOString().split('T')[0] && (
                  <FieldSuccess>Fecha válida.</FieldSuccess>
                )}
              </div>
            </div>

            {/* Tiempo de Preparación con validación visual */}
            <div>
              <label className="block text-sm font-medium mb-2">Tiempo de Preparación (minutos) *</label>
              <input
                type="number"
                value={formData.tiempoPreparacion}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setFormData({ ...formData, tiempoPreparacion: value });
                  setTiempoValido(value >= 15 && value <= 480);
                }}
                placeholder="Ej: 60"
                min="15"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                  tiempoValido === null ? 'border-border focus:ring-primary' :
                  tiempoValido ? 'border-green-500 ring-1 ring-green-500/20 focus:ring-green-500'
                               : 'border-destructive ring-1 ring-destructive/20 focus:ring-destructive'
                }`}
                required
              />
              {tiempoValido === false && formData.tiempoPreparacion < 15 && (
                <div className="mt-1.5">
                  <FieldError>El tiempo mínimo es 15 minutos.</FieldError>
                </div>
              )}
              {formData.tiempoPreparacion > 480 && (
                <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                  <p className="text-xs text-yellow-700">
                    <strong>⚠️ Advertencia:</strong> El tiempo de preparación es muy alto ({formData.tiempoPreparacion} minutos = {(formData.tiempoPreparacion / 60).toFixed(1)} horas). Verifica que sea correcto.
                  </p>
                </div>
              )}
              {tiempoValido === true && (
                <p className="text-xs text-green-600 mt-1">✓ Tiempo válido ({(formData.tiempoPreparacion / 60).toFixed(1)} horas)</p>
              )}
            </div>
          </div>

          {formData.productoId > 0 && (
            <div className="mt-4 space-y-3">
              <h4 className="text-sm font-medium">Receta (consumo previsto)</h4>
              {recetaLineas.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  No hay líneas de receta para este producto. Defina la receta en la API o administración
                  antes de producir; consulte{' '}
                  <code className="rounded bg-white/60 px-1 text-xs">docs/MODULO_PRODUCCION_FLUJO.md</code>{' '}
                  en el repositorio.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Insumo</th>
                          <th className="px-3 py-2 text-right font-medium">Por unidad</th>
                          <th className="px-3 py-2 text-right font-medium">Total</th>
                          <th className="px-3 py-2 text-left font-medium">Unidad</th>
                          <th className="px-3 py-2 text-right font-medium">Envases (aprox.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recetaLineas.map((line) => {
                          const porUnidad = Number(line.cantidad_requerida);
                          const total = totalRequeridoLinea(porUnidad, formData.cantidad);
                          const unidad = line.unidad || '';
                          const envaseNum = parseFloat(String(envaseMl).replace(',', '.'));
                          const envases = etiquetaEnvasesAprox(
                            unidad,
                            total,
                            Number.isFinite(envaseNum) && envaseNum > 0 ? envaseNum : 0
                          );
                          return (
                            <tr key={line.id} className="border-t border-border">
                              <td className="px-3 py-2">
                                {line.insumo_nombre?.trim() || `Insumo #${line.insumo_id}`}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{porUnidad}</td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums">{total}</td>
                              <td className="px-3 py-2">{unidad}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{envases}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Tamaño del envase (ml)
                      </label>
                      <input
                        type="number"
                        min={1}
                        step="any"
                        value={envaseMl}
                        onChange={(e) => setEnvaseMl(e.target.value)}
                        placeholder="Ej. 100"
                        className="w-36 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <p className="pb-2 text-xs text-muted-foreground">
                      Solo aplica a insumos en litros o mililitros; otras unidades muestran —.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="p-4 bg-accent/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              La orden de producción se creará en estado "Pendiente".
              Puedes cambiar el estado usando las acciones de la tabla.
            </p>
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Crear Orden
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
            {/* Header con estado */}
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">Orden #{String(selectedOrden.idOrden).padStart(4, '0')}</h3>
                <p className="text-sm text-muted-foreground">{selectedOrden.productoNombre}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm ${
                selectedOrden.estado === 'completada' ? 'bg-green-100 text-green-700' :
                selectedOrden.estado === 'en proceso' ? 'bg-blue-100 text-blue-700' :
                selectedOrden.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {selectedOrden.estado === 'completada' ? 'Completada' :
                 selectedOrden.estado === 'en proceso' ? 'En Proceso' :
                 selectedOrden.estado === 'pendiente' ? 'Pendiente' : 'Cancelada'}
              </span>
            </div>

            {/* Información general */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">ID Orden</label>
                <p className="mt-1">#{String(selectedOrden.idOrden).padStart(4, '0')}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Producto</label>
                <p className="mt-1">{selectedOrden.productoNombre}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Cantidad</label>
                <p className="mt-1">{selectedOrden.cantidad} unidades</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Productor</label>
                <p className="mt-1">{selectedOrden.productorNombre}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha de Inicio</label>
                <p className="mt-1">{selectedOrden.fechaInicio}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Tiempo de Preparación</label>
                <p className="mt-1">{selectedOrden.tiempoPreparacion} minutos</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Receta para esta orden</h4>
              {detalleReceta.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay receta registrada para este producto (o no se pudo cargar).
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Insumo</th>
                          <th className="px-3 py-2 text-right font-medium">Por unidad</th>
                          <th className="px-3 py-2 text-right font-medium">Total orden</th>
                          <th className="px-3 py-2 text-left font-medium">Unidad</th>
                          <th className="px-3 py-2 text-right font-medium">Envases (aprox.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleReceta.map((line) => {
                          const porUnidad = Number(line.cantidad_requerida);
                          const total = totalRequeridoLinea(porUnidad, selectedOrden.cantidad);
                          const unidad = line.unidad || '';
                          const envaseNum = parseFloat(String(detalleEnvaseMl).replace(',', '.'));
                          const envases = etiquetaEnvasesAprox(
                            unidad,
                            total,
                            Number.isFinite(envaseNum) && envaseNum > 0 ? envaseNum : 0
                          );
                          return (
                            <tr key={line.id} className="border-t border-border">
                              <td className="px-3 py-2">
                                {line.insumo_nombre?.trim() || `Insumo #${line.insumo_id}`}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{porUnidad}</td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums">{total}</td>
                              <td className="px-3 py-2">{unidad}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{envases}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Tamaño del envase (ml)
                      </label>
                      <input
                        type="number"
                        min={1}
                        step="any"
                        value={detalleEnvaseMl}
                        onChange={(e) => setDetalleEnvaseMl(e.target.value)}
                        placeholder="Ej. 100"
                        className="w-36 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <p className="pb-2 text-xs text-muted-foreground">
                      Cálculo orientativo para volúmenes (L / ml).
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Motivo de cancelación */}
            {selectedOrden.motivoCancelacion && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <label className="text-sm text-red-700 block mb-2 font-medium">Motivo de Cancelación</label>
                <p className="text-sm text-red-600">{selectedOrden.motivoCancelacion}</p>
              </div>
            )}

            {/* Observaciones */}
            <div className="p-4 bg-accent/50 rounded-lg">
              <label className="text-sm text-muted-foreground block mb-2">Observaciones</label>
              <p className="text-sm">
                {selectedOrden.estado === 'cancelada'
                  ? 'Esta orden ha sido cancelada y no puede ser modificada.'
                  : selectedOrden.estado === 'completada'
                  ? 'Orden completada exitosamente. No se puede modificar el estado.'
                  : selectedOrden.estado === 'en proceso'
                  ? 'Orden en proceso de producción.'
                  : 'Orden pendiente de iniciar producción.'}
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
        <div className="p-4 bg-accent/50 rounded-lg">
          <pre className="text-sm text-muted-foreground">
            {pdfContent}
          </pre>
        </div>
        <div className="flex justify-end mt-4">
          <Button 
            variant="outline" 
            onClick={() => setIsPdfModalOpen(false)}
          >
            Cerrar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
