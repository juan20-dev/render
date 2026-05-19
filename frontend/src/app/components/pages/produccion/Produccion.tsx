import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormActions, FieldError, FieldSuccess } from '../../Form';
import { Button } from '../../Button';
import { Plus, FileText, Calendar, Search, Package, ShoppingCart } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import type { OrdenProduccion, Producto, Usuario, Pedido } from '../../../services/types';
import { MotivoModal } from '../../MotivoModal';
import { AlertDialog } from '../../AlertDialog';
import { useAuth } from '../../AuthContext';

interface OrdenProduccionView extends OrdenProduccion {
  productoNombre?: string;
  productorNombre?: string;
}

export function Produccion() {
  const { user } = useAuth();
  const esProductor = String(user?.rol || '').trim().toLowerCase() === 'productor';

  const [ordenes, setOrdenes] = useState<OrdenProduccionView[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
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
  const [busquedaPedido, setBusquedaPedido] = useState('');
  const [busquedaProductor, setBusquedaProductor] = useState('');
  const [productosPedidoDisponibles, setProductosPedidoDisponibles] = useState<Producto[]>([]);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<Pedido | null>(null);
  const [mostrarListaPedidos, setMostrarListaPedidos] = useState(false);
  const [mostrarListaProductores, setMostrarListaProductores] = useState(false);
  const [formData, setFormData] = useState({
    pedidoId: 0,
    productorId: 0,
    fechaInicio: new Date().toISOString().split('T')[0],
    tiempoPreparacion: 60
  });

  // Estados para validaciones en tiempo real
  const [fechaValida, setFechaValida] = useState<boolean | null>(null);
  const [tiempoValido, setTiempoValido] = useState<boolean | null>(null);
  /** Insumos agregados del productor (una fila por insumo, saldo total). */
  const [insumosResumenProductor, setInsumosResumenProductor] = useState<
    { clave: string; insumo_nombre?: string; disponible?: number; unidad?: string }[]
  >([]);
  /** Consumo planificado para la orden (receta IA). */
  const [consumoPlaneado, setConsumoPlaneado] = useState<
    { clave: string; insumo_nombre: string; cantidad: number; unidad: string }[]
  >([]);
  /** Insumos seleccionados manualmente con sus cantidades. */
  const [insumosSeleccionados, setInsumosSeleccionados] = useState<
    { clave: string; insumo_nombre: string; cantidad: number; unidad: string }[]
  >([]);
  const [sugerenciaCargando, setSugerenciaCargando] = useState(false);

  const toggleInsumoSeleccionado = (insumo: any, cantidad: number) => {
    const existente = insumosSeleccionados.find(i => i.clave === insumo.clave);
    if (existente) {
      if (cantidad <= 0) {
        setInsumosSeleccionados(insumosSeleccionados.filter(i => i.clave !== insumo.clave));
      } else {
        setInsumosSeleccionados(
          insumosSeleccionados.map(i =>
            i.clave === insumo.clave ? { ...i, cantidad } : i
          )
        );
      }
    } else if (cantidad > 0) {
      setInsumosSeleccionados([
        ...insumosSeleccionados,
        {
          clave: insumo.clave,
          insumo_nombre: insumo.insumo_nombre || 'Insumo',
          cantidad,
          unidad: insumo.unidad || ''
        }
      ]);
    }
  };

  useEffect(() => {
    if (!isModalOpen || !formData.productorId) {
      setInsumosResumenProductor([]);
      setConsumoPlaneado([]);
      setInsumosSeleccionados([]);
      return;
    }
    setConsumoPlaneado([]);
    let cancelled = false;
    void (async () => {
      try {
        console.log(`[Produccion] Fetching insumos para productorId=${formData.productorId}`);
        const rows = await api.produccion.getInsumosResumenProductor(formData.productorId);
        console.log(`[Produccion] Insumos obtenidos:`, rows);
        if (!cancelled) setInsumosResumenProductor(Array.isArray(rows) ? rows : []);
      } catch (error) {
        console.error(`[Produccion] Error al obtener insumos:`, error);
        if (!cancelled) setInsumosResumenProductor([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, formData.productorId]);

  useEffect(() => {
    setConsumoPlaneado([]);
  }, [formData.pedidoId]);

  // Cerrar listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.produccion-pedido-picker')) {
        setMostrarListaPedidos(false);
      }
      if (!target.closest('.produccion-productor-picker')) {
        setMostrarListaProductores(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  const cargarDatos = async () => {
    try {
      const ordenesData = await api.produccion.getAll();

      if (esProductor) {
        const ordenesConInfo = ordenesData.map((orden) => ({
          ...orden,
          productoNombre: orden.productoNombre || 'Producto',
          productorNombre:
            orden.productorNombre || (user ? `${user.nombre} ${user.apellido}`.trim() : 'Asignado a mí'),
        }));
        setOrdenes(ordenesConInfo);
        setProductos([]);
        setPedidos([]);
        setProductores([]);
        return;
      }

      const [productosData, usuariosData, pedidosData] = await Promise.all([
        api.productos.getAll(),
        api.usuarios.getAll(),
        api.pedidos.getAll(),
      ]);

      const pedidoIdsConProduccion = new Set(
        ordenesData
          .map((o) => (o.pedidoId != null && Number(o.pedidoId) > 0 ? Number(o.pedidoId) : null))
          .filter((id): id is number => id != null)
      );

      const productoresData = usuariosData.filter((u) => u.rol === 'Productor' && u.estado === 'activo');
      setProductores(productoresData);
      setProductos(productosData.filter((p) => p.typo === 'de preparacion' && p.estado === 'activo'));
      setPedidos(
        pedidosData.filter(
          (p) => p.estado === 'en proceso' && !pedidoIdsConProduccion.has(Number(p.id))
        )
      );

      const ordenesConInfo = ordenesData.map((orden) => {
        const det = orden.detallePreparacion;
        let productoNombre: string | undefined;
        if (Array.isArray(det) && det.length > 0) {
          productoNombre = det
            .map((l) => `${l.cantidad}× ${l.productoNombre || 'Producto'}`)
            .join(', ');
        } else {
          const producto = productosData.find((p) => p.id === orden.productoId);
          productoNombre = producto?.nombre;
        }
        return {
          ...orden,
          productoNombre,
          productorNombre: (orden as any).productorNombre || 'Desconocido',
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

  // Filtrar pedidos y productos dentro del pedido seleccionado
  const pedidosFiltrados = pedidos.filter((p) => {
    const searchTerm = busquedaPedido.toLowerCase();
    if (!searchTerm) return true;
    return String(p.id).includes(searchTerm);
  });

  // Filtrar productores según búsqueda
  const productoresFiltrados = productores.filter(p => {
    const searchTerm = busquedaProductor.toLowerCase();
    const nombreCompleto = `${p.nombre} ${p.apellido}`.toLowerCase();
    const idStr = String(p.id);
    return nombreCompleto.includes(searchTerm) || idStr.includes(searchTerm);
  });

  const seleccionarPedido = async (pedido: Pedido) => {
    try {
      const detalle = await api.pedidos.getById(pedido.id);
      const prepIds = new Set(productos.map((x) => Number(x.id)));
      const ids = new Set(
        detalle.productos
          .map((d) => Number(d.productoId))
          .filter((id) => Number.isFinite(id) && id > 0 && prepIds.has(id))
      );
      const disponibles = productos.filter((p) => ids.has(Number(p.id)));
      if (disponibles.length === 0) {
        toast.error('El pedido no tiene productos de preparación disponibles para producción');
        return;
      }
      setPedidoSeleccionado(detalle);
      setProductosPedidoDisponibles(disponibles);
      setFormData({
        ...formData,
        pedidoId: pedido.id,
      });
      setBusquedaPedido(`#${String(pedido.id).padStart(4, '0')}`);
      setMostrarListaPedidos(false);
    } catch {
      toast.error('No se pudo cargar el detalle del pedido seleccionado');
    }
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
      pedidoId: 0,
      productorId: 0,
      fechaInicio: fechaHoy,
      tiempoPreparacion: 60
    });
    setPedidoSeleccionado(null);
    setProductosPedidoDisponibles([]);
    setBusquedaPedido('');
    setBusquedaProductor('');
    setMostrarListaPedidos(false);
    setMostrarListaProductores(false);
    // Resetear validaciones
    setFechaValida(true); // Fecha de hoy es válida
    setTiempoValido(true); // 60 minutos es válido
    setInsumosResumenProductor([]);
    setConsumoPlaneado([]);
    setIsModalOpen(true);
  };

  const handleSeleccionarInsumosRapidos = async () => {
    if (!formData.pedidoId || !formData.productorId) {
      toast.error('Seleccione pedido y productor antes de calcular insumos');
      return;
    }
    if (!pedidoSeleccionado || productosPedidoDisponibles.length === 0) {
      toast.error('El pedido no tiene productos de preparación');
      return;
    }
    setSugerenciaCargando(true);
    try {
      const res = await api.produccion.sugerirConsumo(formData.pedidoId, formData.productorId);
      setConsumoPlaneado(Array.isArray(res.sugerido) ? res.sugerido : []);
      if (res.faltantes?.length) {
        const detalle = res.faltantes
          .map((f) => `${f.insumo_nombre}: faltan ${f.falta} ${f.unidad}`)
          .join('; ');
        toast.error('Insumos insuficientes en el productor', {
          description: `${detalle}. Registre una nueva entrega de insumos al productor.`,
        });
      } else {
        toast.success('Receta de insumos calculada', {
          description: 'Revise el consumo propuesto antes de crear la orden.',
        });
      }
    } catch (error: any) {
      toast.error(error.message || 'No se pudo calcular la receta de insumos');
      setConsumoPlaneado([]);
    } finally {
      setSugerenciaCargando(false);
    }
  };

  const handleViewDetail = (orden: OrdenProduccionView) => {
    setSelectedOrden(orden);
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
    const lineas =
      Array.isArray(orden.detallePreparacion) && orden.detallePreparacion.length > 0
        ? orden.detallePreparacion
            .map((l) => `  - ${l.cantidad}× ${l.productoNombre || 'Producto'}`)
            .join('\n')
        : `  - ${orden.productoNombre || 'Producto'}: ${orden.cantidad} unidades (total)`;
    const content = `
============================================================
           GRANDMA'S LIQUEURS - ORDEN DE PRODUCCION
============================================================

ID Orden:           #${String(orden.idOrden).padStart(4, '0')}
Productos (prep.):
${lineas}
Total unidades:     ${orden.cantidad}
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

    if (!formData.pedidoId) {
      toast.error('Seleccione un pedido en preparación');
      return;
    }

    if (!pedidoSeleccionado || productosPedidoDisponibles.length === 0) {
      toast.error('El pedido no tiene productos de preparación para esta orden');
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

    const insumosAUsar = consumoPlaneado.length > 0 ? consumoPlaneado : insumosSeleccionados;
    if (!insumosAUsar.length) {
      toast.error('Seleccione insumos para consumir en esta orden (manualmente o con «Seleccionar insumos rápidos»)');
      return;
    }

    try {
      const insumosAUsar = consumoPlaneado.length > 0 ? consumoPlaneado : insumosSeleccionados;
      const ordenCreada = await api.produccion.create({
        pedidoId: formData.pedidoId,
        productorId: formData.productorId,
        fechaInicio: formData.fechaInicio,
        tiempoPreparacion: formData.tiempoPreparacion,
        estado: 'pendiente',
        consumoInsumos: insumosAUsar,
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
        {!esProductor ? (
          <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
            Nueva Orden
          </Button>
        ) : null}
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
          <div className="grid grid-cols-2 gap-4">
            <div className="relative produccion-pedido-picker">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                ID Orden (Pedido) *
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={busquedaPedido}
                  onChange={(e) => {
                    setBusquedaPedido(e.target.value);
                    setMostrarListaPedidos(true);
                  }}
                  onFocus={() => setMostrarListaPedidos(true)}
                  placeholder="Busca por ID de pedido en preparación..."
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base"
                  required
                />
              </div>
              {mostrarListaPedidos && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {pedidosFiltrados.length > 0 ? (
                    <>
                      <div className="bg-primary/10 px-4 py-2 border-b border-border font-medium text-sm">
                        {busquedaPedido.trim() === ''
                          ? `Todos los pedidos en preparación (${pedidosFiltrados.length})`
                          : `${pedidosFiltrados.length} pedido(s) encontrado(s)`}
                      </div>
                      {pedidosFiltrados.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => void seleccionarPedido(p)}
                          className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-primary" />
                                <span className="font-medium">Pedido #{String(p.id).padStart(4, '0')}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Entrega: {p.fechaEntrega}
                              </div>
                            </div>
                            <Plus className="w-5 h-5 text-primary" />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="px-4 py-3 text-muted-foreground text-sm text-center">No se encontraron pedidos</div>
                  )}
                </div>
              )}
            </div>

            <div className="relative produccion-productor-picker">
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
              {mostrarListaProductores && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {productoresFiltrados.length > 0 ? (
                    productoresFiltrados.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => seleccionarProductor(p)}
                        className="px-3 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                      >
                        <div className="font-medium">
                          {p.nombre} {p.apellido}
                        </div>
                        <div className="text-sm text-muted-foreground">ID: {p.id}</div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-muted-foreground text-sm">No se encontraron productores</div>
                  )}
                </div>
              )}
            </div>

            <div className="col-span-2 rounded-lg border border-border p-4 space-y-2">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Productos a preparar *
              </label>
              {!formData.pedidoId || !pedidoSeleccionado ? (
                <p className="text-sm text-muted-foreground">Seleccione un pedido para ver los productos de preparación.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {productosPedidoDisponibles.map((p) => {
                    const ln = pedidoSeleccionado.productos.find((x) => Number(x.productoId) === Number(p.id));
                    const c = Math.max(0, Number(ln?.cantidad ?? 0));
                    if (c <= 0) return null;
                    return (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <span className="font-medium">{p.nombre}</span>
                        <span className="tabular-nums text-muted-foreground">{c} u.</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="col-span-2 rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-medium">Insumos entregados al productor</label>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={sugerenciaCargando || !formData.pedidoId || !formData.productorId}
                  onClick={() => void handleSeleccionarInsumosRapidos()}
                >
                  {sugerenciaCargando ? 'Calculando…' : 'Seleccionar insumos rápidos'}
                </Button>
              </div>
              {!formData.productorId ? (
                <p className="text-sm text-muted-foreground">Asigne un productor para ver su inventario de insumos.</p>
              ) : insumosResumenProductor.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este productor no tiene insumos con saldo. Registre una entrega de insumos antes de producir.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto border border-border rounded-md p-3 bg-white space-y-2 text-sm">
                  {insumosResumenProductor.map((row) => {
                    const seleccionado = insumosSeleccionados.find(i => i.clave === row.clave);
                    const cantidad = seleccionado?.cantidad || 0;
                    return (
                      <div
                        key={row.clave}
                        className="flex items-center gap-3 py-2 px-2 border-b border-border/50 last:border-0 rounded hover:bg-muted/30"
                      >
                        <input
                          type="checkbox"
                          checked={!!seleccionado}
                          onChange={(e) => {
                            if (e.target.checked) {
                              toggleInsumoSeleccionado(row, 1);
                            } else {
                              toggleInsumoSeleccionado(row, 0);
                            }
                          }}
                          className="w-4 h-4 accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">{row.insumo_nombre || 'Insumo'}</span>
                          <span className="text-xs text-muted-foreground">
                            Disponible: {row.disponible} {row.unidad}
                          </span>
                        </div>
                        {seleccionado && (
                          <input
                            type="number"
                            min="0"
                            max={row.disponible || 0}
                            value={cantidad}
                            onChange={(e) => {
                              const newVal = Math.max(0, Math.min(Number(e.target.value) || 0, row.disponible || 0));
                              toggleInsumoSeleccionado(row, newVal);
                            }}
                            placeholder="Cantidad"
                            className="w-20 px-2 py-1 border border-border rounded text-xs text-center"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {insumosSeleccionados.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-foreground">Insumos seleccionados para esta orden</p>
                  <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 bg-muted/20 space-y-1 text-sm">
                    {insumosSeleccionados.map((c) => (
                      <div key={c.clave} className="flex justify-between gap-2">
                        <span>{c.insumo_nombre}</span>
                        <span className="tabular-nums shrink-0 font-medium">
                          {c.cantidad} {c.unidad}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {consumoPlaneado.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-foreground">Consumo para esta orden (receta IA)</p>
                  <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 bg-muted/20 space-y-1 text-sm">
                    {consumoPlaneado.map((c) => (
                      <div key={c.clave} className="flex justify-between gap-2">
                        <span>{c.insumo_nombre}</span>
                        <span className="tabular-nums shrink-0">
                          {c.cantidad} {c.unidad}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="col-span-2 rounded-lg border border-border bg-accent/30 p-3 text-sm text-muted-foreground">
              La orden se asocia al pedido seleccionado y se asigna a un productor.
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
                <label className="text-sm text-muted-foreground">Resumen productos</label>
                <p className="mt-1">{selectedOrden.productoNombre}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Total unidades (preparación)</label>
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
              <h4 className="text-sm font-medium">Productos a preparar (pedido)</h4>
              {Array.isArray(selectedOrden.detallePreparacion) && selectedOrden.detallePreparacion.length > 0 ? (
                <ul className="space-y-2 rounded-lg border border-border p-3 text-sm">
                  {selectedOrden.detallePreparacion.map((line, idx) => (
                    <li
                      key={`${line.productoId}-${idx}`}
                      className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0"
                    >
                      <span className="font-medium">{line.productoNombre || `Producto #${line.productoId}`}</span>
                      <span className="tabular-nums text-muted-foreground">{line.cantidad} u.</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Detalle por producto no disponible para esta orden (registros anteriores a la actualización).
                </p>
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
