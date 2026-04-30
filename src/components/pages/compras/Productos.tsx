import React, { useEffect, useMemo, useState } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Search, RotateCcw } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { productos as productosAPI, categorias as categoriasAPI } from '../../../services/api';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  categoria_id: number;
  descripcion?: string;
  precio: number;
  stock: number;
  stock_minimo: number;
  imagen_url: string;
  estado: 'Activo' | 'Inactivo';
}

interface Categoria {
  id: number;
  nombre: string;
  estado: 'Activo' | 'Inactivo';
}

interface ProductFilters {
  categoria: string;
  estado: '' | 'Activo' | 'Inactivo';
  precioMin: string;
  precioMax: string;
}

interface ProductStateChangeRequest {
  producto: Producto;
  to: 'Activo' | 'Inactivo';
}

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No fue posible leer la imagen seleccionada'));
    reader.readAsDataURL(file);
  });

export function Productos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [filters, setFilters] = useState<ProductFilters>({
    categoria: '',
    estado: '',
    precioMin: '',
    precioMax: '',
  });
  const [pendingStateChange, setPendingStateChange] = useState<ProductStateChangeRequest | null>(null);
  const [stateChangeReason, setStateChangeReason] = useState('');
  const [stateChangeSaving, setStateChangeSaving] = useState(false);
  const [imageSourceMode, setImageSourceMode] = useState<'url' | 'archivo'>('url');
  const [uploadedImageName, setUploadedImageName] = useState('');
  const { showAlert, AlertComponent } = useAlertDialog();

  const [formData, setFormData] = useState({
    nombre: '',
    categoria_id: 0,
    descripcion: '',
    precio: 0,
    stock_minimo: 0,
    imagen_url: '',
  });

  useEffect(() => {
    void loadProductos();
    void loadCategorias();
  }, []);

  const loadProductos = async () => {
    try {
      setLoading(true);
      const data = await productosAPI.getAll();
      setProductos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar productos:', error);
      showAlert({
        title: 'Error',
        description: 'No se pudieron cargar los productos.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCategorias = async () => {
    try {
      const data = await categoriasAPI.getAll();
      setCategorias(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar categorias:', error);
    }
  };

  const categoriasActivas = useMemo(
    () =>
      categorias.filter((categoria) => {
        const estado = String(categoria.estado || '').trim().toLowerCase();
        return estado === 'activo';
      }),
    [categorias]
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);

  const productosVisibles = useMemo(() => {
    const min = filters.precioMin.trim() ? Number(filters.precioMin) : null;
    const max = filters.precioMax.trim() ? Number(filters.precioMax) : null;

    return productos.filter((producto) => {
      const byCategoria = !filters.categoria || String(producto.categoria_id) === filters.categoria;
      const byEstado = !filters.estado || producto.estado === filters.estado;
      const byMin = min === null || Number.isNaN(min) || producto.precio >= min;
      const byMax = max === null || Number.isNaN(max) || producto.precio <= max;
      return byCategoria && byEstado && byMin && byMax;
    });
  }, [filters, productos]);

  const columns: Column[] = [
    { key: 'nombre', label: 'Producto' },
    { key: 'categoria', label: 'Categoria' },
    {
      key: 'precio',
      label: 'Precio',
      render: (precio: number) => formatCurrency(precio),
    },
    {
      key: 'stock',
      label: 'Stock',
      render: (stock: number, row: Producto) => (
        <span className={stock < row.stock_minimo ? 'text-destructive' : ''}>
          {stock} {stock < row.stock_minimo ? '⚠️' : ''}
        </span>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (estado: string, producto: Producto) => (
        <select
          value={estado}
          onChange={(event) =>
            openStateChangeModal(producto, event.target.value as 'Activo' | 'Inactivo')
          }
          disabled={stateChangeSaving}
          className={`min-h-8 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
      ),
    },
  ];

  const handleAdd = () => {
    setSelectedProducto(null);
    setImageSourceMode('url');
    setUploadedImageName('');
    setFormData({
      nombre: '',
      categoria_id: 0,
      descripcion: '',
      precio: 0,
      stock_minimo: 0,
      imagen_url: '',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (producto: Producto) => {
    setSelectedProducto(producto);
    setImageSourceMode('url');
    setUploadedImageName('');
    setFormData({
      nombre: producto.nombre,
      categoria_id: producto.categoria_id,
      descripcion: producto.descripcion || '',
      precio: producto.precio,
      stock_minimo: producto.stock_minimo,
      imagen_url: producto.imagen_url || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = (producto: Producto) => {
    showAlert({
      title: 'Confirmar eliminacion',
      description: `¿Estas seguro de eliminar el producto "${producto.nombre}"?`,
      type: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        try {
          await productosAPI.delete(Number(producto.id));
          await loadProductos();
          showAlert({
            title: 'Exito',
            description: 'Producto eliminado correctamente.',
            type: 'success',
            confirmText: 'Entendido',
            onConfirm: () => {},
          });
        } catch (error: any) {
          showAlert({
            title: 'Error',
            description: error?.message || 'No se pudo eliminar el producto.',
            type: 'danger',
            confirmText: 'Entendido',
            onConfirm: () => {},
          });
        }
      },
    });
  };

  const handleView = (producto: Producto) => {
    setSelectedProducto(producto);
    setIsDetailModalOpen(true);
  };

  const openStateChangeModal = (producto: Producto, to: 'Activo' | 'Inactivo') => {
    if (producto.estado === to) return;
    setPendingStateChange({ producto, to });
    setStateChangeReason('');
  };

  const confirmStateChange = async () => {
    if (!pendingStateChange) return;

    if (stateChangeReason.trim().length < 10) {
      showAlert({
        title: 'Motivo requerido',
        description: 'El motivo del cambio de estado debe tener al menos 10 caracteres.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      setStateChangeSaving(true);
      await productosAPI.updateStatus(Number(pendingStateChange.producto.id), {
        estado: pendingStateChange.to,
        motivo: stateChangeReason.trim(),
      });

      await loadProductos();
      setPendingStateChange(null);
      setStateChangeReason('');

      showAlert({
        title: 'Estado actualizado',
        description: 'El estado del producto se actualizo correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } catch (error: any) {
      showAlert({
        title: 'Error',
        description: error?.message || 'No se pudo actualizar el estado del producto.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setStateChangeSaving(false);
    }
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showAlert({
        title: 'Archivo invalido',
        description: 'Selecciona un archivo de imagen valido.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      setUploadedImageName(file.name);
      setFormData((current) => ({ ...current, imagen_url: dataUrl }));
    } catch (error: any) {
      showAlert({
        title: 'Error',
        description: error?.message || 'No se pudo procesar la imagen seleccionada.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.categoria_id) {
      showAlert({
        title: 'Categoria requerida',
        description: 'Debes seleccionar una categoria activa para el producto.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      const payload = {
        nombre: formData.nombre,
        categoria_id: Number(formData.categoria_id),
        descripcion: formData.descripcion,
        precio: selectedProducto ? Number(formData.precio) : 0,
        stock_minimo: Number(formData.stock_minimo),
        imagen_url: formData.imagen_url || undefined,
      };

      if (selectedProducto) {
        await productosAPI.update(Number(selectedProducto.id), payload);
      } else {
        await productosAPI.create(payload);
      }

      await loadProductos();
      setIsModalOpen(false);
      showAlert({
        title: 'Exito',
        description: `Producto ${selectedProducto ? 'actualizado' : 'creado'} correctamente.`,
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } catch (error: any) {
      showAlert({
        title: 'Error',
        description: error?.message || 'No se pudo guardar el producto.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    }
  };

  return (
    <div className="space-y-6">
      {AlertComponent}

      <div className="flex items-center justify-between">
        <div>
          <h2>Gestion de Productos</h2>
          <p className="text-muted-foreground">Administra el inventario de productos</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Producto
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={filters.precioMin || filters.precioMax ? `${filters.precioMin || '0'} - ${filters.precioMax || '...'} ` : ''}
              readOnly
              placeholder="Rango de precio"
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg text-muted-foreground"
            />
          </div>
          <Button
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setFilters({ categoria: '', estado: '', precioMin: '', precioMax: '' })}
            disabled={!filters.categoria && !filters.estado && !filters.precioMin.trim() && !filters.precioMax.trim()}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          <select
            value={filters.categoria}
            onChange={(event) => setFilters((current) => ({ ...current, categoria: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Categoria (todas)</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={String(categoria.id)}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          <select
            value={filters.estado}
            onChange={(event) =>
              setFilters((current) => ({ ...current, estado: event.target.value as ProductFilters['estado'] }))
            }
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Estado (todos)</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
          <input
            type="number"
            min={0}
            value={filters.precioMin}
            onChange={(event) => setFilters((current) => ({ ...current, precioMin: event.target.value }))}
            placeholder="Precio min"
            className="h-8 w-32 rounded-md border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="number"
            min={0}
            value={filters.precioMax}
            onChange={(event) => setFilters((current) => ({ ...current, precioMax: event.target.value }))}
            placeholder="Precio max"
            className="h-8 w-32 rounded-md border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando productos...</div>
      ) : (
        <DataTable
          columns={columns}
          data={productosVisibles}
          actions={[
            commonActions.view(handleView),
            commonActions.edit(handleEdit),
            commonActions.delete(handleDelete),
          ]}
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedProducto ? 'Editar Producto' : 'Nuevo Producto'}
        size="lg"
      >
        <Form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FormField
                label="Nombre del Producto"
                name="nombre"
                value={formData.nombre}
                onChange={(value) => setFormData((current) => ({ ...current, nombre: value as string }))}
                placeholder="Ej: Whisky Jack Daniels 750ml"
                required
              />
            </div>

            <FormField
              label="Categoria"
              name="categoria_id"
              type="select"
              value={formData.categoria_id}
              onChange={(value) => setFormData((current) => ({ ...current, categoria_id: Number(value) }))}
              options={categoriasActivas.map((categoria) => ({
                value: categoria.id,
                label: categoria.nombre,
              }))}
              required
            />

            {selectedProducto ? (
              <FormField
                label="Precio de venta"
                name="precio"
                type="number"
                value={formData.precio}
                onChange={(value) => setFormData((current) => ({ ...current, precio: Number(value) }))}
                required
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Precio de venta</p>
                <p className="mt-1 text-xs">
                  Se asigna al <strong>recibir una compra</strong>: indica el costo unitario y el % de ganancia en la orden
                  de compra.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <p className="font-medium">📦 Stock Inicial</p>
              <p className="mt-1 text-xs">
                El stock se gestiona automáticamente desde <strong>Compras</strong>. Siempre inicia en 0.
              </p>
            </div>

            <FormField
              label="Stock Minimo"
              name="stock_minimo"
              type="number"
              value={formData.stock_minimo}
              onChange={(value) => setFormData((current) => ({ ...current, stock_minimo: Number(value) }))}
              required
            />

            <div className="col-span-2">
              <FormField
                label="Descripcion"
                name="descripcion"
                type="textarea"
                value={formData.descripcion}
                onChange={(value) => setFormData((current) => ({ ...current, descripcion: value as string }))}
                rows={2}
                placeholder="Descripcion del producto"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 bg-accent/20 space-y-3">
            <p className="text-sm font-medium">Imagen del producto</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={imageSourceMode === 'url' ? 'primary' : 'outline'}
                onClick={() => setImageSourceMode('url')}
              >
                Usar URL
              </Button>
              <Button
                type="button"
                variant={imageSourceMode === 'archivo' ? 'primary' : 'outline'}
                onClick={() => setImageSourceMode('archivo')}
              >
                Subir archivo local
              </Button>
            </div>

            {imageSourceMode === 'url' ? (
              <FormField
                label="Imagen URL"
                name="imagen_url"
                type="text"
                value={formData.imagen_url}
                onChange={(value) => setFormData((current) => ({ ...current, imagen_url: value as string }))}
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            ) : (
              <div className="space-y-2">
                <label htmlFor="producto-imagen-file" className="text-sm font-medium block">
                  Archivo de imagen
                </label>
                <input
                  id="producto-imagen-file"
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="w-full px-3 py-1.5 text-sm bg-input-background border border-border rounded-lg"
                />
                {uploadedImageName ? <p className="text-xs text-muted-foreground">Archivo: {uploadedImageName}</p> : null}
              </div>
            )}

            {formData.imagen_url ? (
              <div className="rounded-md border border-border p-2 inline-block">
                <img
                  src={formData.imagen_url}
                  alt="Vista previa"
                  className="h-24 w-24 object-cover rounded"
                  onError={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ) : null}
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">{selectedProducto ? 'Actualizar' : 'Crear'} Producto</Button>
          </FormActions>
        </Form>
      </Modal>

      <Modal
        isOpen={Boolean(pendingStateChange)}
        onClose={() => {
          if (stateChangeSaving) return;
          setPendingStateChange(null);
          setStateChangeReason('');
        }}
        title={`Cambiar estado - ${pendingStateChange?.producto.nombre || ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-accent/30 p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Estado actual: {pendingStateChange?.producto.estado || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Nuevo estado: {pendingStateChange?.to || 'N/A'}</p>
          </div>

          <FormField
            label="Motivo"
            name="motivo-cambio-estado-producto"
            type="textarea"
            value={stateChangeReason}
            onChange={(value) => setStateChangeReason(String(value))}
            rows={3}
            required
            placeholder="Describe por que se realiza el cambio de estado (minimo 10 caracteres)"
          />

          <FormActions>
            <Button
              variant="outline"
              onClick={() => {
                if (stateChangeSaving) return;
                setPendingStateChange(null);
                setStateChangeReason('');
              }}
              disabled={stateChangeSaving}
            >
              Cancelar
            </Button>
            <Button onClick={confirmStateChange} disabled={stateChangeSaving}>
              {stateChangeSaving ? 'Guardando...' : 'Confirmar cambio'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedProducto(null);
        }}
        title={`Detalle de Producto - ${selectedProducto?.nombre || ''}`}
        size="lg"
      >
        {selectedProducto ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Nombre del Producto</p>
                <p>{selectedProducto.nombre}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categoria</p>
                <p>{selectedProducto.categoria}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Precio</p>
                <p>{formatCurrency(selectedProducto.precio)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stock Actual</p>
                <p className={selectedProducto.stock < selectedProducto.stock_minimo ? 'text-destructive' : ''}>
                  {selectedProducto.stock} {selectedProducto.stock < selectedProducto.stock_minimo ? '⚠️' : ''}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stock Minimo</p>
                <p>{selectedProducto.stock_minimo}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span
                  className={`px-3 py-1 rounded-full text-xs ${
                    selectedProducto.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {selectedProducto.estado}
                </span>
              </div>
            </div>
            {selectedProducto.imagen_url ? (
              <div className="rounded-lg border border-border p-3 inline-block">
                <img src={selectedProducto.imagen_url} alt={selectedProducto.nombre} className="h-32 w-32 object-cover rounded" />
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
