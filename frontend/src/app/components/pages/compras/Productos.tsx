import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Eye, Edit, Trash2 } from 'lucide-react';
import { api } from '../../../services/api';
import type { Producto, Categoria } from '../../../services/types';
import { INSUMO_UNIDADES_API } from '../../../services/types';
import { formatMoneyInput, parseMoneyInput, MAX_MONEY_DIGITS } from '../../../services/mappers';
import { toast } from '../../AlertDialog';

/** Mensaje claro para el usuario; oculta errores técnicos del servidor. */
const mensajeErrorGuardarProducto = (error: unknown, modo: 'editar' | 'nuevo'): string => {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const tecnico = /before initialization|is not defined|referenceerror|internal server error/i.test(raw);

  if (tecnico || !raw.trim()) {
    return modo === 'editar'
      ? 'No se pudieron guardar los cambios. Revisa los datos e inténtalo de nuevo; si el problema continúa, recarga la página.'
      : 'No se pudo registrar el producto. Revisa los datos e inténtalo de nuevo; si el problema continúa, recarga la página.';
  }

  return raw;
};

export function Productos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  /** Evita usar solo `selectedProducto` para el formulario: puede quedar de otras vistas y mostrar campo de precio por error. */
  const [productoFormularioModo, setProductoFormularioModo] = useState<'nuevo' | 'editar'>('nuevo');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEstadoModalOpen, setIsEstadoModalOpen] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [productoEstadoPendiente, setProductoEstadoPendiente] = useState<{
    producto: Producto;
    nuevoEstado: 'activo' | 'inactivo';
  } | null>(null);
  const [motivoEstado, setMotivoEstado] = useState('');
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [alertState, setAlertState] = useState({
    isOpen: false
  });

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    categoriaId: 0,
    typo: 'terminado' as 'terminado' | 'de preparacion' | 'insumo',
    precioVenta: 0,
    stockMinimo: 0,
    estado: 'activo' as 'activo' | 'inactivo',
    insumoUnidadMedida: 'Unidades' as string,
    insumoCantidadMedida: 1,
  });
  const [precioVentaInput, setPrecioVentaInput] = useState('');
  const [imagenArchivo, setImagenArchivo] = useState<File | null>(null);
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const [nombreErrorApi, setNombreErrorApi] = useState<string | undefined>();

  const [searchQuery, setSearchQuery] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('Todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos');

  useEffect(() => {
    cargarDatos();
  }, []);

  const normalizeInsumoUnidadMedida = (u: string | null | undefined): string => {
    const s = String(u || '').trim();
    if (INSUMO_UNIDADES_API.includes(s as (typeof INSUMO_UNIDADES_API)[number])) return s;
    if (s === 'Litros') return 'Mililitros';
    return 'Unidades';
  };

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [productosData, categoriasData] = await Promise.all([
        api.productos.getAll(),
        api.categorias.getAll()
      ]);
      setProductos(productosData);
      setCategorias(categoriasData.filter(c => c.estado === 'activo'));
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

  const etiquetaTipoProducto = (tipo: 'terminado' | 'de preparacion' | 'insumo') => {
    if (tipo === 'de preparacion') return 'de preparación';
    if (tipo === 'insumo') return 'insumo';
    return 'terminado';
  };

  const productoIdEnFormulario =
    productoFormularioModo === 'editar' ? selectedProducto?.id : undefined;

  // Validar nombre único (mismo criterio que el backend: nombre + tipo)
  const validarNombreUnico = (
    nombre: string,
    tipo: 'terminado' | 'de preparacion' | 'insumo',
    idActual?: number
  ) => {
    const normalizado = nombre.trim().toLowerCase();
    if (!normalizado) return true;
    const existe = productos.some(
      (p) =>
        p.nombre.trim().toLowerCase() === normalizado &&
        p.typo === tipo &&
        p.id !== idActual
    );
    return !existe;
  };

  const errorNombreProducto = useMemo(() => {
    const nombre = formData.nombre.trim();
    if (!nombre) return nombreErrorApi;
    if (!validarNombreUnico(nombre, formData.typo, productoIdEnFormulario)) {
      return `Ya existe un producto con el nombre "${nombre}" de tipo ${etiquetaTipoProducto(formData.typo)}. Elija otro nombre.`;
    }
    return nombreErrorApi;
  }, [
    formData.nombre,
    formData.typo,
    productos,
    productoIdEnFormulario,
    nombreErrorApi,
  ]);

  // Filtrar productos
  const productosFiltrados = useMemo(() => (
    productos.filter(p => {
      const categoria = categorias.find(c => c.id === p.categoriaId);

      const matchBusqueda = searchQuery.length < 2 ||
        p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.descripcion.toLowerCase().includes(searchQuery.toLowerCase()) ||
        categoria?.nombre.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCategoria = filtroCategoria === 'Todos' ||
        categoria?.id.toString() === filtroCategoria;

      const matchEstado = filtroEstado === 'Todos' ||
        (filtroEstado === 'Activo' && p.estado === 'activo') ||
        (filtroEstado === 'Inactivo' && p.estado === 'inactivo');

      const matchTipo = filtroTipo === 'Todos' || p.typo === filtroTipo;

      return matchBusqueda && matchCategoria && matchEstado && matchTipo;
    })
  ), [productos, categorias, searchQuery, filtroCategoria, filtroEstado, filtroTipo]);

  const columns: Column[] = [
    { key: 'nombre', label: 'Producto' },
    {
      key: 'categoriaId',
      label: 'Categoría',
      render: (categoriaId: number) => {
        const categoria = categorias.find(c => c.id === categoriaId);
        return categoria?.nombre || 'Sin categoría';
      }
    },
    {
      key: 'typo',
      label: 'Tipo',
      render: (typo: string) => (
        <span
          className={`px-2 py-1 rounded-full text-xs ${
            typo === 'terminado'
              ? 'bg-blue-100 text-blue-700'
              : typo === 'insumo'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-purple-100 text-purple-700'
          }`}
        >
          {typo === 'terminado' ? 'Terminado' : typo === 'insumo' ? 'Insumo' : 'De Preparación'}
        </span>
      )
    },
    {
      key: 'precioVenta',
      label: 'Precio',
      render: (precio: number, row: Producto) =>
        row.typo === 'insumo' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatCurrency(precio)
        ),
    },
    {
      key: 'stock',
      label: 'Stock',
      render: (stock: number, row: Producto) => (
        <span className={stock <= row.stockMinimo ? 'text-red-600 font-medium' : ''}>
          {stock} {stock <= row.stockMinimo && '⚠️'}
        </span>
      )
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: any, row: Producto) => (
        <select
          value={row.estado}
          onChange={(e) => handleEstadoChange(row, e.target.value as 'activo' | 'inactivo')}
          className="px-3 py-1 rounded-full text-xs border-0 cursor-pointer"
          style={{
            backgroundColor: row.estado === 'activo' ? '#dcfce7' : '#fee2e2',
            color: row.estado === 'activo' ? '#166534' : '#991b1b'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      )
    }
  ];

  const handleEstadoChange = (producto: Producto, nuevoEstado: 'activo' | 'inactivo') => {
    if (producto.estado === nuevoEstado) return;
    setProductoEstadoPendiente({ producto, nuevoEstado });
    setMotivoEstado('');
    setIsEstadoModalOpen(true);
  };

  const confirmarCambioEstado = async () => {
    if (!productoEstadoPendiente) return;

    if (motivoEstado.length < 10 || motivoEstado.length > 50) {
      toast.error('Error de validación', {
        description: 'El motivo debe tener entre 10 y 50 caracteres'
      });
      return;
    }

    try {
      await api.productos.changeEstado(
        productoEstadoPendiente.producto.id,
        productoEstadoPendiente.nuevoEstado,
        motivoEstado
      );

      toast.success('Estado actualizado', {
        description: `Producto ${
          productoEstadoPendiente.nuevoEstado === 'activo' ? 'activado' : 'inactivado'
        } exitosamente`
      });

      setIsEstadoModalOpen(false);
      setMotivoEstado('');
      setProductoEstadoPendiente(null);
      cargarDatos();
    } catch (error: any) {
      toast.error('Error al cambiar estado', { description: error.message });
      cargarDatos();
    }
  };

  const cerrarModalProductoFormulario = () => {
    setIsModalOpen(false);
    setProductoFormularioModo('nuevo');
    setNombreErrorApi(undefined);
    setImagenArchivo(null);
    setImagenPreview(null);
  };

  const handleImagenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setImagenArchivo(null);
      setImagenPreview(null);
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Formato no permitido', { description: 'Use JPG, PNG o WEBP' });
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagen muy grande', { description: 'El tamaño máximo es 2 MB' });
      e.target.value = '';
      return;
    }
    setImagenArchivo(file);
    setImagenPreview(URL.createObjectURL(file));
  };

  const handleAdd = () => {
    setSelectedProducto(null);
    setProductoFormularioModo('nuevo');
    setFormData({
      nombre: '',
      descripcion: '',
      categoriaId: 0,
      typo: 'terminado',
      precioVenta: 0,
      stockMinimo: 0,
      estado: 'activo',
      insumoUnidadMedida: 'Unidades',
      insumoCantidadMedida: 1,
    });
    setPrecioVentaInput('');
    setNombreErrorApi(undefined);
    setImagenArchivo(null);
    setImagenPreview(null);
    setIsModalOpen(true);
  };

  const handleEdit = (producto: Producto) => {
    if (producto.estado === 'inactivo') {
      toast.warning('Producto inactivo', {
        description: 'No se puede editar un producto inactivo. Reactivelo primero.',
      });
      return;
    }
    setSelectedProducto(producto);
    setProductoFormularioModo('editar');
    setFormData({
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      categoriaId: producto.categoriaId,
      typo: producto.typo,
      precioVenta: producto.precioVenta,
      stockMinimo:
        producto.typo === 'insumo'
          ? Math.max(0, Math.floor(Number(producto.stockMinimo ?? 0)))
          : producto.stockMinimo,
      estado: producto.estado,
      insumoUnidadMedida: normalizeInsumoUnidadMedida(producto.insumoUnidadMedida),
      insumoCantidadMedida:
        producto.typo === 'insumo'
          ? Math.max(1, Math.round(Number(producto.insumoCantidadMedida) || 1))
          : producto.insumoCantidadMedida != null && Number.isFinite(producto.insumoCantidadMedida)
            ? producto.insumoCantidadMedida
            : 1,
    });
    setPrecioVentaInput(formatMoneyInput(Number(producto.precioVenta ?? 0)));
    setNombreErrorApi(undefined);
    setImagenArchivo(null);
    setImagenPreview(producto.imagenUrl || null);
    setIsModalOpen(true);
  };

  const handleDelete = (producto: Producto) => {
    setSelectedProducto(producto);
    setMotivoEliminacion('');
    setAlertState({ isOpen: true });
  };

  const confirmarEliminacion = async () => {
    if (!selectedProducto) return;

    if (motivoEliminacion.length < 10 || motivoEliminacion.length > 50) {
      toast.error('Error de validación', {
        description: 'El motivo debe tener entre 10 y 50 caracteres'
      });
      return;
    }

    try {
      await api.productos.delete(selectedProducto.id, motivoEliminacion);

      toast.success('Producto eliminado', {
        description: 'El producto ha sido eliminado exitosamente'
      });

      setAlertState({ isOpen: false });
      setMotivoEliminacion('');
      setSelectedProducto(null);
      cargarDatos();
    } catch (error: any) {
      const descripcion = String(error?.message || '').trim();
      const titulo = descripcion.toLowerCase().startsWith('no se puede eliminar')
        ? 'No se puede eliminar el producto'
        : 'Error al eliminar producto';
      toast.error(titulo, { description: descripcion || 'No se pudo eliminar el producto' });
    }
  };

  const handleView = (producto: Producto) => {
    setSelectedProducto(producto);
    setIsDetailModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const precioDesdeInput = parseMoneyInput(precioVentaInput);
    const precioVentaNormalizado =
      productoFormularioModo === 'editar' ||
      (productoFormularioModo === 'nuevo' && formData.typo === 'de preparacion')
        ? precioDesdeInput
        : formData.precioVenta;

    const requierePrecioEnFormulario =
      productoFormularioModo === 'editar' ||
      (productoFormularioModo === 'nuevo' && formData.typo === 'de preparacion');

    if (errorNombreProducto) {
      return;
    }

    if (formData.categoriaId === 0) {
      toast.error('Error de validación', {
        description: 'Debe seleccionar una categoría'
      });
      return;
    }

    if (requierePrecioEnFormulario && precioVentaInput.trim() === '') {
      toast.error('Error de validación', {
        description: 'El precio de venta es obligatorio'
      });
      return;
    }

    if (requierePrecioEnFormulario && String(precioVentaNormalizado).replace(/\D/g, '').length > MAX_MONEY_DIGITS) {
      toast.error('Error de validación', {
        description: `El precio no puede superar ${MAX_MONEY_DIGITS} dígitos`,
      });
      return;
    }

    if (requierePrecioEnFormulario && precioVentaNormalizado < 0) {
      toast.error('Error de validación', {
        description: 'El precio no puede ser negativo'
      });
      return;
    }

    if (productoFormularioModo === 'nuevo' && formData.typo === 'de preparacion' && precioVentaNormalizado <= 0) {
      toast.error('Error de validación', {
        description: 'Indique un precio de venta mayor a 0 para producto de preparación',
      });
      return;
    }

    if ((formData.typo === 'terminado' || formData.typo === 'insumo') && formData.stockMinimo < 0) {
      toast.error('Error de validación', {
        description: 'El stock mínimo no puede ser negativo'
      });
      return;
    }

    if (formData.typo === 'insumo') {
      if (!INSUMO_UNIDADES_API.includes(formData.insumoUnidadMedida as (typeof INSUMO_UNIDADES_API)[number])) {
        toast.error('Error de validación', { description: 'Seleccione una unidad de presentación válida' });
        return;
      }
      const med = Number(formData.insumoCantidadMedida);
      if (!Number.isInteger(med) || med < 1) {
        toast.error('Error de validación', {
          description: 'El volumen / unidad debe ser un número entero mayor o igual a 1',
        });
        return;
      }
    }

    try {
      let productoId: number | undefined;
      if (productoFormularioModo === 'editar' && selectedProducto) {
        productoId = selectedProducto.id;
        await api.productos.update(selectedProducto.id, {
          ...formData,
          precioVenta: precioVentaNormalizado,
          stockMinimo: formData.typo === 'de preparacion' ? 0 : formData.stockMinimo,
        }, 'Actualización de datos');

        toast.success('Producto actualizado', {
          description: 'Los datos del producto han sido actualizados exitosamente'
        });
      } else {
        productoId = await api.productos.create({
          ...formData,
          stockMinimo: formData.typo === 'de preparacion' ? 0 : formData.stockMinimo,
          precioVenta: formData.typo === 'de preparacion' ? precioVentaNormalizado : 0,
          precioCompra: 0,
          ganancia: 0
        });

        toast.success('Producto creado', {
          description: 'El producto ha sido creado exitosamente con stock inicial 0'
        });
      }

      if (imagenArchivo && productoId) {
        try {
          await api.productos.uploadImagen(productoId, imagenArchivo);
        } catch (uploadError: unknown) {
          const uploadMsg =
            uploadError instanceof Error ? uploadError.message : 'No se pudo guardar la imagen del producto.';
          toast.error('Imagen no guardada', { description: uploadMsg });
          if (import.meta.env.DEV) {
            console.error('Error al subir imagen de producto', uploadError);
          }
          cerrarModalProductoFormulario();
          cargarDatos();
          return;
        }
      }

      cerrarModalProductoFormulario();
      cargarDatos();
    } catch (error: unknown) {
      const esEdicion = productoFormularioModo === 'editar';
      const raw = error instanceof Error ? error.message : String(error ?? '');
      if (/ya existe un producto/i.test(raw)) {
        setNombreErrorApi(
          `Ya existe un producto con el nombre "${formData.nombre.trim()}" de tipo ${etiquetaTipoProducto(formData.typo)}. Elija otro nombre.`
        );
        return;
      }
      toast.error(esEdicion ? 'No se pudo actualizar el producto' : 'No se pudo crear el producto', {
        description: mensajeErrorGuardarProducto(error, esEdicion ? 'editar' : 'nuevo'),
      });
      if (import.meta.env.DEV) {
        console.error(esEdicion ? 'Error al actualizar producto' : 'Error al crear producto', error);
      }
    }
  };

  // Spinner solo en la carga inicial: en recargas la UI permanece para no perder foco al buscar.
  if (loading && productos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando productos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Productos</h2>
          <p className="text-muted-foreground">Administra el catálogo de productos</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Producto
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
              placeholder="Buscar ..."
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px] text-gray-500"
            >
              <option value="Todos">Filtrar por categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id.toString()}>{c.nombre}</option>
              ))}
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[120px] text-gray-500"
            >
              <option value="Todos">Filtrar por estado</option>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px] text-gray-500"
            >
              <option value="Todos">Filtrar por tipo</option>
              <option value="terminado">Terminado</option>
              <option value="de preparacion">De preparación</option>
              <option value="insumo">Insumo</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setFiltroCategoria('Todos');
                setFiltroEstado('Todos');
                setFiltroTipo('Todos');
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
        data={productosFiltrados}
        actions={[
          {
            label: 'Ver',
            icon: <Eye className="w-4 h-4" />,
            onClick: handleView,
            variant: 'default'
          },
          {
            label: 'Editar',
            icon: <Edit className="w-4 h-4" />,
            onClick: handleEdit,
            variant: 'default',
            disabled: (row: Producto) => row.estado === 'inactivo',
            disabledTitle: 'No se puede editar un producto inactivo. Reactivelo primero.',
          },
          {
            label: 'Eliminar',
            icon: <Trash2 className="w-4 h-4" />,
            onClick: handleDelete,
            variant: 'danger'
          }
        ]}
      />

      {/* Modal Nuevo/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={cerrarModalProductoFormulario}
        title={productoFormularioModo === 'editar' ? 'Editar Producto' : 'Nuevo Producto'}
      >
        <Form onSubmit={handleSubmit}>
          <FormField
            label="Nombre del Producto"
            name="nombre"
            value={formData.nombre}
            onChange={(value) => {
              setNombreErrorApi(undefined);
              setFormData({ ...formData, nombre: value as string });
            }}
            placeholder="Ej: Licor de Café Artesanal"
            required
            error={errorNombreProducto}
            helperText={
              errorNombreProducto
                ? undefined
                : 'El nombre debe ser único dentro del mismo tipo (terminado, preparación o insumo).'
            }
          />

          <FormField
            label="Descripción"
            name="descripcion"
            type="textarea"
            value={formData.descripcion}
            onChange={(value) => setFormData({ ...formData, descripcion: value as string })}
            placeholder="Descripción del producto"
            required
            minLength={10}
            maxLength={50}
          />

          <div className="space-y-2">
            <label htmlFor="imagenProducto" className="block text-sm font-medium">
              Imagen del producto
            </label>
            <input
              id="imagenProducto"
              name="imagenProducto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImagenChange}
              className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground"
            />
            <p className="text-xs text-muted-foreground">JPG, PNG o WEBP. Máximo 2 MB.</p>
            {imagenPreview && (
              <img
                src={imagenPreview}
                alt="Vista previa"
                className="mt-2 h-32 w-32 object-cover rounded-lg border border-border"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Categoría"
              name="categoriaId"
              type="select"
              value={formData.categoriaId.toString()}
              onChange={(value) => setFormData({ ...formData, categoriaId: parseInt(value as string) })}
              options={[
                { value: '0', label: 'Seleccione una categoría' },
                ...categorias.map(c => ({
                  value: c.id.toString(),
                  label: c.nombre
                }))
              ]}
              required
            />

            <FormField
              label="Tipo"
              name="typo"
              type="select"
              value={formData.typo}
              disabled={productoFormularioModo === 'editar'}
              onChange={(value) => {
                const next = value as 'terminado' | 'de preparacion' | 'insumo';
                setNombreErrorApi(undefined);
                setFormData({
                  ...formData,
                  typo: next,
                  stockMinimo: next === 'de preparacion' ? 0 : formData.stockMinimo,
                  insumoUnidadMedida: next === 'insumo' ? formData.insumoUnidadMedida || 'Unidades' : 'Unidades',
                  insumoCantidadMedida:
                    next === 'insumo'
                      ? (formData.insumoUnidadMedida || 'Unidades') === 'Unidades'
                        ? 1
                        : formData.insumoCantidadMedida || 1
                      : 1,
                });
              }}
              options={[
                { value: 'terminado', label: 'Terminado' },
                { value: 'de preparacion', label: 'De Preparación' },
                { value: 'insumo', label: 'Insumo' },
              ]}
              required
            />
          </div>

          {formData.typo === 'insumo' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                label="Unidad de presentación"
                name="insumoUnidadMedida"
                type="select"
                selectPlaceholder={false}
                value={formData.insumoUnidadMedida}
                onChange={(v) => {
                  const unidad = v as string;
                  setFormData({
                    ...formData,
                    insumoUnidadMedida: unidad,
                    insumoCantidadMedida: unidad === 'Unidades' ? 1 : formData.insumoCantidadMedida,
                  });
                }}
                options={INSUMO_UNIDADES_API.map((u) => ({ value: u, label: u }))}
                required
              />
              <FormField
                label="Volumen / unidad"
                name="insumoCantidadMedida"
                type="number"
                value={
                  formData.insumoUnidadMedida === 'Unidades'
                    ? 1
                    : formData.insumoCantidadMedida === 0
                      ? ''
                      : formData.insumoCantidadMedida
                }
                onChange={(value) => {
                  if (formData.insumoUnidadMedida === 'Unidades') return;
                  const raw = String(value ?? '').trim();
                  if (raw === '') {
                    setFormData({ ...formData, insumoCantidadMedida: 0 });
                    return;
                  }
                  const n = parseInt(raw, 10);
                  if (Number.isFinite(n) && n >= 0) {
                    setFormData({ ...formData, insumoCantidadMedida: n });
                  }
                }}
                min={1}
                step={1}
                disabled={formData.insumoUnidadMedida === 'Unidades'}
                required
              />
              <FormField
                label="Stock mínimo"
                name="stockMinimo"
                type="number"
                value={formData.stockMinimo === 0 ? '' : formData.stockMinimo}
                onChange={(value) => {
                  const num = parseInt(value as string) || 0;
                  if (num < 0) {
                    toast.warning('No se permiten números negativos');
                    return;
                  }
                  setFormData({ ...formData, stockMinimo: num });
                }}
                min={0}
                required
              />
            </div>
          )}

          <div
            className={`grid gap-4 ${
              (productoFormularioModo === 'editar' ||
                (productoFormularioModo === 'nuevo' && formData.typo === 'de preparacion')) &&
              formData.typo === 'terminado'
                ? 'sm:grid-cols-2'
                : 'grid-cols-1'
            }`}
          >
            {(productoFormularioModo === 'editar' ||
              (productoFormularioModo === 'nuevo' && formData.typo === 'de preparacion')) && (
              <div className="space-y-2">
                <label htmlFor="precioVenta" className="block">
                  Precio de Venta <span className="text-destructive">*</span>
                </label>
                <input
                  id="precioVenta"
                  name="precioVenta"
                  type="text"
                  inputMode="numeric"
                  value={precioVentaInput}
                  onChange={(e) => {
                    const num = parseMoneyInput(e.target.value);
                    setPrecioVentaInput(formatMoneyInput(num));
                    setFormData({
                      ...formData,
                      precioVenta: num,
                    });
                  }}
                  placeholder="Ingrese el precio de venta"
                  className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  required
                />
              </div>
            )}

            {formData.typo === 'terminado' && (
              <FormField
                label="Stock Mínimo"
                name="stockMinimo"
                type="number"
                value={formData.stockMinimo === 0 ? '' : formData.stockMinimo}
                onChange={(value) => {
                  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 6);
                  const num = digits ? Number(digits) : 0;
                  setFormData({ ...formData, stockMinimo: num });
                }}
                min={0}
                required
              />
            )}
          </div>

          {productoFormularioModo === 'nuevo' && formData.typo === 'insumo' && (
            <p className="text-xs text-muted-foreground bg-amber-50/80 p-3 rounded-lg border border-amber-200">
              ℹ️ Producto insumo: el precio de venta no aplica (no se vende al cliente). El stock inicia en 0 y aumenta
              con compras a proveedor. En la tabla de gestión el precio se muestra vacío hasta que exista costo por
              compra.
            </p>
          )}

          <FormField
            label="Estado"
            name="estado"
            type="select"
            value={formData.estado}
            onChange={(value) => setFormData({ ...formData, estado: value as any })}
            options={[
              { value: 'activo', label: 'Activo' },
              { value: 'inactivo', label: 'Inactivo' }
            ]}
            required
          />

          <FormActions>
            <Button variant="outline" type="button" onClick={() => cerrarModalProductoFormulario()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={Boolean(errorNombreProducto)}>
              {productoFormularioModo === 'editar' ? 'Actualizar' : 'Crear'} Producto
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedProducto(null);
        }}
        title="Detalle de Producto"
        size="lg"
      >
        {selectedProducto && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Nombre</p>
                <p className="font-medium">{selectedProducto.nombre}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categoría</p>
                <p className="font-medium">
                  {categorias.find(c => c.id === selectedProducto.categoriaId)?.nombre || 'Sin categoría'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Descripción</p>
                <p className="font-medium">{selectedProducto.descripcion}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    selectedProducto.typo === 'terminado'
                      ? 'bg-blue-100 text-blue-700'
                      : selectedProducto.typo === 'insumo'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {selectedProducto.typo === 'terminado'
                    ? 'Terminado'
                    : selectedProducto.typo === 'insumo'
                      ? 'Insumo'
                      : 'De Preparación'}
                </span>
              </div>
              {selectedProducto.typo === 'insumo' && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Presentación (volumen / unidad)</p>
                  <p className="font-medium">
                    {selectedProducto.insumoCantidadMedida != null &&
                    selectedProducto.insumoUnidadMedida != null &&
                    selectedProducto.insumoUnidadMedida !== ''
                      ? `${selectedProducto.insumoCantidadMedida} ${selectedProducto.insumoUnidadMedida}`
                      : '—'}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Precio de Compra</p>
                <p className="font-medium">
                  {selectedProducto.typo === 'insumo' ? '—' : formatCurrency(selectedProducto.precioCompra)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Precio de Venta</p>
                <p className="font-medium">
                  {selectedProducto.typo === 'insumo' ? '—' : formatCurrency(selectedProducto.precioVenta)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ganancia</p>
                <p className="font-medium">{selectedProducto.typo === 'insumo' ? '—' : `${selectedProducto.ganancia}%`}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stock Actual</p>
                <p className={`font-medium ${selectedProducto.stock <= selectedProducto.stockMinimo ? 'text-red-600' : ''}`}>
                  {selectedProducto.stock} {selectedProducto.stock <= selectedProducto.stockMinimo && '⚠️ Bajo'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stock Mínimo</p>
                <p className="font-medium">{selectedProducto.stockMinimo}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedProducto.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedProducto.estado === 'activo' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>

            {/* Historial de cambios */}
            {selectedProducto.historialCambios && selectedProducto.historialCambios.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium mb-3">Historial de Modificaciones</h4>
                <div className="space-y-2">
                  {selectedProducto.historialCambios.map((cambio, index) => (
                    <div key={index} className="p-3 bg-accent/30 rounded-lg text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium">{cambio.accion}</span>
                        <span className="text-muted-foreground text-xs">
                          {new Date(cambio.fecha).toLocaleString('es-CO')}
                        </span>
                      </div>
                      {cambio.motivo && (
                        <p className="text-muted-foreground">{cambio.motivo}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedProducto(null);
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
          setMotivoEstado('');
          setProductoEstadoPendiente(null);
        }}
        title="Cambiar Estado de Producto"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Está a punto de cambiar el estado del producto{' '}
            <strong>{productoEstadoPendiente?.producto.nombre}</strong> a{' '}
            <strong>
              {productoEstadoPendiente?.nuevoEstado === 'activo' ? 'Activo' : 'Inactivo'}
            </strong>
            .
          </p>

          <FormField
            label="Motivo del cambio"
            name="motivo"
            type="textarea"
            value={motivoEstado}
            onChange={(value) => setMotivoEstado(value as string)}
            placeholder="Ingrese el motivo del cambio de estado (10-50 caracteres)"
            required
            minLength={10}
            maxLength={50}
          />

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setIsEstadoModalOpen(false);
                setMotivoEstado('');
                setProductoEstadoPendiente(null);
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

      {/* Modal Eliminación */}
      <Modal
        isOpen={alertState.isOpen}
        onClose={() => {
          setAlertState({ isOpen: false });
          setMotivoEliminacion('');
          setSelectedProducto(null);
        }}
        title="Confirmar Eliminación de Producto"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>¡Advertencia!</strong> Está a punto de eliminar el producto{' '}
              <strong>{selectedProducto?.nombre}</strong>.
            </p>
            <p className="text-sm text-red-700 mt-2">
              Esta acción no se puede deshacer.
            </p>
          </div>

          <FormField
            label="Motivo de la eliminación"
            name="motivoEliminacion"
            type="textarea"
            value={motivoEliminacion}
            onChange={(value) => setMotivoEliminacion(value as string)}
            placeholder="Ingrese el motivo de la eliminación (10-50 caracteres)"
            required
            minLength={10}
            maxLength={50}
          />

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                setAlertState({ isOpen: false });
                setMotivoEliminacion('');
                setSelectedProducto(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarEliminacion}>
              Confirmar Eliminación
            </Button>
          </FormActions>
        </div>
      </Modal>
    </div>
  );
}

