import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions, openPrintablePdf } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormActions, FieldError, FieldSuccess } from '../../Form';
import { Button } from '../../Button';
import { Plus, FileText, Calendar, Search, Package, ShoppingCart } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import type { OrdenProduccion, Producto, Usuario, Pedido } from '../../../services/types';
import { formatEntityCode, pedidoEstadoUi } from '../../../services/mappers';
import { MotivoModal } from '../../MotivoModal';
import { AlertDialog } from '../../AlertDialog';
import { useAuth } from '../../AuthContext';

interface OrdenProduccionView extends OrdenProduccion {
  productoNombre?: string;
  productorNombre?: string;
}

/** Extrae id de catálogo desde clave `c:123` (entregas / resumen productor). */
function catalogoIdFromClave(clave: string): number | null {
  const m = String(clave || '').match(/^c:(\d+)$/i);
  return m ? Number(m[1]) : null;
}

type InsumoResumenRow = {
  clave?: string;
  unidad?: string;
  disponible?: number;
  disponible_unidades?: number;
  ml_por_unidad?: number;
};

/** Unidad de medida del insumo según catálogo (Unidades | Mililitros) o entrega. */
function etiquetaUnidadInsumo(row: InsumoResumenRow, insumosCatalogo: Producto[]): string {
  if (/mililitro/i.test(String(row.unidad || ''))) return 'Mililitros';
  const catId = catalogoIdFromClave(row.clave || '');
  if (catId != null) {
    const prod = insumosCatalogo.find((p) => p.id === catId);
    const medida = prod?.insumoUnidadMedida?.trim();
    if (medida === 'Mililitros' || medida === 'Unidades') return medida;
    if (medida) return medida;
  }
  const u = String(row.unidad || '').trim();
  if (/mililitro/i.test(u)) return 'Mililitros';
  if (u) return u;
  return 'Unidades';
}

/** ml por unidad de presentación (ej. 500 ml por botella). */
function mlPorUnidadInsumo(row: InsumoResumenRow, insumosCatalogo: Producto[]): number | null {
  if (row.ml_por_unidad != null && row.ml_por_unidad > 0) return row.ml_por_unidad;
  const catId = catalogoIdFromClave(row.clave || '');
  if (catId == null) return null;
  const prod = insumosCatalogo.find((p) => p.id === catId);
  if (prod?.insumoUnidadMedida !== 'Mililitros') return null;
  const q = prod.insumoCantidadMedida;
  return q != null && q > 0 ? q : null;
}

/** Saldo mostrado en UI: unidades o mililitros totales (10 u. × 500 ml = 5000 ml). */
function disponibleMostrar(row: InsumoResumenRow, insumosCatalogo: Producto[]): number {
  if (row.ml_por_unidad != null && row.disponible != null && /mililitro/i.test(String(row.unidad || ''))) {
    return Number(row.disponible);
  }
  const ml = mlPorUnidadInsumo(row, insumosCatalogo);
  if (ml) {
    const unidades =
      row.disponible_unidades != null ? Number(row.disponible_unidades) : Number(row.disponible ?? 0);
    return Number((unidades * ml).toFixed(4));
  }
  return Number(row.disponible ?? 0);
}

function formatoCantidadInsumo(n: number, unidad: string): string {
  if (/mililitro/i.test(unidad)) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function Produccion() {
  const { user } = useAuth();
  const esProductor = String(user?.rol || '').trim().toLowerCase() === 'productor';

  const [ordenes, setOrdenes] = useState<OrdenProduccionView[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  /** Catálogo de insumos (para unidad Mililitros / Unidades en el formulario Nueva orden). */
  const [insumosCatalogo, setInsumosCatalogo] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [productores, setProductores] = useState<Usuario[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
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
    (InsumoResumenRow & { clave: string; insumo_nombre?: string })[]
  >([]);
  /** Insumos seleccionados manualmente con sus cantidades. */
  const [insumosSeleccionados, setInsumosSeleccionados] = useState<
    { clave: string; insumo_nombre: string; cantidad: number; unidad: string }[]
  >([]);

  const toggleInsumoSeleccionado = (insumo: any, cantidad: number) => {
    const existente = insumosSeleccionados.find(i => i.clave === insumo.clave);
    if (existente) {
      if (cantidad <= 0) {
        // Eliminar si cantidad es 0 o menor
        setInsumosSeleccionados(insumosSeleccionados.filter(i => i.clave !== insumo.clave));
      } else {
        // Actualizar cantidad
        setInsumosSeleccionados(
          insumosSeleccionados.map(i =>
            i.clave === insumo.clave ? { ...i, cantidad } : i
          )
        );
      }
    } else if (cantidad > 0) {
      // Agregar nuevo
      setInsumosSeleccionados([
        ...insumosSeleccionados,
        {
          clave: insumo.clave,
          insumo_nombre: insumo.insumo_nombre || 'Insumo',
          cantidad,
          unidad: etiquetaUnidadInsumo(insumo, insumosCatalogo),
        }
      ]);
    } else if (cantidad === 0) {
      // Agregar con cantidad 0 para que aparezca el input
      setInsumosSeleccionados([
        ...insumosSeleccionados,
        {
          clave: insumo.clave,
          insumo_nombre: insumo.insumo_nombre || 'Insumo',
          cantidad: 0,
          unidad: etiquetaUnidadInsumo(insumo, insumosCatalogo),
        }
      ]);
    }
  };

  const handleToggleCheckbox = (insumo: any, isChecked: boolean) => {
    if (isChecked) {
      // Marcar: agregar con cantidad 0
      toggleInsumoSeleccionado(insumo, 0);
    } else {
      // Desmarcar: eliminar
      setInsumosSeleccionados(insumosSeleccionados.filter(i => i.clave !== insumo.clave));
    }
  };

  useEffect(() => {
    if (!isModalOpen || !formData.productorId) {
      setInsumosResumenProductor([]);
      setInsumosSeleccionados([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        console.log(`[Produccion] Fetching insumos para productorId=${formData.productorId}`);
        const rows = await api.produccion.getInsumosResumenProductor(formData.productorId);
        console.log(`[Produccion] Insumos obtenidos:`, rows);
        if (!cancelled) {
          const enriched = (Array.isArray(rows) ? rows : []).map((row) => ({
            ...row,
            unidad: etiquetaUnidadInsumo(row, insumosCatalogo),
          }));
          setInsumosResumenProductor(enriched);
        }
      } catch (error) {
        console.error(`[Produccion] Error al obtener insumos:`, error);
        if (!cancelled) setInsumosResumenProductor([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, formData.productorId, insumosCatalogo]);

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

      if (esProductor && user?.id) {
        const uid = Number(user.id);
        const [pedidosDisp, insumosInv] = await Promise.all([
          api.produccion.getPedidosDisponibles(),
          api.insumos.getAll().catch(() => [] as Awaited<ReturnType<typeof api.insumos.getAll>>),
        ]);
        const ordenesConInfo = ordenesData.map((orden) => ({
          ...orden,
          productoNombre: orden.productoNombre || 'Producto',
          productorNombre:
            orden.productorNombre || (user ? `${user.nombre} ${user.apellido}`.trim() : 'Asignado a mí'),
        }));
        setOrdenes(ordenesConInfo);
        setPedidos(pedidosDisp.map(mapPedidoDisponible));
        setInsumosCatalogo(
          insumosInv
            .filter((i) => i.estado === 'activo')
            .map((i) => ({
              id: i.productoRelacionadoId && i.productoRelacionadoId > 0 ? i.productoRelacionadoId : i.id,
              nombre: i.nombre,
              descripcion: i.descripcion || '',
              categoriaId: 0,
              typo: 'insumo' as const,
              precioVenta: 0,
              stockMinimo: i.stockMinimo ?? 0,
              estado: 'activo' as const,
              insumoUnidadMedida: i.presentacionUnidad || 'Unidades',
              insumoCantidadMedida: i.presentacionCantidad ?? 1,
            }))
        );
        setProductores([
          {
            id: uid,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.email || '',
            rol: 'Productor',
            estado: 'activo',
            tipoDocumento: 'CC',
            numeroDocumento: user.numeroDocumento || '',
            telefono: user.telefono || '',
          } as Usuario,
        ]);
        setProductos([]);
        return;
      }

      const [productosData, usuariosData, pedidosDisp] = await Promise.all([
        api.productos.getAll(),
        api.usuarios.getAll(),
        api.produccion.getPedidosDisponibles(),
      ]);

      const productoresData = usuariosData.filter((u) => u.rol === 'Productor' && u.estado === 'activo');
      setProductores(productoresData);
      setProductos(productosData.filter((p) => p.typo === 'de preparacion' && p.estado === 'activo'));
      setInsumosCatalogo(productosData.filter((p) => p.typo === 'insumo' && p.estado === 'activo'));
      setPedidos(pedidosDisp.map(mapPedidoDisponible));

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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al cargar datos';
      toast.error('No se pudieron cargar los datos de producción', { description: msg });
      if (import.meta.env.DEV) {
        console.error('Produccion cargarDatos', error);
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    void cargarDatos();
  }, [user?.id, user?.rol]);

  const mapPedidoDisponible = (p: {
    id: number;
    fecha?: string;
    fecha_entrega?: string;
    estado?: string;
    total?: number;
  }): Pedido => ({
    id: Number(p.id),
    clienteId: 0,
    fechaPedido: String(p.fecha || '').split('T')[0],
    fechaEntrega: String(p.fecha_entrega || '').split('T')[0],
    metodoPago: 'efectivo',
    porcentajeAbono: 100,
    total: Number(p.total) || 0,
    estado: pedidoEstadoUi(p.estado) as Pedido['estado'],
    productos: [],
  });

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
      const detalle = await api.produccion.getPedidoParaOrden(pedido.id);
      const disponibles = (detalle.productos || [])
        .filter((d) => Number(d.productoId) > 0)
        .map(
          (d) =>
            ({
              id: Number(d.productoId),
              nombre: d.nombre || `Producto #${d.productoId}`,
              descripcion: '',
              categoriaId: 0,
              typo: 'de preparacion',
              precioVenta: Number(d.precio) || 0,
              stockMinimo: 0,
              estado: 'activo',
            }) as Producto
        );
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
      setBusquedaPedido(formatEntityCode('P', pedido.id));
      setMostrarListaPedidos(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'No se pudo cargar el detalle del pedido seleccionado';
      toast.error('No se pudo seleccionar el pedido', { description: msg });
      if (import.meta.env.DEV) {
        console.error('Produccion seleccionarPedido', error);
      }
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
      render: (value: number) => formatEntityCode('O', value)
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
    const productorIdInicial = esProductor && user?.id ? Number(user.id) : 0;
    setFormData({
      pedidoId: 0,
      productorId: productorIdInicial,
      fechaInicio: fechaHoy,
      tiempoPreparacion: 60
    });
    setPedidoSeleccionado(null);
    setProductosPedidoDisponibles([]);
    setBusquedaPedido('');
    setBusquedaProductor(
      esProductor && user ? `${user.nombre} ${user.apellido}`.trim() : ''
    );
    setMostrarListaPedidos(false);
    setMostrarListaProductores(false);
    // Resetear validaciones
    setFechaValida(true); // Fecha de hoy es válida
    setTiempoValido(true); // 60 minutos es válido
    setInsumosResumenProductor([]);
    setInsumosSeleccionados([]);
    setIsModalOpen(true);
  };

  const handleViewDetail = (orden: OrdenProduccionView) => {
    setSelectedOrden(orden);
    setIsDetailModalOpen(true);
    void (async () => {
      try {
        const full = await api.produccion.getById(orden.id);
        setSelectedOrden((prev) =>
          prev && prev.id === orden.id
            ? {
                ...prev,
                ...full,
                productoNombre: prev.productoNombre || full.productoNombre,
                productorNombre: prev.productorNombre || full.productorNombre,
              }
            : prev
        );
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error al cargar detalle de orden', error);
        }
        toast.error('No se pudo cargar el detalle completo de la orden');
      }
    })();
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
    const lineasPrep =
      Array.isArray(orden.detallePreparacion) && orden.detallePreparacion.length > 0
        ? orden.detallePreparacion
            .map((l) => `${l.cantidad}× ${l.productoNombre || 'Producto'}`)
            .join('\n')
        : `${orden.productoNombre || 'Producto'}: ${orden.cantidad} unidades`;

    const estadoLabel =
      orden.estado === 'completada'
        ? 'Completada'
        : orden.estado === 'en proceso'
          ? 'En proceso'
          : orden.estado === 'pendiente'
            ? 'Pendiente'
            : orden.estado === 'cancelada'
              ? 'Cancelada'
              : orden.estado;

    const opened = openPrintablePdf({
      title: `Orden de producción ${formatEntityCode('O', orden.idOrden)}`,
      subtitle: `Generado el ${new Date().toLocaleString('es-CO')}`,
      sections: [
        {
          title: 'Datos de la orden',
          rows: [
            { label: 'Productor', value: orden.productorNombre || '—' },
            { label: 'Fecha inicio', value: orden.fechaInicio || '—' },
            { label: 'Tiempo preparación', value: `${orden.tiempoPreparacion ?? 0} minutos` },
            { label: 'Total unidades', value: orden.cantidad },
            { label: 'Estado', value: estadoLabel },
            ...(orden.pedidoId ? [{ label: 'Pedido vinculado', value: formatEntityCode('P', orden.pedidoId) }] : []),
          ],
        },
        {
          title: 'Productos (preparación)',
          text: lineasPrep,
        },
        ...(orden.motivoCancelacion
          ? [{ title: 'Motivo cancelación', text: orden.motivoCancelacion }]
          : []),
        {
          title: 'Firmas',
          text: 'Productor: _______________________\n\nSupervisor: _______________________',
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

    if (formData.tiempoPreparacion < 0 || formData.tiempoPreparacion > 120) {
      toast.error('El tiempo de preparación debe estar entre 0 y 120 minutos');
      return;
    }

    // Validar fecha no sea pasada
    const fechaHoy = new Date().toISOString().split('T')[0];
    if (formData.fechaInicio < fechaHoy) {
      toast.error('La fecha de inicio no puede ser una fecha pasada');
      return;
    }

    const insumosAUsar = insumosSeleccionados.filter((i) => Number(i.cantidad) > 0);
    if (!insumosAUsar.length) {
      toast.error('Seleccione insumos para consumir en esta orden de producción');
      return;
    }

    for (const item of insumosAUsar) {
      const row = insumosResumenProductor.find((r) => r.clave === item.clave);
      if (!row) continue;
      const maxDisp = disponibleMostrar(row, insumosCatalogo);
      if (Number(item.cantidad) > maxDisp + 1e-6) {
        const unidad = etiquetaUnidadInsumo(row, insumosCatalogo);
        toast.error(`Cantidad excede el disponible para «${item.insumo_nombre}»`, {
          description: `Máximo ${formatoCantidadInsumo(maxDisp, unidad)} ${unidad}.`,
        });
        return;
      }
    }

    try {
      const ordenCreada = await api.produccion.create({
        pedidoId: formData.pedidoId,
        productorId: formData.productorId,
        fechaInicio: formData.fechaInicio,
        tiempoPreparacion: formData.tiempoPreparacion,
        estado: 'pendiente',
        consumoInsumos: insumosAUsar.map((i) => {
          const catId = catalogoIdFromClave(i.clave);
          return {
            clave: i.clave,
            insumo_nombre: i.insumo_nombre,
            cantidad: Number(i.cantidad),
            unidad: etiquetaUnidadInsumo(i, insumosCatalogo),
            ...(catId != null ? { producto_catalogo_id: catId } : {}),
          };
        }),
      });

      const productor = productores.find(p => p.id === formData.productorId);
      const nombreProductor = productor ? `${productor.nombre} ${productor.apellido}` : 'el productor';
      const ordenId = ordenCreada?.idOrden || 'XXXX';

      toast.success('Orden de producción creada exitosamente', {
        description: `Orden ${formatEntityCode('O', ordenId)} asignada a ${nombreProductor}. Estado: Pendiente.`
      });
      setIsModalOpen(false);
      cargarDatos();
    } catch (error: any) {
      const detalle =
        Array.isArray(error?.details) && error.details.length > 0
          ? error.details.map((d: { message?: string }) => d.message).filter(Boolean).join('; ')
          : '';
      toast.error(error.message || 'Error al crear orden', {
        description: detalle || undefined,
      });
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
              placeholder="Buscar ..."
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
                <strong>Orden:</strong> {formatEntityCode('O', produccionPending.orden.idOrden)}
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
                  maxLength={60}
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
                                <span className="font-medium">Pedido {formatEntityCode('P', p.id)}</span>
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
                  if (esProductor) return;
                  setBusquedaProductor(e.target.value);
                  setMostrarListaProductores(true);
                }}
                onFocus={() => {
                  if (!esProductor) setMostrarListaProductores(true);
                }}
                placeholder="Escribe ID, nombre o apellido..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                maxLength={60}
                readOnly={esProductor}
                required
              />
              {mostrarListaProductores && !esProductor && (
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
                        <span className="tabular-nums text-muted-foreground">{c} Unidades</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="col-span-2 rounded-lg border border-border p-4 space-y-3">
              <label className="block text-sm font-medium">Insumos entregados al productor</label>
              {!formData.productorId ? (
                <p className="text-sm text-muted-foreground">Asigne un productor para ver su inventario de insumos.</p>
              ) : insumosResumenProductor.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este productor no tiene insumos con saldo. Registre una entrega de insumos antes de producir.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto border border-border rounded-md p-3 bg-white space-y-3 text-sm">
                  {insumosResumenProductor.map((row) => {
                    const seleccionado = insumosSeleccionados.find(i => i.clave === row.clave);
                    const cantidad = seleccionado?.cantidad || 0;
                    const unidadLbl = etiquetaUnidadInsumo(row, insumosCatalogo);
                    const disponible = disponibleMostrar(row, insumosCatalogo);
                    const quedaría = Math.max(0, disponible - cantidad);
                    return (
                      <div
                        key={row.clave}
                        className="border border-border/40 rounded-lg p-3 space-y-2 hover:bg-muted/20 transition"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={!!seleccionado}
                            onChange={(e) => handleToggleCheckbox(row, e.target.checked)}
                            className="w-4 h-4 accent-primary mt-1 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold block text-foreground">{row.insumo_nombre || 'Insumo'}</span>
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                              <div className="bg-muted/30 p-2 rounded">
                                <div className="text-muted-foreground">Disponible</div>
                                <div className="font-mono font-semibold text-foreground">{formatoCantidadInsumo(disponible, unidadLbl)} {unidadLbl}</div>
                              </div>
                              {seleccionado && (
                                <>
                                  <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
                                    <div className="text-muted-foreground">A Consumir ({unidadLbl})</div>
                                    <input
                                      type="number"
                                      step={/mililitro/i.test(unidadLbl) ? '1' : '0.01'}
                                      min="0"
                                      max={disponible}
                                      value={cantidad === 0 ? '' : cantidad}
                                      onChange={(e) => {
                                        const inputVal = e.target.value;
                                        if (inputVal === '' || inputVal === undefined) {
                                          toggleInsumoSeleccionado(row, 0);
                                        } else {
                                          const newVal = parseFloat(inputVal);
                                          if (isNaN(newVal) || newVal < 0) {
                                            toggleInsumoSeleccionado(row, 0);
                                          } else {
                                            const clamped = Math.min(newVal, disponible);
                                            toggleInsumoSeleccionado(row, clamped);
                                          }
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const inputVal = e.target.value;
                                        if (inputVal === '' || inputVal === undefined) {
                                          toggleInsumoSeleccionado(row, 0);
                                        }
                                      }}
                                      placeholder="0"
                                      className="font-mono font-semibold w-full bg-transparent text-foreground outline-none"
                                    />
                                  </div>
                                  <div className="bg-green-50 dark:bg-green-950 p-2 rounded border border-green-200 dark:border-green-800">
                                    <div className="text-muted-foreground">Quedaría</div>
                                    <div className="font-mono font-semibold text-foreground">
                                      {formatoCantidadInsumo(quedaría, unidadLbl)} {unidadLbl}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {insumosSeleccionados.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    <p className="text-sm font-semibold text-foreground">Insumos para esta orden</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-blue-200 dark:border-blue-800 rounded-md p-3 bg-blue-50/50 dark:bg-blue-950/30 space-y-2">
                    {insumosSeleccionados.map((c, idx) => (
                      <div key={c.clave} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold">{idx + 1}</span>
                          <span className="font-medium">{c.insumo_nombre}</span>
                        </div>
                        <span className="font-mono bg-white dark:bg-slate-900 px-3 py-1 rounded border border-border">
                          {formatoCantidadInsumo(c.cantidad, etiquetaUnidadInsumo(c, insumosCatalogo))}{' '}
                          {etiquetaUnidadInsumo(c, insumosCatalogo)}
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
                type="text"
                inputMode="numeric"
                value={formData.tiempoPreparacion === 0 ? '0' : String(formData.tiempoPreparacion)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                  const value = digits === '' ? 0 : Math.min(120, Number(digits));
                  setFormData({ ...formData, tiempoPreparacion: value });
                  setTiempoValido(value >= 0 && value <= 120);
                }}
                placeholder="0–120"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                  tiempoValido === null ? 'border-border focus:ring-primary' :
                  tiempoValido ? 'border-green-500 ring-1 ring-green-500/20 focus:ring-green-500'
                               : 'border-destructive ring-1 ring-destructive/20 focus:ring-destructive'
                }`}
                required
              />
              {tiempoValido === false && (
                <div className="mt-1.5">
                  <FieldError>El tiempo debe estar entre 0 y 120 minutos.</FieldError>
                </div>
              )}
              {tiempoValido === true && (
                <p className="text-xs text-green-600 mt-1">✓ Tiempo válido ({formData.tiempoPreparacion} min)</p>
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
                <h3 className="text-lg">Orden {formatEntityCode('O', selectedOrden.idOrden)}</h3>
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
                <p className="mt-1">{formatEntityCode('O', selectedOrden.idOrden)}</p>
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
                      <span className="tabular-nums text-muted-foreground">{line.cantidad} Unidades</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Detalle por producto no disponible para esta orden (registros anteriores a la actualización).
                </p>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Insumos de la orden</h4>
              {Array.isArray(selectedOrden.insumosGastados) && selectedOrden.insumosGastados.length > 0 ? (
                <ul className="space-y-2 rounded-lg border border-border p-3 text-sm">
                  {selectedOrden.insumosGastados.map((ins, idx) => {
                    const cant = Number(ins.cantidad_descontada ?? ins.cantidad ?? 0);
                    const unidad = String(ins.unidad || 'Unidades').trim();
                    return (
                      <li
                        key={`${ins.insumo_nombre || 'insumo'}-${idx}`}
                        className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0"
                      >
                        <span className="font-medium">{ins.insumo_nombre || 'Insumo'}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatoCantidadInsumo(cant, unidad)} {unidad}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay insumos registrados para esta orden.
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

    </div>
  );
}
