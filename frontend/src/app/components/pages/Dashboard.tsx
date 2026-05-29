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
import { api } from '../../services/api';
import { formatEntityCode } from '../../services/mappers';

function etiquetaFechaPedido(fecha?: string): string {
  if (!fecha || !String(fecha).trim()) return 'Sin fecha';
  const raw = String(fecha).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? 'Sin fecha' : d.toLocaleDateString('es-CO');
}

const COLORS = ['rgb(114, 47, 55)', 'rgb(134, 67, 75)', 'rgb(154, 87, 95)', 'rgb(174, 107, 115)', 'rgb(194, 127, 135)'];

export function Dashboard() {
  const [metricas, setMetricas] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargarMetricas = async () => {
      try {
        const data = await api.dashboard.getMetricas();
        setMetricas(data);
      } catch (error) {
        console.error('Error cargando métricas:', error);
      } finally {
        setLoading(false);
      }
    };
    cargarMetricas();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando métricas...</p>
        </div>
      </div>
    );
  }

  if (!metricas) {
    return (
      <div className="text-center text-muted-foreground">
        No se pudieron cargar las métricas
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Ventas del Mes"
          value={formatCurrency(metricas.ventasMes)}
          icon={<DollarSign className="w-6 h-6" />}
          description="Total del mes actual"
        />
        <StatCard
          title="Ventas Hoy"
          value={formatCurrency(metricas.ventasHoy)}
          icon={<TrendingUp className="w-6 h-6" />}
          description="Ventas del día de hoy"
        />
        <StatCard
          title="Pedidos Activos"
          value={metricas.pedidosActivos.toString()}
          icon={<ShoppingBag className="w-6 h-6" />}
          description="Pedidos pendientes o en proceso"
        />
        <StatCard
          title="Clientes Activos"
          value={metricas.clientesActivos.toString()}
          icon={<Users className="w-6 h-6" />}
          description="Clientes registrados activos"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h3 className="mb-4">Ventas Mensuales</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metricas.ventasMensuales}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : `${(value / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Line type="monotone" dataKey="total" stroke="rgb(114, 47, 55)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h3 className="mb-4">Distribución por Categoría</h3>
          {metricas.distribucionCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={metricas.distribucionCategoria}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ nombre, value }) => value > 0 ? `${nombre} ${formatCurrency(value)}` : ''}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="valor"
                >
                  {metricas.distribucionCategoria.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No hay datos de categorías
            </div>
          )}
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
          {metricas.productosMasVendidos.length > 0 ? (
            <div className="space-y-3">
              {metricas.productosMasVendidos.map((product: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
                  <div className="flex-1">
                    <p>{product.nombre}</p>
                    <p className="text-sm text-muted-foreground">{product.cantidad} unidades vendidas</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No hay datos de productos vendidos
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary" />
            <h3>Pedidos Recientes</h3>
          </div>
          {metricas.pedidosRecientes.length > 0 ? (
            <div className="space-y-3">
              {metricas.pedidosRecientes.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex-1">
                    <p>{order.cliente}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.numeroPedido || formatEntityCode('P', order.id)} — {etiquetaFechaPedido(order.fecha)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>{formatCurrency(order.total)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      order.estado === 'completado' ? 'bg-green-100 text-green-700' :
                      order.estado === 'en proceso' ? 'bg-blue-100 text-blue-700' :
                      order.estado === 'cancelado' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {order.estado.charAt(0).toUpperCase() + order.estado.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No hay pedidos recientes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
