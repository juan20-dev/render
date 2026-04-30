import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Modal } from '../../Modal';
import { Form, FormActions, FormField } from '../../Form';
import { ShoppingCart, Plus, Minus, Trash2, ShoppingBag, Check } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { clientes as clientesAPI, pedidos as pedidosAPI, productos as productosAPI } from '../../../services/api';
import { useAuth } from '../../AuthContext';
import { consumeTiendaIntent } from '../../../lib/tiendaIntent';

interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  imagen: string;
  descripcion: string;
  estado?: string;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

interface Cliente {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
}

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || !error) return undefined;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === 'number' ? maybeStatus : undefined;
};

export function TiendaCliente() {
  const { user } = useAuth();
  const { showAlert, AlertComponent } = useAlertDialog();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [isCarritoOpen, setIsCarritoOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('Todos');
  const [busqueda, setBusqueda] = useState('');

  const [datosEntrega, setDatosEntrega] = useState({
    direccion: '',
    telefono: '',
    observaciones: '',
    metodoPago: 'Efectivo' as 'Efectivo' | 'Transferencia' | 'Contraentrega',
    fechaEntrega: ''
  });

  const intentAppliedRef = useRef(false);

  const loadInitialData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const productosData = await productosAPI.getAll();

      const productosNormalizados = (Array.isArray(productosData) ? productosData : [])
        .filter((p: any) => p.estado === 'Activo')
        .map((p: any) => ({
          id: Number(p.id),
          nombre: p.nombre,
          categoria: p.categoria || 'General',
          precio: Number(p.precio || 0),
          stock: Number(p.stock || 0),
          imagen: p.imagen_url || '',
          descripcion: p.descripcion || '',
          estado: p.estado
        }));

      setProductos(productosNormalizados);

      try {
        const clienteData = (await clientesAPI.getByUsuarioId(user.id)) as Cliente;
        setCliente(clienteData);

        if ((clienteData as any)?.direccion) {
          setDatosEntrega((prev) => ({ ...prev, direccion: (clienteData as any).direccion }));
        }
        if ((clienteData as any)?.telefono) {
          setDatosEntrega((prev) => ({ ...prev, telefono: (clienteData as any).telefono }));
        }
      } catch (error) {
        const status = getHttpStatus(error);
        if (status === 404) {
          setCliente(null);
          showAlert({
            title: 'Perfil de cliente incompleto',
            description: 'Tu usuario tiene rol Cliente, pero no existe registro en la tabla de clientes. Puedes ver el catalogo, pero no crear pedidos hasta que se cree tu perfil cliente.',
            type: 'warning',
            confirmText: 'Entendido',
            onConfirm: () => {}
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error cargando tienda de cliente:', error);
      showAlert({
        title: 'No fue posible cargar la tienda',
        description: 'Verifica la conexion con el backend e intenta nuevamente.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [user?.id]);

  useEffect(() => {
    intentAppliedRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (loading || !user?.id || intentAppliedRef.current || productos.length === 0) return;
    const intent = consumeTiendaIntent();
    if (intent.addProductId == null && !intent.categoriaNombre) return;
    intentAppliedRef.current = true;

    if (intent.categoriaNombre) {
      const disponibles = new Set(productos.map((p) => p.categoria));
      if (disponibles.has(intent.categoriaNombre)) {
        setCategoriaFiltro(intent.categoriaNombre);
      }
    }

    if (intent.addProductId != null) {
      const p = productos.find((x) => x.id === intent.addProductId);
      if (p && (!p.estado || p.estado === 'Activo')) {
        setCarrito((prev) => {
          const existing = prev.find((i) => i.producto.id === p.id);
          if (existing) {
            if (existing.cantidad < p.stock) {
              return prev.map((i) =>
                i.producto.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i
              );
            }
            return prev;
          }
          if (p.stock > 0) {
            return [...prev, { producto: p, cantidad: 1 }];
          }
          return prev;
        });
        if (p.stock === 0) {
          showAlert({
            title: 'Sin stock',
            description: `${p.nombre} no tiene unidades disponibles en este momento.`,
            type: 'warning',
            confirmText: 'Entendido',
            onConfirm: () => {}
          });
        } else {
          setIsCarritoOpen(true);
        }
      }
    }
  }, [loading, user?.id, productos]);

  const categorias = useMemo(
    () => ['Todos', ...Array.from(new Set(productos.map((p) => p.categoria)))],
    [productos]
  );

  const productosFiltrados = useMemo(
    () =>
      productos.filter((p) => {
        const matchCategoria = categoriaFiltro === 'Todos' || p.categoria === categoriaFiltro;
        const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
        const activo = !p.estado || p.estado === 'Activo';
        const conStock = Number(p.stock) > 0;
        return matchCategoria && matchBusqueda && activo && conStock;
      }),
    [productos, categoriaFiltro, busqueda]
  );

  const agregarAlCarrito = (producto: Producto) => {
    const itemExistente = carrito.find((item) => item.producto.id === producto.id);

    if (itemExistente) {
      if (itemExistente.cantidad < producto.stock) {
        setCarrito(
          carrito.map((item) =>
            item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
          )
        );
      } else {
        showAlert({
          title: 'Stock insuficiente',
          description: `Solo hay ${producto.stock} unidades disponibles de ${producto.nombre}.`,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {}
        });
      }
      return;
    }

    setCarrito([...carrito, { producto, cantidad: 1 }]);
  };

  const actualizarCantidad = (productoId: number, nuevaCantidad: number) => {
    const item = carrito.find((i) => i.producto.id === productoId);
    if (!item) return;

    if (nuevaCantidad <= 0) {
      setCarrito(carrito.filter((i) => i.producto.id !== productoId));
      return;
    }

    if (nuevaCantidad > item.producto.stock) {
      showAlert({
        title: 'Stock insuficiente',
        description: `Solo hay ${item.producto.stock} unidades disponibles.`,
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    setCarrito(
      carrito.map((i) => (i.producto.id === productoId ? { ...i, cantidad: nuevaCantidad } : i))
    );
  };

  const calcularTotal = () =>
    carrito.reduce((total, item) => total + item.producto.precio * item.cantidad, 0);

  const realizarPedido = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cliente?.id) {
      showAlert({
        title: 'Cliente no encontrado',
        description: 'No se encontro el perfil cliente asociado al usuario autenticado.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (carrito.length === 0) {
      showAlert({
        title: 'Carrito vacio',
        description: 'Debes agregar al menos un producto para continuar.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (!datosEntrega.fechaEntrega?.trim()) {
      showAlert({
        title: 'Fecha de entrega',
        description: 'Indica la fecha en la que deseas recibir el pedido.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    try {
      setSubmitting(true);

      const detalles = carrito
        .map((item) => `${item.cantidad}x ${item.producto.nombre} (${datosEntrega.metodoPago})`)
        .join(', ');

      const payloadPedido = {
        cliente_id: cliente.id,
        fecha: new Date().toISOString().split('T')[0],
        fecha_entrega: datosEntrega.fechaEntrega.trim(),
        detalles: `${detalles}${datosEntrega.observaciones ? ` | Obs: ${datosEntrega.observaciones}` : ''}`,
        total: calcularTotal(),
        estado: 'Pendiente'
      };

      const createResult: any = await pedidosAPI.create(payloadPedido);
      const pedidoId = Number(createResult?.id);

      if (!pedidoId) {
        throw new Error('No se obtuvo el id del pedido creado');
      }

      await Promise.all(
        carrito.map((item) =>
          pedidosAPI.addProducto({
            pedidoId,
            productoId: item.producto.id,
            cantidad: item.cantidad,
            precioUnitario: item.producto.precio
          })
        )
      );

      showAlert({
        title: 'Pedido creado',
        description: `Pedido #${pedidoId} registrado correctamente por $${calcularTotal().toLocaleString('es-CO')}.`,
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });

      setCarrito([]);
      setIsCheckoutOpen(false);
      setIsCarritoOpen(false);
      setDatosEntrega((prev) => ({ ...prev, observaciones: '', metodoPago: 'Efectivo', fechaEntrega: '' }));
    } catch (error) {
      console.error('Error creando pedido de cliente:', error);
      showAlert({
        title: 'Error al crear pedido',
        description: 'No fue posible registrar el pedido. Intenta de nuevo en unos segundos.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Cargando tienda...</p>;
  }

  return (
    <div className="space-y-6">
      {AlertComponent}

      <div className="flex items-center justify-between">
        <div>
          <h2>Tienda de Productos</h2>
          <p className="text-muted-foreground">Explora el catalogo y crea nuevos pedidos</p>
        </div>
        <Button icon={<ShoppingCart className="w-5 h-5" />} onClick={() => setIsCarritoOpen(true)} className="relative">
          Carrito ({carrito.reduce((sum, item) => sum + item.cantidad, 0)})
        </Button>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="block mb-2">Buscar producto</label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre..."
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block mb-2">Filtrar por categoria</label>
            <div className="flex flex-wrap gap-2">
              {categorias.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoriaFiltro(cat)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    categoriaFiltro === cat ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {productosFiltrados.map((producto) => (
          <Card key={producto.id} className="flex flex-col">
            <div className="relative pb-[100%] mb-4 overflow-hidden rounded-lg bg-muted">
              {producto.imagen ? (
                <img src={producto.imagen} alt={producto.nombre} className="absolute inset-0 w-full h-full object-cover" />
              ) : null}
              <span className="absolute top-2 right-2 px-2 py-1 bg-primary text-white text-xs rounded-full">
                {producto.categoria}
              </span>
            </div>

            <div className="flex-1 flex flex-col">
              <h3 className="mb-2">{producto.nombre}</h3>
              <p className="text-sm text-muted-foreground mb-3 flex-1">{producto.descripcion || 'Sin descripcion'}</p>

              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Precio</p>
                  <p className="text-primary">${producto.precio.toLocaleString('es-CO')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Stock</p>
                  <p className={producto.stock < 10 ? 'text-destructive' : 'text-foreground'}>{producto.stock} und.</p>
                </div>
              </div>

              <Button
                onClick={() => agregarAlCarrito(producto)}
                icon={<Plus className="w-4 h-4" />}
                disabled={producto.stock === 0}
                className="w-full"
              >
                {producto.stock === 0 ? 'Sin Stock' : 'Agregar al Carrito'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isCarritoOpen} onClose={() => setIsCarritoOpen(false)} title="Mi Carrito de Compras" size="lg">
        {carrito.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">Tu carrito esta vacio</p>
            <Button onClick={() => setIsCarritoOpen(false)}>Continuar comprando</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {carrito.map((item) => (
              <div key={item.producto.id} className="flex gap-4 p-4 bg-accent/50 rounded-lg">
                <div className="flex-1">
                  <h4 className="mb-1">{item.producto.nombre}</h4>
                  <p className="text-sm text-muted-foreground mb-2">${item.producto.precio.toLocaleString('es-CO')} c/u</p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                      className="w-8 h-8 flex items-center justify-center border border-border rounded hover:bg-muted"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center">{item.cantidad}</span>
                    <button
                      onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)}
                      className="w-8 h-8 flex items-center justify-center border border-border rounded hover:bg-muted"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => actualizarCantidad(item.producto.id, 0)}
                      className="ml-auto text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="text-primary">${(item.producto.precio * item.cantidad).toLocaleString('es-CO')}</p>
                </div>
              </div>
            ))}

            <div className="border-t pt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Fecha deseada de entrega</label>
                <input
                  type="date"
                  value={datosEntrega.fechaEntrega}
                  onChange={(e) => setDatosEntrega((prev) => ({ ...prev, fechaEntrega: e.target.value }))}
                  className="w-full max-w-xs rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg">Total:</span>
                <span className="text-2xl text-primary">${calcularTotal().toLocaleString('es-CO')}</span>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsCarritoOpen(false)} className="flex-1">
                  Continuar comprando
                </Button>
                <Button
                  onClick={() => {
                    setIsCarritoOpen(false);
                    setIsCheckoutOpen(true);
                  }}
                  icon={<ShoppingBag className="w-5 h-5" />}
                  className="flex-1"
                >
                  Realizar pedido
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} title="Completar Pedido" size="lg">
        <Form onSubmit={realizarPedido}>
          <div className="space-y-4 mb-6">
            <h4>Resumen del pedido</h4>
            <div className="p-4 bg-accent/50 rounded-lg space-y-2">
              {carrito.map((item) => (
                <div key={item.producto.id} className="flex justify-between text-sm">
                  <span>
                    {item.producto.nombre} x {item.cantidad}
                  </span>
                  <span>${(item.producto.precio * item.cantidad).toLocaleString('es-CO')}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between">
                <span>Total:</span>
                <span className="text-primary">${calcularTotal().toLocaleString('es-CO')}</span>
              </div>
            </div>
          </div>

          <FormField
            label="Fecha de entrega deseada"
            name="fechaEntrega"
            type="date"
            value={datosEntrega.fechaEntrega}
            onChange={(value) => setDatosEntrega({ ...datosEntrega, fechaEntrega: String(value) })}
            required
          />

          <FormField
            label="Direccion de entrega"
            name="direccion"
            type="textarea"
            value={datosEntrega.direccion}
            onChange={(value) => setDatosEntrega({ ...datosEntrega, direccion: value as string })}
            placeholder="Ingresa la direccion completa de entrega"
            rows={2}
            required
          />

          <FormField
            label="Telefono de contacto"
            name="telefono"
            value={datosEntrega.telefono}
            onChange={(value) => setDatosEntrega({ ...datosEntrega, telefono: value as string })}
            placeholder="300 123 4567"
            required
          />

          <FormField
            label="Metodo de pago"
            name="metodoPago"
            type="select"
            value={datosEntrega.metodoPago}
            onChange={(value) => setDatosEntrega({ ...datosEntrega, metodoPago: value as any })}
            options={[
              { value: 'Efectivo', label: 'Efectivo' },
              { value: 'Transferencia', label: 'Transferencia bancaria' },
              { value: 'Contraentrega', label: 'Pago contraentrega' }
            ]}
            required
          />

          <FormField
            label="Observaciones (opcional)"
            name="observaciones"
            type="textarea"
            value={datosEntrega.observaciones}
            onChange={(value) => setDatosEntrega({ ...datosEntrega, observaciones: value as string })}
            placeholder="Instrucciones especiales para la entrega..."
            rows={3}
          />

          <FormActions>
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" icon={<Check className="w-5 h-5" />} disabled={submitting}>
              {submitting ? 'Guardando...' : 'Confirmar pedido'}
            </Button>
          </FormActions>
        </Form>
      </Modal>
    </div>
  );
}
