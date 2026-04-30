import React from 'react';
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

// Mock data
const salesData = [
  { month: 'Ene', ventas: 4500000 },
  { month: 'Feb', ventas: 5200000 },
  { month: 'Mar', ventas: 4800000 },
  { month: 'Abr', ventas: 6100000 },
  { month: 'May', ventas: 7200000 },
  { month: 'Jun', ventas: 6800000 }
];

const topProducts = [
  { name: 'Whisky Jack Daniels', sales: 1200000, quantity: 45 },
  { name: 'Ron Medellín Añejo', sales: 980000, quantity: 62 },
  { name: 'Aguardiente Antioqueño', sales: 850000, quantity: 120 },
  { name: 'Cerveza Corona', sales: 720000, quantity: 180 },
  { name: 'Vino Casillero del Diablo', sales: 650000, quantity: 38 }
];

const categoryData = [
  { name: 'Whiskies', value: 35 },
  { name: 'Rones', value: 25 },
  { name: 'Cervezas', value: 20 },
  { name: 'Vinos', value: 12 },
  { name: 'Otros', value: 8 }
];

const COLORS = ['rgb(114, 47, 55)', 'rgb(134, 67, 75)', 'rgb(154, 87, 95)', 'rgb(174, 107, 115)', 'rgb(194, 127, 135)'];

const recentOrders = [
  { id: 'PED-001', client: 'Juan Pérez', total: 450000, status: 'Entregado', date: '2024-12-12' },
  { id: 'PED-002', client: 'María García', total: 320000, status: 'En proceso', date: '2024-12-12' },
  { id: 'PED-003', client: 'Carlos López', total: 580000, status: 'Pendiente', date: '2024-12-11' },
  { id: 'PED-004', client: 'Ana Martínez', total: 210000, status: 'Entregado', date: '2024-12-11' }
];

export function Dashboard() {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Ventas del Mes"
          value={formatCurrency(6800000)}
          icon={<DollarSign className="w-6 h-6" />}
          trend={{ value: 12.5, isPositive: true }}
          description="vs mes anterior"
        />
        <StatCard
          title="Ventas Hoy"
          value={formatCurrency(450000)}
          icon={<TrendingUp className="w-6 h-6" />}
          trend={{ value: 8.2, isPositive: true }}
          description="vs ayer"
        />
        <StatCard
          title="Pedidos Activos"
          value="12"
          icon={<ShoppingBag className="w-6 h-6" />}
        />
        <StatCard
          title="Clientes Activos"
          value="156"
          icon={<Users className="w-6 h-6" />}
          trend={{ value: 5.3, isPositive: true }}
          description="este mes"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h3 className="mb-4">Ventas Mensuales</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${value / 1000000}M`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Line type="monotone" dataKey="ventas" stroke="rgb(114, 47, 55)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h3 className="mb-4">Distribución por Categoría</h3>
          <ResponsiveContainer width="100%" height={300}>
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
            {topProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
                <div className="flex-1">
                  <p>{product.name}</p>
                  <p className="text-sm text-muted-foreground">{product.quantity} unidades</p>
                </div>
                <p className="text-primary">{formatCurrency(product.sales)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary" />
            <h3>Pedidos Recientes</h3>
          </div>
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex-1">
                  <p>{order.client}</p>
                  <p className="text-sm text-muted-foreground">{order.id} - {order.date}</p>
                </div>
                <div className="text-right">
                  <p>{formatCurrency(order.total)}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    order.status === 'Entregado' ? 'bg-green-100 text-green-700' :
                    order.status === 'En proceso' ? 'bg-blue-100 text-blue-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
