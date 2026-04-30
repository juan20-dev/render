import React, { useState, useEffect } from 'react';
import { StatCard } from '../Card';
import { 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  Users,
  Package,
  Clock
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { ventas as ventasAPI, pedidos as pedidosAPI, productos as productosAPI, categorias as categoriasAPI, clientes as clientesAPI } from '../../services/api';

const COLORS = ['rgb(114, 47, 55)', 'rgb(134, 67, 75)', 'rgb(154, 87, 95)', 'rgb(174, 107, 115)', 'rgb(194, 127, 135)'];

export function Dashboard() {
  const [salesData, setSalesData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [stats, setStats] = useState({
    ventasDelMes: 0,
    ventasHoy: 0,
    pedidosActivos: 0,
    clientesActivos: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Cargar datos en paralelo
      const [ventasData, pedidosData, productosData, categoriasData, clientesData] = await Promise.all([
        ventasAPI.getAll().catch(() => []),
        pedidosAPI.getAll().catch(() => []),
        productosAPI.getAll().catch(() => []),
        categoriasAPI.getAll().catch(() => []),
        clientesAPI.getAll().catch(() => [])
      ]);

      // Procesar ventas mensuales
      const ventasPorMes = procesarVentasPorMes(ventasData);
      setSalesData(ventasPorMes);

      // Procesar productos más vendidos
      const topProds = procesarProductosMasVendidos(productosData, ventasData);
      setTopProducts(topProds.slice(0, 5));

      // Procesar categorías
      const categories = procesarCategorias(categoriasData, productosData);
      setCategoryData(categories);

      // Procesar pedidos recientes
      const recent = procesarPedidosRecientes(pedidosData);
      setRecentOrders(recent.slice(0, 4));

      // Calcular estadísticas
      const statsCalc = calcularEstadisticas(ventasData, pedidosData, clientesData);
      setStats(statsCalc);

    } catch (error) {
      console.error('Error cargando datos del dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const procesarVentasPorMes = (ventas: any[]) => {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const ahora = new Date();
    const ventasPorMes: { [key: string]: number } = {};

    // Inicializar últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const key = meses[fecha.getMonth()];
      ventasPorMes[key] = 0;
    }

    // Sumar ventas por mes
    ventas.forEach((venta: any) => {
      if (venta.fecha) {
        const fecha = new Date(venta.fecha);
        const mes = meses[fecha.getMonth()];
        ventasPorMes[mes] = (ventasPorMes[mes] || 0) + (venta.total || 0);
      }
    });

    return Object.entries(ventasPorMes).map(([month, total]) => ({
      month,
      ventas: total
    }));
  };

  const procesarProductosMasVendidos = (productos: any[], ventas: any[]) => {
    const ventasPorProducto: { [key: number]: { nombre: string; ventas: number; cantidad: number } } = {};

    ventas.forEach((venta: any) => {
      if (venta.detalle_ventas) {
        venta.detalle_ventas.forEach((detalle: any) => {
          const prodId = detalle.producto_id;
          if (!ventasPorProducto[prodId]) {
            ventasPorProducto[prodId] = { nombre: '', ventas: 0, cantidad: 0 };
          }
          ventasPorProducto[prodId].ventas += detalle.subtotal || 0;
          ventasPorProducto[prodId].cantidad += detalle.cantidad || 0;
        });
      }
    });

    // Agregar nombres de productos
    productos.forEach((prod: any) => {
      if (ventasPorProducto[prod.id]) {
        ventasPorProducto[prod.id].nombre = prod.nombre;
      }
    });

    return Object.values(ventasPorProducto)
      .sort((a, b) => b.ventas - a.ventas)
      .map(p => ({ name: p.nombre, sales: p.ventas, quantity: p.cantidad }));
  };

  const procesarCategorias = (categorias: any[], productos: any[]) => {
    const productosPorCategoria: { [key: number]: number } = {};

    categorias.forEach((cat: any) => {
      productosPorCategoria[cat.id] = productos.filter((p: any) => p.categoria_id === cat.id).length;
    });

    return categorias
      .filter((cat: any) => productosPorCategoria[cat.id] > 0)
      .map((cat: any) => ({ name: cat.nombre, value: productosPorCategoria[cat.id] }));
  };

  const procesarPedidosRecientes = (pedidos: any[]) => {
    return pedidos
      .sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .map((ped: any) => ({
        id: ped.numero_pedido || `PED-${ped.id}`,
        client: ped.cliente || 'Cliente',
        total: ped.total || 0,
        status: ped.estado || 'Pendiente',
        date: ped.fecha ? new Date(ped.fecha).toISOString().split('T')[0] : ''
      }));
  };

  const calcularEstadisticas = (ventas: any[], pedidos: any[], clientes: any[]) => {
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const yearActual = ahora.getFullYear();

    const ventasDelMes = ventas
      .filter((v: any) => {
        if (!v.fecha) return false;
        const fecha = new Date(v.fecha);
        return fecha.getMonth() === mesActual && fecha.getFullYear() === yearActual;
      })
      .reduce((sum: number, v: any) => sum + (v.total || 0), 0);

    const ventasHoy = ventas
      .filter((v: any) => {
        if (!v.fecha) return false;
        const fecha = new Date(v.fecha);
        return fecha.toDateString() === ahora.toDateString();
      })
      .reduce((sum: number, v: any) => sum + (v.total || 0), 0);

    const pedidosActivos = pedidos.filter((p: any) => p.estado !== 'Completado' && p.estado !== 'Cancelado').length;

    return {
      ventasDelMes,
      ventasHoy,
      pedidosActivos,
      clientesActivos: clientes.length
    };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const mapEstadoToColor = (status: string) => {
    switch (status) {
      case 'Completado':
      case 'Entregado':
        return 'bg-green-100 text-green-700';
      case 'En Proceso':
      case 'En proceso':
        return 'bg-blue-100 text-blue-700';
      case 'Pendiente':
        return 'bg-yellow-100 text-yellow-700';
      case 'Cancelado':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-lg border border-border p-6 animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-12 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Ventas del Mes"
          value={formatCurrency(stats.ventasDelMes)}
          icon={<DollarSign className="w-6 h-6" />}
          trend={{ value: 0, isPositive: true }}
          description="mes actual"
        />
        <StatCard
          title="Ventas Hoy"
          value={formatCurrency(stats.ventasHoy)}
          icon={<TrendingUp className="w-6 h-6" />}
          trend={{ value: 0, isPositive: true }}
          description="vendido"
        />
        <StatCard
          title="Pedidos Activos"
          value={stats.pedidosActivos.toString()}
          icon={<ShoppingBag className="w-6 h-6" />}
        />
        <StatCard
          title="Clientes Activos"
          value={stats.clientesActivos.toString()}
          icon={<Users className="w-6 h-6" />}
          trend={{ value: 0, isPositive: true }}
          description="registrados"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h3 className="mb-4">Ventas Mensuales</h3>
          <ResponsiveContainer width="100%" height={300}>
            {salesData.length > 0 ? (
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${value / 1000000}M`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="ventas" stroke="rgb(114, 47, 55)" strokeWidth={2} />
              </LineChart>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No hay datos disponibles
              </div>
            )}
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h3 className="mb-4">Distribución por Categoría</h3>
          <ResponsiveContainer width="100%" height={300}>
            {categoryData.length > 0 ? (
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No hay datos disponibles
              </div>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products and Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white rounded-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-primary" />
            <h3>Productos Más Vendidos</h3>
          </div>
          <div className="space-y-3">
            {topProducts.length > 0 ? (
              topProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
                  <div className="flex-1">
                    <p>{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.quantity} unidades</p>
                  </div>
                  <p className="text-primary">{formatCurrency(product.sales)}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No hay datos disponibles</p>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary" />
            <h3>Pedidos Recientes</h3>
          </div>
          <div className="space-y-3">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex-1">
                    <p>{order.client}</p>
                    <p className="text-sm text-muted-foreground">{order.id} - {order.date}</p>
                  </div>
                  <div className="text-right">
                    <p>{formatCurrency(order.total)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${mapEstadoToColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No hay datos disponibles</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
