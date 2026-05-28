import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../Card';
import { Button } from '../../Button';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { ShoppingCart, Plus, Minus, Trash2, ShoppingBag, Check } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { api } from '../../../services/api';

type Producto = {
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  imagen: string;
  descripcion: string;
};

type ItemCarrito = { producto: Producto; cantidad: number };

export function TiendaCliente() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [isCarritoOpen, setIsCarritoOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('Todos');
  const [busqueda, setBusqueda] = useState('');
  const { showAlert, AlertComponent } = useAlertDialog();

  const [datosEntrega, setDatosEntrega] = useState({
    direccion: '',
    telefono: '',
    observaciones: '',
    metodoPago: 'Efectivo' as 'Efectivo' | 'Transferencia',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [prods, cats] = await Promise.all([api.productos.getAll(), api.categorias.getAll()]);
        const mapped = (prods || [])
          .filter((p: any) => p.estado === 'activo')
          .map((p: any) => ({
            id: Number(p.id),
            nombre: p.nombre,
            categoria: cats.find((c: any) => c.id === p.categoriaId)?.nombre || 'Sin categoría',
            precio: Number(p.precioVenta || p.precio || 0),
            stock: Number(p.stock || 0),
            imagen: 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=400&h=400&fit=crop',
            descripcion: p.descripcion || '',
          }));
        setProductos(mapped);
      } catch {
        setProductos([]);
      }
    };
    load();
  }, []);

  const categorias = useMemo(() => ['Todos', ...Array.from(new Set(productos.map((p) => p.categoria)))], [productos]);

  const productosFiltrados = productos.filter((p) => {
    const matchCategoria = categoriaFiltro === 'Todos' || p.categoria === categoriaFiltro;
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCategoria && matchBusqueda;
  });

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
          description: `Solo hay ${producto.stock} unidades disponibles de ${producto.nombre}`,
          type: 'warning',
          confirmText: 'Entendido',
          onConfirm: () => {},
        });
      }
    } else {
      setCarrito([...carrito, { producto, cantidad: 1 }]);
    }
  };

  const actualizarCantidad = (productoId: number, nuevaCantidad: number) => {
    const item = carrito.find((i) => i.producto.id === productoId);
    if (!item) return;
    if (nuevaCantidad <= 0) {
      eliminarDelCarrito(productoId);
    } else if (nuevaCantidad <= item.producto.stock) {
      setCarrito(carrito.map((i) => (i.producto.id === productoId ? { ...i, cantidad: nuevaCantidad } : i)));
    }
  };

  const eliminarDelCarrito = (productoId: number) => {
    setCarrito(carrito.filter((item) => item.producto.id !== productoId));
  };

  const calcularTotal = () => carrito.reduce((total, item) => total + item.producto.precio * item.cantidad, 0);

  const realizarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (carrito.length === 0) throw new Error('Debes agregar al menos un producto al carrito');
      const tel = String(datosEntrega.telefono || '').replace(/\D/g, '');
      if (tel.length !== 10) throw new Error('El teléfono debe tener exactamente 10 dígitos');
      if (!datosEntrega.direccion.trim()) throw new Error('La dirección de entrega es obligatoria');
      await api.pedidos.create({
        fechaPedido: new Date().toISOString().split('T')[0],
        fechaEntrega: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        metodoPago: datosEntrega.metodoPago === 'Transferencia' ? 'transferencia' : 'efectivo',
        porcentajeAbono: 100,
        total: calcularTotal(),
        direccion: datosEntrega.direccion.trim(),
        telefono: tel,
        productos: carrito.map((item) => ({
          productoId: item.producto.id,
          cantidad: item.cantidad,
          precio: item.producto.precio,
          subtotal: item.producto.precio * item.cantidad,
        })),
      } as any);

      showAlert({
        title: 'Pedido realizado',
        description: `Tu pedido por $${calcularTotal().toLocaleString('es-CO')} ha sido registrado exitosamente.`,
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {
          setCarrito([]);
          setIsCheckoutOpen(false);
          setDatosEntrega({ direccion: '', telefono: '', observaciones: '', metodoPago: 'Efectivo' });
        },
      });
    } catch (error: any) {
      showAlert({
        title: 'Error',
        description: error.message || 'No fue posible registrar el pedido',
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
          <h2>Tienda de Productos</h2>
          <p className="text-muted-foreground">Explora nuestro catálogo y realiza tus pedidos</p>
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
              placeholder="Buscar ..."
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={60}
            />
          </div>

          <div>
            <label className="block mb-2">Filtrar por categoría</label>
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
              <img src={producto.imagen} alt={producto.nombre} className="absolute inset-0 w-full h-full object-cover" />
              <span className="absolute top-2 right-2 px-2 py-1 bg-primary text-white text-xs rounded-full">{producto.categoria}</span>
            </div>

            <div className="flex-1 flex flex-col">
              <h3 className="mb-2">{producto.nombre}</h3>
              <p className="text-sm text-muted-foreground mb-3 flex-1">{producto.descripcion}</p>

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

              <Button onClick={() => agregarAlCarrito(producto)} icon={<Plus className="w-4 h-4" />} disabled={producto.stock === 0} className="w-full">
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
            <p className="text-muted-foreground mb-4">Tu carrito está vacío</p>
            <Button onClick={() => setIsCarritoOpen(false)}>Continuar Comprando</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {carrito.map((item) => (
              <div key={item.producto.id} className="flex gap-4 p-4 bg-accent/50 rounded-lg">
                <img src={item.producto.imagen} alt={item.producto.nombre} className="w-20 h-20 object-cover rounded-lg" />
                <div className="flex-1">
                  <h4 className="mb-1">{item.producto.nombre}</h4>
                  <p className="text-sm text-muted-foreground mb-2">${item.producto.precio.toLocaleString('es-CO')} c/u</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)} className="w-8 h-8 flex items-center justify-center border border-border rounded hover:bg-muted">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center">{item.cantidad}</span>
                    <button onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)} className="w-8 h-8 flex items-center justify-center border border-border rounded hover:bg-muted">
                      <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={() => eliminarDelCarrito(item.producto.id)} className="ml-auto text-destructive hover:text-destructive/80">
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
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg">Total:</span>
                <span className="text-2xl text-primary">${calcularTotal().toLocaleString('es-CO')}</span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsCarritoOpen(false)} className="flex-1">Continuar Comprando</Button>
                <Button onClick={() => { setIsCarritoOpen(false); setIsCheckoutOpen(true); }} icon={<ShoppingBag className="w-5 h-5" />} className="flex-1">Realizar Pedido</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} title="Completar Pedido" size="lg">
        <Form onSubmit={realizarPedido}>
          <div className="space-y-4 mb-6">
            <h4>Resumen del Pedido</h4>
            <div className="p-4 bg-accent/50 rounded-lg space-y-2">
              {carrito.map((item) => (
                <div key={item.producto.id} className="flex justify-between text-sm">
                  <span>{item.producto.nombre} x {item.cantidad}</span>
                  <span>${(item.producto.precio * item.cantidad).toLocaleString('es-CO')}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between">
                <span>Total:</span>
                <span className="text-primary">${calcularTotal().toLocaleString('es-CO')}</span>
              </div>
            </div>
          </div>

          <FormField label="Dirección de Entrega" name="direccion" type="textarea" value={datosEntrega.direccion} onChange={(value) => setDatosEntrega({ ...datosEntrega, direccion: value as string })} placeholder="Ingresa la dirección completa de entrega" rows={2} required />
          <FormField label="Teléfono de Contacto" name="telefono" value={datosEntrega.telefono} onChange={(value) => setDatosEntrega({ ...datosEntrega, telefono: value as string })} placeholder="3001234567" required inputDigitRule="telefono10" />
          <FormField label="Método de Pago" name="metodoPago" type="select" value={datosEntrega.metodoPago} onChange={(value) => setDatosEntrega({ ...datosEntrega, metodoPago: value as any })} options={[{ value: 'Efectivo', label: 'Efectivo' }, { value: 'Transferencia', label: 'Transferencia Bancaria' }]} required />
          <FormField label="Observaciones (Opcional)" name="observaciones" type="textarea" value={datosEntrega.observaciones} onChange={(value) => setDatosEntrega({ ...datosEntrega, observaciones: value as string })} placeholder="Instrucciones especiales para la entrega..." rows={3} />

          <FormActions>
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)}>Cancelar</Button>
            <Button type="submit" icon={<Check className="w-5 h-5" />}>Confirmar Pedido</Button>
          </FormActions>
        </Form>
      </Modal>
    </div>
  );
}
