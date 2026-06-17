import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Calendar, Search, Package, User } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from '../../AlertDialog';
import { useAuth } from '../../AuthContext';
import type { EntregaInsumo, Usuario } from '../../../services/types';
import { formatEntityCode, formatQuantityDisplay } from '../../../services/mappers';

function esRolProductor(u: Usuario) {
  return /^productor$/i.test(String(u.rol || '').trim());
}

function etiquetaProductorEnLista(u: Usuario) {
  const nombre = `${u.nombre} ${u.apellido}`.trim();
  return u.estado === 'activo' ? nombre : `${nombre} (Inactivo)`;
}

interface EntregaInsumoView extends EntregaInsumo {
  productorNombre?: string;
}

type CatalogoInsumoEntrega = {
  productoCatalogoId?: number;
  presentacionCantidad?: number | null;
  presentacionUnidad?: string | null;
  unidad: string;
};

/** Cantidad mostrada en tabla: unidades de entrega o ml totales (u. × ml/u.). */
function cantidadEntregaParaTabla(
  cantidadUnidades: number,
  entrega: Pick<EntregaInsumo, 'unidad' | 'productoCatalogoId'>,
  catalogo: CatalogoInsumoEntrega[]
): { cantidad: number; unidad: string } {
  const cat =
    entrega.productoCatalogoId != null
      ? catalogo.find((c) => c.productoCatalogoId === entrega.productoCatalogoId)
      : undefined;
  const pu = String(cat?.presentacionUnidad || '').trim();
  const pq = cat?.presentacionCantidad;
  if (/mililitro/i.test(pu) && pq != null && pq > 0) {
    return {
      cantidad: Number((cantidadUnidades * pq).toFixed(4)),
      unidad: 'Mililitros',
    };
  }
  if (/mililitro/i.test(String(entrega.unidad || ''))) {
    return { cantidad: cantidadUnidades, unidad: 'Mililitros' };
  }
  return {
    cantidad: cantidadUnidades,
    unidad: cat?.unidad || entrega.unidad || 'Unidades',
  };
}

export function EntregaInsumos() {
  const { user } = useAuth();
  const esProductor = String(user?.rol || '').trim().toLowerCase() === 'productor';
  const [entregas, setEntregas] = useState<EntregaInsumoView[]>([]);
  const [catalogoInsumos, setCatalogoInsumos] = useState<
    (CatalogoInsumoEntrega & {
      id: number;
      nombre: string;
      estado: 'activo' | 'inactivo';
    })[]
  >([]);
  const [productores, setProductores] = useState<Usuario[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnularModalOpen, setIsAnularModalOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<EntregaInsumoView | null>(null);
  const [motivo, setMotivo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroProductor, setFiltroProductor] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [cantidadEntrega, setCantidadEntrega] = useState('1');
  const [formData, setFormData] = useState({
    insumoId: 0,
    productoCatalogoId: 0,
    productorId: 0,
    fecha: new Date().toISOString().split('T')[0],
    hora: new Date().toTimeString().slice(0, 5),
  });
  // Buscadores y dropdowns con el patron del select "Producto *" de Nueva
  // Compra para los campos "Insumo (catalogo)" y "Productor".
  const [busquedaInsumo, setBusquedaInsumo] = useState('');
  const [busquedaProductor, setBusquedaProductor] = useState('');
  const [mostrarListaInsumos, setMostrarListaInsumos] = useState(false);
  const [mostrarListaProductores, setMostrarListaProductores] = useState(false);

  useEffect(() => {
    if (!user) return;
    void cargarDatos();
  }, [user?.id, user?.rol]);

  // Cerrar las listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.entrega-insumo-picker')) {
        setMostrarListaInsumos(false);
      }
      if (!target.closest('.entrega-productor-picker')) {
        setMostrarListaProductores(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  const cargarDatos = async () => {
    try {
      const entregasData = await api.entregasInsumos.getAll();
      const usuariosData = esProductor ? [] : await api.usuarios.getAll();
      const insumosInv = esProductor ? [] : await api.insumos.getAll();

      setCatalogoInsumos(
        insumosInv.map((i) => {
          const esMl = i.presentacionUnidad === 'Mililitros';
          return {
            id: i.id,
            nombre: i.nombre,
            unidad: esMl ? 'Mililitros' : String(i.unidad || 'Unidades'),
            presentacionCantidad: i.presentacionCantidad ?? null,
            presentacionUnidad: i.presentacionUnidad ?? null,
            estado: 'activo' as const,
            productoCatalogoId:
              i.productoRelacionadoId != null && i.productoRelacionadoId > 0
                ? i.productoRelacionadoId
                : undefined,
          };
        })
      );

      const listaProductores = usuariosData.filter(esRolProductor).sort((a, b) =>
        `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es', { sensitivity: 'base' })
      );
      setProductores(listaProductores);

      const entregasConInfo = entregasData.map((entrega) => {
        const productor = usuariosData.find((u) => u.id === entrega.operarioId);
        const nombreApi = (entrega as EntregaInsumoView).productorNombre;
        return {
          ...entrega,
          productorNombre: nombreApi || (productor ? `${productor.nombre} ${productor.apellido}` : 'Desconocido'),
        };
      });

      setEntregas(entregasConInfo);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al cargar datos';
      toast.error('No se pudieron cargar las entregas', { description: msg });
      if (import.meta.env.DEV) {
        console.error('EntregaInsumos cargarDatos', error);
      }
    }
  };

  const columns: Column[] = [
    {
      key: 'id',
      label: 'ID',
      render: (value: number) => formatEntityCode('E', value)
    },
    {
      key: 'insumo',
      label: 'Insumo'
    },
    {
      key: 'cantidad',
      label: 'Cantidad',
      render: (cantidad: number, row: EntregaInsumoView) => {
        const { cantidad: c, unidad } = cantidadEntregaParaTabla(cantidad, row, catalogoInsumos);
        const decimals = Number.isInteger(c) ? 0 : 2;
        const n = formatQuantityDisplay(c, decimals);
        return `${n} ${unidad}`;
      },
    },
    {
      key: 'productorNombre',
      label: 'Productor',
    },
    {
      key: 'fecha',
      label: 'Fecha'
    },
    {
      key: 'hora',
      label: 'Hora'
    },
    {
      key: 'anulada',
      label: 'Estado',
      render: (_: boolean, row: EntregaInsumoView) => (
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            row.anulada ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {row.anulada ? 'Anulada' : 'Activa'}
        </span>
      ),
    },
  ];

  const handleAdd = () => {
    setFormData({
      insumoId: 0,
      productoCatalogoId: 0,
      productorId: 0,
      fecha: new Date().toISOString().split('T')[0],
      hora: new Date().toTimeString().slice(0, 5),
    });
    setCantidadEntrega('1');
    setBusquedaInsumo('');
    setBusquedaProductor('');
    setMostrarListaInsumos(false);
    setMostrarListaProductores(false);
    setIsModalOpen(true);
  };

  // Filtrado y seleccion para los buscadores tipo "Producto *" de Nueva Compra
  const insumosFiltradosForm = catalogoInsumos.filter((i) => {
    const term = busquedaInsumo.trim().toLowerCase();
    if (!term) return true;
    return (
      i.nombre.toLowerCase().includes(term) ||
      String(i.id).includes(term) ||
      i.unidad.toLowerCase().includes(term)
    );
  });

  const productoresFiltradosForm = productores.filter((p) => {
    const term = busquedaProductor.trim().toLowerCase();
    if (!term) return true;
    const full = `${p.nombre} ${p.apellido}`.toLowerCase();
    return full.includes(term) || String(p.id).includes(term);
  });

  const seleccionarInsumoForm = (insumo: {
    id: number;
    nombre: string;
    unidad: string;
    productoCatalogoId?: number;
  }) => {
    setFormData({
      ...formData,
      insumoId: insumo.id,
      productoCatalogoId: insumo.productoCatalogoId ?? 0,
    });
    setBusquedaInsumo(`${insumo.nombre} (${insumo.unidad})`);
    setMostrarListaInsumos(false);
  };

  const seleccionarProductorForm = (productor: Usuario) => {
    setFormData({ ...formData, productorId: productor.id });
    setBusquedaProductor(etiquetaProductorEnLista(productor));
    setMostrarListaProductores(false);
  };

  const handleAnular = (entrega: EntregaInsumoView) => {
    setSelectedEntrega(entrega);
    setMotivo('');
    setIsAnularModalOpen(true);
  };

  const handleConfirmAnular = async () => {
    if (!selectedEntrega) return;

    if (motivo.length < 10 || motivo.length > 50) {
      toast.error('El motivo debe tener entre 10 y 50 caracteres');
      return;
    }

    try {
      await api.entregasInsumos.anular(selectedEntrega.id, motivo);
      const idAnulada = selectedEntrega.id;
      setEntregas((prev) =>
        prev.map((e) =>
          e.id === idAnulada ? { ...e, anulada: true, motivoAnulacion: motivo.trim() } : e
        )
      );
      toast.success('Entrega anulada exitosamente');
      setIsAnularModalOpen(false);
      setSelectedEntrega(null);
    } catch (error: any) {
      toast.error(error.message || 'Error al anular entrega');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.insumoId) {
      toast.error('Seleccione un insumo del catálogo');
      return;
    }

    const insSel = catalogoInsumos.find((i) => i.id === formData.insumoId);
    if (!insSel) {
      toast.error('El insumo seleccionado no está disponible (debe estar activo)');
      return;
    }

    const cq = parseInt(cantidadEntrega, 10);
    if (!Number.isFinite(cq) || cq < 1) {
      toast.error('La cantidad debe ser un entero mayor a 0');
      return;
    }

    if (!formData.productorId) {
      toast.error('Seleccione un productor');
      return;
    }

    if (!productores.some((p) => p.id === formData.productorId)) {
      toast.error('El productor seleccionado no está en la lista de usuarios con rol Productor');
      return;
    }

    try {
      await api.entregasInsumos.create({
        ...(formData.productoCatalogoId > 0
          ? { productoCatalogoId: formData.productoCatalogoId }
          : { insumoId: formData.insumoId }),
        unidad: insSel.unidad,
        cantidad: cq,
        operarioId: formData.productorId,
        fecha: formData.fecha,
        hora: formData.hora,
      });

      toast.success('Entrega de insumo registrada exitosamente');
      setIsModalOpen(false);
      cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al registrar entrega');
    }
  };

  const entregasFiltradas = entregas.filter(entrega => {
    const matchBusqueda =
      busqueda.length === 0 ||
      (busqueda.length >= 2 &&
        (entrega.insumo.toLowerCase().includes(busqueda.toLowerCase()) ||
          entrega.productorNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
          String(entrega.id).includes(busqueda)));

    const matchProductor = !filtroProductor || String(entrega.operarioId) === filtroProductor;
    const matchFecha = !filtroFecha || entrega.fecha === filtroFecha;

    return matchBusqueda && matchProductor && matchFecha;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Entrega de Insumos</h2>
          <p className="text-muted-foreground">
            {esProductor
              ? 'Historial de insumos entregados a su usuario (solo consulta)'
              : 'Registra entregas de insumos a usuarios con rol Productor'}
          </p>
        </div>
        {!esProductor ? (
          <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
            Nueva Entrega
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
              placeholder="Buscar ..."
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
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
            {!esProductor ? (
              <select
                value={filtroProductor}
                onChange={(e) => setFiltroProductor(e.target.value)}
                className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px] text-gray-500"
              >
                <option value="">Filtrar por productor</option>
                {productores.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {etiquetaProductorEnLista(p)}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroProductor('');
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
        data={entregasFiltradas}
        rowClassName={(row: EntregaInsumoView) => (row.anulada ? 'opacity-60' : undefined)}
        actions={
          esProductor
            ? []
            : [
                commonActions.cancel(handleAnular, {
                  disabled: (row: EntregaInsumoView) => !!row.anulada,
                  disabledTitle: 'La entrega ya está anulada',
                }),
              ]
        }
      />

      {/* Modal de formulario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Entrega de Insumo"
        size="lg"
      >
        <Form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            {/* Insumo (catalogo): mismo diseno que el select "Producto *" de
                Nueva Compra (buscador con dropdown de tarjetas). */}
            <div className="relative col-span-2 entrega-insumo-picker">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Insumo (catálogo) *
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={busquedaInsumo}
                  onChange={(e) => {
                    setBusquedaInsumo(e.target.value);
                    setMostrarListaInsumos(true);
                    if (formData.insumoId !== 0 || formData.productoCatalogoId !== 0) {
                      setFormData({ ...formData, insumoId: 0, productoCatalogoId: 0 });
                    }
                  }}
                  onFocus={() => setMostrarListaInsumos(true)}
                  placeholder="Busca por nombre, ID o unidad, o haz clic para ver todos los insumos..."
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base bg-white"
                  maxLength={60}
                  required
                />
              </div>
              {mostrarListaInsumos && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {insumosFiltradosForm.length > 0 ? (
                    <>
                      <div className="bg-primary/10 px-4 py-2 border-b border-border font-medium text-sm">
                        {busquedaInsumo.trim() === ''
                          ? `Todos los insumos (${insumosFiltradosForm.length})`
                          : `${insumosFiltradosForm.length} insumo(s) encontrado(s)`}
                      </div>
                      {insumosFiltradosForm.map((i) => (
                        <div
                          key={i.id}
                          onClick={() => seleccionarInsumoForm(i)}
                          className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-primary" />
                                <span className="font-medium">{i.nombre}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                ID: {i.id} | Unidad: {i.unidad}
                              </div>
                            </div>
                            <Plus className="w-5 h-5 text-primary" />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="px-4 py-3 text-muted-foreground text-sm text-center">
                      No se encontraron insumos
                    </div>
                  )}
                </div>
              )}
              {catalogoInsumos.length === 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  No hay insumos activos. Cree uno en el módulo Insumos primero.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="entrega-cantidad" className="block text-sm font-medium">
                Cantidad <span className="text-destructive">*</span>
              </label>
              <input
                id="entrega-cantidad"
                name="cantidad"
                type="number"
                min={1}
                step={1}
                value={cantidadEntrega}
                onChange={(e) => setCantidadEntrega(e.target.value)}
                placeholder="Unidades"
                className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 transition-all focus:ring-primary"
                required
              />
            </div>

            {/* Productor: mismo diseno que el select "Producto *" de Nueva
                Compra (buscador con dropdown de tarjetas). */}
            <div className="relative entrega-productor-picker">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <User className="w-4 h-4" />
                Productor *
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={busquedaProductor}
                  onChange={(e) => {
                    setBusquedaProductor(e.target.value);
                    setMostrarListaProductores(true);
                    if (formData.productorId !== 0) {
                      setFormData({ ...formData, productorId: 0 });
                    }
                  }}
                  onFocus={() => setMostrarListaProductores(true)}
                  placeholder="Busca por nombre o ID, o haz clic para ver todos los productores..."
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base bg-white"
                  maxLength={60}
                  required
                />
              </div>
              {mostrarListaProductores && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {productoresFiltradosForm.length > 0 ? (
                    <>
                      <div className="bg-primary/10 px-4 py-2 border-b border-border font-medium text-sm">
                        {busquedaProductor.trim() === ''
                          ? `Todos los productores (${productoresFiltradosForm.length})`
                          : `${productoresFiltradosForm.length} productor(es) encontrado(s)`}
                      </div>
                      {productoresFiltradosForm.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => seleccionarProductorForm(p)}
                          className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-primary" />
                                <span className="font-medium">
                                  {etiquetaProductorEnLista(p)}
                                </span>
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
                    <div className="px-4 py-3 text-muted-foreground text-sm text-center">
                      No se encontraron productores
                    </div>
                  )}
                </div>
              )}
            </div>
            {productores.length === 0 && (
              <p className="col-span-2 text-sm text-muted-foreground">
                No hay usuarios con rol Productor. Asigne el rol en Gestión de usuarios o Gestión de roles.
              </p>
            )}

            <FormField
              label="Fecha"
              name="fecha"
              type="date"
              value={formData.fecha}
              onChange={(value) => setFormData({ ...formData, fecha: value as string })}
              required
            />

            <FormField
              label="Hora"
              name="hora"
              type="time"
              value={formData.hora}
              onChange={(value) => setFormData({ ...formData, hora: value as string })}
              required
            />
          </div>

          <div className="p-4 bg-accent/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Al registrar esta entrega, la cantidad indicada se descuenta del stock en inventario de insumos
              (productos tipo insumo) y queda asignada al productor seleccionado.
            </p>
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Registrar Entrega
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de confirmación de anulación */}
      <Modal
        isOpen={isAnularModalOpen}
        onClose={() => setIsAnularModalOpen(false)}
        title="Anular Entrega de Insumo"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-700">
              ¿Está seguro de anular esta entrega? El registro permanecerá en la tabla y el stock en almacén se
              restaurará.
            </p>
            <p className="text-sm text-red-600 mt-2">
              <strong>Insumo:</strong> {selectedEntrega?.insumo}
            </p>
            <p className="text-sm text-red-600">
              <strong>Cantidad:</strong> {selectedEntrega?.cantidad} unidades
            </p>
          </div>

          <FormField
            label="Motivo de anulación"
            name="motivo"
            type="textarea"
            value={motivo}
            onChange={(value) => setMotivo(value as string)}
            placeholder="Ingrese el motivo de anulación (10-50 caracteres)"
            required
            minLength={10}
            maxLength={50}
          />

          <FormActions>
            <Button variant="outline" onClick={() => setIsAnularModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleConfirmAnular}>
              Anular
            </Button>
          </FormActions>
        </div>
      </Modal>
    </div>
  );
}

