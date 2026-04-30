# 📋 PLAN DE IMPLEMENTACIÓN COMPLETO - GRANDMA'S LIQUORS
**Fecha Inicio:** 30 Abril 2026  
**Duración Total:** 12-14 días (4 fases)  
**Objetivo:** Implementación sistemática de correcciones críticas, intermedias, nuevas features y validaciones robustas.

---

## 🎯 RESUMEN EJECUTIVO

Este plan implementa 4 fases progresivas que transforman el sistema de gestión de pedidos, ventas y compras:

- **FASE 1 (3 días):** Correcciones operacionales críticas
- **FASE 2 (3-4 días):** Mejoras intermedias y flujos encadenados
- **FASE 3 (4-5 días):** Nuevas features avanzadas
- **FASE 4 (2 días):** Validaciones y testing

**Total de cambios:** 60+ modificaciones de código, 15+ archivos modificados.

---

# FASE 1: CORRECCIONES CRÍTICAS (3 DÍAS)

## 1.1 ✂️ REMOVER STOCK MANUAL EN PRODUCTO (COMPLETADO ✅)

**Estado:** Ya implementado  
**Descripción:** Stock siempre inicia en 0, no se puede editar desde formulario

**Archivos modificados:**
- ✅ `src/components/pages/compras/Productos.tsx` (líneas 200-250)
- ✅ `backend/src/models/entities.models.js` - Productos.create() (líneas 280-310)
- ✅ `backend/src/models/entities.models.js` - Productos.update() (líneas 312-330)

---

## 1.2 🔴 ALERTA VISIBLE EN COMPRAS (COMPLETADO ✅)

**Estado:** Ya implementado  
**Descripción:** Alerta destacada roja cuando no hay productos, verde cuando sí

**Archivos modificados:**
- ✅ `src/components/pages/compras/Compras.tsx` (líneas 850-875)
  - Alerta roja: `border-2 border-red-400 bg-red-50` cuando `formData.items.length === 0`
  - Alerta verde: `border border-green-300 bg-green-50` con contador de productos

---

## 1.3 📊 VENTA ESTADO PENDIENTE (NO COMPLETADA) (COMPLETADO ✅)

**Estado:** Ya implementado  
**Descripción:** Venta se crea automáticamente en estado 'Pendiente' cuando Domicilio → Entregado

**Archivos modificados:**
- ✅ `backend/src/controllers/domicilios.controllers.js` (líneas 1-50)
  - Cambio: `estado: 'Completada'` → `estado: 'Pendiente'` en auto-creación
  - Agregado: try-catch wrapper para error handling
  
- ✅ `backend/src/models/entities.models.js` - Ventas.create() (líneas 1310-1340)
  - Validación estado: `['Pendiente', 'Completada', 'Cancelada']`
  - Default: `'Pendiente'`
  - Try-catch con `error.statusCode` propagation

---

## 1.4 📦 PEDIDOS MOSTRAR CANTIDAD DE PRODUCTOS EN TABLA (COMPLETADO ✅)

**Estado:** Ya implementado  
**Descripción:** Tabla Pedidos muestra columna "Productos" con conteo

**Archivos modificados:**
- ✅ `backend/src/models/entities.models.js` - Pedidos.getAll() (líneas 1051-1065)
  - Agregado: `COUNT(dp.id) as productos` con LEFT JOIN a detalle_pedidos
  - Agregado: `GROUP BY p.id, c.nombre, c.apellido, c.email`
  - Try-catch wrapper

- ✅ `src/components/pages/ventas/Pedidos.tsx` (líneas 130-140)
  - Columna "Productos" ya existe con render: `${value || 0} producto${value !== 1 ? 's' : ''}`

---

## 1.5 🔧 ASESOR CAMBIAR ESTADO PEDIDO (CUALQUIER ESTADO PERMITIDO) (COMPLETADO ✅)

**Estado:** Ya implementado  
**Descripción:** Asesor puede cambiar Pedido entre estados permitidos sin editar otros campos

**Cambios implementados:**

### Backend - `backend/src/controllers/pedidos.controllers.js` (líneas 106-200)

**Transiciones permitidas:**
```
Pendiente    → En Proceso, Completado, Cancelado
En Proceso   → Completado, Cancelado, Pendiente
Completado   → (final - sin cambios)
Cancelado    → (final - sin cambios)
```

**Lógica por rol:**
- **Cliente:** Solo editar `fecha_entrega` y `detalles` si estado está en Pendiente/En Proceso
- **Asesor:** Cambiar estado validando transición + auto-crear Domicilio si Pendiente → Completado
- **Admin:** Cambio completo de estado y cualquier campo

**Estructura:**
```javascript
// 1. Validar rol
const rol = String(req.user?.rol || '').trim();

// 2. Definir transiciones
const transiciones = {
  'Pendiente': ['En Proceso', 'Completado', 'Cancelado'],
  'En Proceso': ['Completado', 'Cancelado', 'Pendiente'],
  'Completado': [],
  'Cancelado': []
};

// 3. Si cambio de estado, validar transición
if (req.body.estado) {
  const estadoActual = String(pedido.estado || '').trim();
  const estadoNuevo = String(req.body.estado).trim();
  
  if (!transiciones[estadoActual]?.includes(estadoNuevo)) {
    return res.status(400).json({ 
      success: false, 
      message: `Transición no permitida: ${estadoActual} → ${estadoNuevo}`,
      permitidas: transiciones[estadoActual] || []
    });
  }
}

// 4. Si Asesor: permitir cambio de estado pero no otros campos
// 5. Si Admin: permitir cambio completo
// 6. Auto-crear Domicilio si Completado
```

### Backend - `backend/src/models/entities.models.js` - Pedidos.update() (líneas 1090-1140)

**Validaciones agregadas:**
- Try-catch wrapper
- Validación estado contra enum: `['Pendiente', 'En Proceso', 'Completado', 'Cancelado']`
- Uso de `COALESCE()` para UPDATE parcial
- Verificación post-update para confirmar persistencia
- Logging si hay discrepancia

**SQL mejorado:**
```sql
UPDATE pedidos 
SET numero_pedido = COALESCE($2, numero_pedido),
    fecha = COALESCE($3, fecha),
    fecha_entrega = COALESCE($4, fecha_entrega),
    detalles = COALESCE($5, detalles),
    total = COALESCE($6, total),
    estado = $7,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1
```

---

# FASE 2: CORRECCIONES INTERMEDIAS (3-4 DÍAS)

## 2.1 🔍 SELECT DINÁMICO DE PEDIDOS EN NUEVA VENTA (NUEVA FEATURE)

**Duración estimada:** 1 día  
**Descripción:** En formulario "Nueva Venta (por Pedido)", el campo "Número de Pedido" es un select searchable que carga pedidos de la tabla

### Frontend - `src/components/pages/ventas/Ventas.tsx`

**Ubicación:** Sección "Crear Nueva Venta" → Modal "Nueva Venta por Pedido"  
**Campo a modificar:** "Número de Pedido" (líneas ~450-480)

**Cambios:**
1. Reemplazar input text por componente **SearchableSelect**
2. Data source: API `pedidosAPI.getAll()` con filtro `estado !== 'Cancelado'`
3. Opciones mostrar: `[ID: ${p.id} | ${p.numero_pedido}] - Cliente: ${p.cliente}`
4. Búsqueda por: número_pedido, cliente, ID
5. Permitir pegar valor con Ctrl+V y buscar automáticamente
6. Al seleccionar: llamar función `handlePedidoSelected(pedido)`

**Interfaz de datos:**
```typescript
interface PedidoOption {
  id: string;
  numero_pedido: string;
  cliente: string;
  productos: number;
  total: number;
}
```

**Función handlePedidoSelected():**
```typescript
const handlePedidoSelected = async (pedido: Pedido) => {
  // 1. Guardar pedido_id en formData
  // 2. Cargar detalles del pedido: pedidosAPI.getDetalles(pedido.id)
  // 3. Actualizar formData.items con productos del pedido
  // 4. Calcular total automáticamente
  // 5. Deshabilitar campo "Agregar Productos" (ver 2.2)
};
```

**Validaciones:**
- Solo mostrar pedidos con estado: Pendiente, En Proceso, Completado
- No permitir pedidos con estado Cancelado
- Requerir selección antes de continuar

---

## 2.2 🚫 REMOVER CAPACIDAD DE AGREGAR PRODUCTOS EN VENTA POR PEDIDO (NUEVA FEATURE)

**Duración estimada:** 0.5 día  
**Descripción:** La sección "Agregar Productos" se oculta cuando se selecciona un Pedido

### Frontend - `src/components/pages/ventas/Ventas.tsx`

**Ubicación:** Sección "Nueva Venta por Pedido" → Tabla de productos (líneas ~500-650)

**Cambios:**
1. Crear booleano: `const [isProductosFromPedido, setIsProductosFromPedido] = useState(false)`
2. En `handlePedidoSelected()`: setear `setIsProductosFromPedido(true)`
3. Envolver sección "Agregar Productos" en condicional:
```jsx
{!isProductosFromPedido && (
  <div className="p-4 bg-blue-50 border border-blue-300 rounded">
    <h3 className="font-semibold text-blue-700">Agregar Productos</h3>
    {/* Botón + tabla de agregar */}
  </div>
)}

{isProductosFromPedido && (
  <div className="p-4 bg-green-50 border border-green-300 rounded">
    <h3 className="font-semibold text-green-700">✓ Productos cargados del Pedido</h3>
    <p className="text-sm text-green-600">
      {formData.items.length} producto(s) del pedido seleccionado
    </p>
    <p className="text-xs text-gray-600 mt-2">
      Los productos de la venta están vinculados al pedido. No se pueden modificar.
    </p>
  </div>
)}
```

4. Cambiar botón "Agregar Producto" a disabled si `isProductosFromPedido === true`
5. Remover opción de eliminar productos si `isProductosFromPedido === true`

---

## 2.3 💰 PRECIO AUTO-COMPLETO EN PEDIDOS (NUEVA FEATURE)

**Duración estimada:** 1 día  
**Descripción:** Cuando se selecciona un producto en Pedidos, precio se carga automáticamente

### Frontend - `src/components/pages/ventas/Pedidos.tsx`

**Ubicación:** Sección "Agregar Productos" → Campo "Precio Unitario" (líneas ~350-400)

**Cambios en `handleUpdateProducto()`:**
```typescript
const handleUpdateProducto = (index: number, field: keyof ProductoEnPedido, value: any) => {
  const newProductos = [...productosEnPedido];
  
  if (field === 'producto_id') {
    const producto = productosDisponibles.find((p) => String(p.id) === String(value));
    if (producto) {
      // Cargar precio automáticamente
      newProductos[index] = {
        ...newProductos[index],
        producto_id: String(producto.id),
        nombre: producto.nombre,
        precio_unitario: Number(producto.precio) || 0, // ← AUTO-CARGADO
        subtotal: (Number(producto.precio) || 0) * newProductos[index].cantidad
      };
    }
  } else if (field === 'cantidad') {
    const cantidad = parseInt(value) || 1;
    newProductos[index] = {
      ...newProductos[index],
      cantidad,
      subtotal: newProductos[index].precio_unitario * cantidad // ← Usar precio cargado
    };
  }
  
  setProductosEnPedido(newProductos);
};
```

**Cambio en UI:** Hacer campo `precio_unitario` read-only (no editable) cuando se selecciona producto:
```jsx
<input
  type="number"
  value={item.precio_unitario}
  disabled={true} // ← Siempre disabled
  className="bg-gray-100 text-gray-600 cursor-not-allowed"
/>
```

---

## 2.4 💾 PERSISTENCIA DE ESTADO PEDIDO (CORRECCIÓN)

**Duración estimada:** 0.5 día  
**Descripción:** Guardar y recuperar cambios de estado en Pedidos correctamente

### Backend - `backend/src/models/entities.models.js` - Pedidos.update() (REVISIÓN)

Ya implementado en FASE 1.5, pero verificar:

1. ✅ SQL usa `COALESCE()` para permitir actualización parcial
2. ✅ UPDATE incluye `updated_at = CURRENT_TIMESTAMP`
3. ✅ Verificación post-update:
```sql
SELECT estado FROM pedidos WHERE id = $1
```
4. ✅ If discrepancia → console.warn()

**Validación adicional necesaria:** Verificar que tabla `pedidos` tiene columna `updated_at`

```sql
ALTER TABLE pedidos ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
```

---

## 2.5 🔄 FLUJO ENCADENADO: PEDIDO → DOMICILIO → VENTA (VALIDACIÓN)

**Duración estimada:** 1 día  
**Descripción:** Validar que cambios de estado se propagan correctamente entre módulos

### Backend - Validación en controllers

**Archivo:** `backend/src/controllers/pedidos.controllers.js` (líneas 106-200) - YA IMPLEMENTADO

**Archivo:** `backend/src/controllers/domicilios.controllers.js` - VERIFICAR (líneas 1-50)

**Verificación:**
1. Pedido cambio → Completado: Auto-crear Domicilio en estado 'Pendiente' ✅
2. Domicilio cambio → Entregado: Auto-crear Venta en estado 'Pendiente' ✅
3. Transiciones que ROMPEN flujo deben validarse:
   - Si Domicilio está en Entregado y Venta en Completada, NO permitir cambiar Pedido a Pendiente
   - Validación: Si Pedido tiene Domicilio con estado Entregado, estado final

**Código a agregar en Pedidos.update():**

```javascript
// Verificar que si hay Domicilio entregado, Pedido NO puede cambiar de Completado
if (data.estado && data.estado !== current.estado) {
  const domicilios = await models.Domicilios.getByPedido(id);
  const tieneEntregado = domicilios?.some(d => d.estado === 'Entregado');
  
  if (tieneEntregado && data.estado !== 'Completado') {
    const error = new Error(
      'No se puede cambiar estado: existe Domicilio Entregado vinculado'
    );
    error.statusCode = 409;
    throw error;
  }
}
```

---

## 2.6 💳 MÉTODO PAGO + ABONO: EFECTIVO/TRANSFERENCIA + 50%/100% (NUEVA FEATURE)

**Duración estimada:** 1.5 días  
**Descripción:** Agregar campos de método de pago y esquema de abono en Pedidos y Ventas

### Backend - Cambios en base de datos

**Archivo:** Migration SQL (nuevo archivo: `backend/historias-migraciones/018_add_metodo_pago_abono.sql`)

```sql
-- Agregar columnas a tabla pedidos
ALTER TABLE pedidos 
ADD COLUMN metodo_pago VARCHAR(20) DEFAULT 'Efectivo' CHECK (metodo_pago IN ('Efectivo', 'Transferencia')),
ADD COLUMN esquema_abono VARCHAR(20) DEFAULT '100%' CHECK (esquema_abono IN ('50%', '100%')),
ADD COLUMN fecha_pago TIMESTAMP;

-- Agregar columnas a tabla ventas
ALTER TABLE ventas
ADD COLUMN metodo_pago VARCHAR(20) DEFAULT 'Efectivo' CHECK (metodo_pago IN ('Efectivo', 'Transferencia')),
ADD COLUMN esquema_abono VARCHAR(20) DEFAULT '100%' CHECK (esquema_abono IN ('50%', '100%')),
ADD COLUMN abono_recibido NUMERIC(15,2) DEFAULT 0;
```

### Frontend - `src/components/pages/ventas/Pedidos.tsx`

**Ubicación:** Modal "Crear/Editar Pedido" (líneas ~200-250)

**Cambios:**
1. Agregar campos en `formData`:
```typescript
const [formData, setFormData] = useState({
  // ... campos existentes
  metodo_pago: 'Efectivo',
  esquema_abono: '100%'
});
```

2. Agregar en formulario (antes del botón Guardar):
```jsx
<FormField
  label="Método de Pago"
  type="select"
  value={formData.metodo_pago}
  onChange={(e) => setFormData({...formData, metodo_pago: e.target.value})}
  options={[
    { label: '💵 Efectivo', value: 'Efectivo' },
    { label: '🏦 Transferencia', value: 'Transferencia' }
  ]}
/>

<FormField
  label="Esquema de Abono"
  type="select"
  value={formData.esquema_abono}
  onChange={(e) => setFormData({...formData, esquema_abono: e.target.value})}
  options={[
    { label: '50% (Inicial)', value: '50%' },
    { label: '100% (Total)', value: '100%' }
  ]}
/>

{formData.esquema_abono === '50%' && (
  <div className="p-3 bg-yellow-50 border border-yellow-300 rounded">
    <p className="text-sm text-yellow-700 font-semibold">
      💡 Abono requerido: {formatCurrency((calcularTotal() * 0.5))}
    </p>
  </div>
)}
```

3. Incluir en payload al guardar:
```typescript
const payload = {
  ...formData,
  metodo_pago: formData.metodo_pago,
  esquema_abono: formData.esquema_abono
};
```

### Frontend - `src/components/pages/ventas/Ventas.tsx`

**Ubicación:** Modal "Nueva Venta por Pedido" (líneas ~450-500)

**Cambios:** Mismo flujo que Pedidos

**Agregar también:**
```jsx
<FormField
  label="Abono Recibido"
  type="number"
  value={formData.abono_recibido}
  onChange={(e) => {
    const valor = parseFloat(e.target.value) || 0;
    setFormData({...formData, abono_recibido: valor});
  }}
  min="0"
  step="0.01"
  placeholder="0"
/>

{formData.esquema_abono === '50%' && (
  <div className="p-3 bg-orange-50 border border-orange-300 rounded">
    <p className="text-sm text-orange-700">
      Total: {formatCurrency(calcularTotal())} | 
      Abono requerido: {formatCurrency(calcularTotal() * 0.5)} |
      Recibido: {formatCurrency(formData.abono_recibido)}
    </p>
  </div>
)}
```

### Backend - Actualizar models

**Archivos:**
- `backend/src/models/entities.models.js` - Pedidos.create() (líneas ~1088-1110)
- `backend/src/models/entities.models.js` - Pedidos.update() (líneas ~1140-1160)
- `backend/src/models/entities.models.js` - Ventas.create() (líneas ~1310-1340)

**Cambio:** Incluir en INSERT/UPDATE:
```javascript
// Pedidos
INSERT INTO pedidos (..., metodo_pago, esquema_abono)
VALUES (..., $8, $9)

// Ventas
INSERT INTO ventas (..., metodo_pago, esquema_abono, abono_recibido)
VALUES (..., $10, $11, $12)
```

---

## 2.7 📊 TABLA PEDIDOS: CARGAR DATOS CORRECTOS DE CREACIÓN (CORRECCIÓN)

**Duración estimada:** 1 día  
**Descripción:** Tabla muestra cantidad de productos y al expandir "Ver Detalles" lista todos

### Frontend - `src/components/pages/ventas/Pedidos.tsx`

**Ubicación:** Modal "Ver Detalles" del Pedido (líneas ~700-800)

**Cambios:**
1. Función `handleViewDetails()`:
```typescript
const handleViewDetails = async (pedido: Pedido) => {
  try {
    // Cargar detalles del pedido
    const detalles = await pedidosAPI.getDetalles(pedido.id);
    setSelectedPedido(pedido);
    setProductosEnPedido(detalles);
    setIsDetailModalOpen(true);
  } catch (error) {
    showAlert({
      title: 'Error',
      description: 'No se pudieron cargar los detalles del pedido',
      type: 'error'
    });
  }
};
```

2. Modal "Ver Detalles" - Mostrar tabla con:
   - Producto Name
   - Cantidad
   - Precio Unitario
   - Subtotal
   - Total calculado

```jsx
<Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)}>
  <div className="p-6">
    <h2 className="text-xl font-bold mb-4">Detalles del Pedido {selectedPedido?.numero_pedido}</h2>
    
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-100">
          <th className="border p-2 text-left">Producto</th>
          <th className="border p-2 text-right">Cantidad</th>
          <th className="border p-2 text-right">Precio Unit.</th>
          <th className="border p-2 text-right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {productosEnPedido.map((p) => (
          <tr key={p.producto_id} className="border-b">
            <td className="border p-2">{p.nombre}</td>
            <td className="border p-2 text-right">{p.cantidad}</td>
            <td className="border p-2 text-right">{formatCurrency(p.precio_unitario)}</td>
            <td className="border p-2 text-right font-semibold">{formatCurrency(p.subtotal)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-green-50 font-bold">
          <td colSpan="3" className="border p-2 text-right">TOTAL:</td>
          <td className="border p-2 text-right text-green-700">
            {formatCurrency(selectedPedido?.total || 0)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</Modal>
```

---

## 2.8 👀 PRODUCTOS READ-ONLY EN VENTA (CORRECCIÓN)

**Duración estimada:** 0.5 días  
**Descripción:** Tabla de productos en Venta por Pedido no permite edición

### Frontend - `src/components/pages/ventas/Ventas.tsx`

**Ubicación:** Tabla de productos (líneas ~550-620)

**Cambios:**
1. Cuando `isProductosFromPedido === true`: todos los inputs disabled
```jsx
<input
  type="number"
  value={item.cantidad}
  disabled={isProductosFromPedido} // ← Disabled si es desde pedido
  className={isProductosFromPedido ? "bg-gray-100 text-gray-600 cursor-not-allowed" : ""}
/>
```

2. Remover botones "Eliminar" si `isProductosFromPedido === true`
```jsx
{!isProductosFromPedido && (
  <button
    onClick={() => handleEliminarProducto(index)}
    className="text-red-500 hover:text-red-700"
  >
    <Trash2 size={18} />
  </button>
)}

{isProductosFromPedido && (
  <span className="text-gray-400">🔒 Bloqueado</span>
)}
```

3. Mostrar badge de protección:
```jsx
{isProductosFromPedido && (
  <div className="absolute top-2 right-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
    🔒 Productos vinculados al pedido
  </div>
)}
```

---

# FASE 3: NUEVAS FEATURES (4-5 DÍAS)

## 3.1 🏷️ TIPOS DE PRODUCTO: TERMINADO VS PREPARACIÓN

**Duración estimada:** 1.5 días  
**Descripción:** Agregar categorización de productos en 2 tipos: Terminados (listos venta) vs Preparación (requieren insumos)

### Backend - Cambios en base de datos

**Archivo:** Migration SQL (nuevo: `backend/historias-migraciones/019_add_tipo_producto.sql`)

```sql
-- Agregar columna a tabla productos
ALTER TABLE productos 
ADD COLUMN tipo_producto VARCHAR(20) DEFAULT 'Terminado' 
CHECK (tipo_producto IN ('Terminado', 'Preparacion'));

-- Crear tabla producto_tipos para referencia
CREATE TABLE IF NOT EXISTS producto_tipos (
  id SERIAL PRIMARY KEY,
  tipo_producto VARCHAR(20) UNIQUE NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO producto_tipos (tipo_producto, descripcion) VALUES
('Terminado', 'Producto final listo para venta'),
('Preparacion', 'Producto que requiere preparación con insumos');
```

### Frontend - `src/components/pages/compras/Productos.tsx`

**Ubicación:** Modal "Crear/Editar Producto" (líneas ~150-200)

**Cambios:**
1. Agregar en `formData`:
```typescript
const [formData, setFormData] = useState({
  // ...
  tipo_producto: 'Terminado'
});
```

2. Agregar FormField:
```jsx
<FormField
  label="Tipo de Producto"
  type="select"
  value={formData.tipo_producto}
  onChange={(e) => setFormData({...formData, tipo_producto: e.target.value})}
  options={[
    { label: '✅ Terminado (Listo para venta)', value: 'Terminado' },
    { label: '🔧 Preparación (Requiere insumos)', value: 'Preparacion' }
  ]}
/>
```

3. Agregar columna en tabla principal:
```jsx
{
  key: 'tipo_producto',
  label: 'Tipo',
  render: (value: string) => (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${
      value === 'Terminado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
    }`}>
      {value === 'Terminado' ? '✅ Terminado' : '🔧 Preparación'}
    </span>
  )
}
```

### Backend - Actualizar models

**Archivo:** `backend/src/models/entities.models.js` - Productos

```javascript
// En Productos.create():
const result = await pool.query(
  `INSERT INTO productos (nombre, categoria_id, tipo_producto, descripcion, precio, stock, stock_minimo, imagen_url, estado)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
   RETURNING id`,
  [data.nombre, data.categoria_id, data.tipo_producto || 'Terminado', data.descripcion, data.precio, 0, data.stock_minimo, data.imagen_url, 'Activo']
);

// En Productos.update():
// Incluir tipo_producto en UPDATE si se proporciona
```

---

## 3.2 🧪 RELACIÓN INSUMO-PRODUCTO: PROPORCIONES Y CONSUMO AUTOMÁTICO

**Duración estimada:** 2 días  
**Descripción:** Vincular insumos a productos Preparación con proporciones y consumo automático de stock

### Backend - Cambios en base de datos

**Archivo:** Migration SQL (nuevo: `backend/historias-migraciones/020_add_insumo_producto_relacion.sql`)

```sql
-- Crear tabla insumos
CREATE TABLE IF NOT EXISTS insumos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL UNIQUE,
  descripcion TEXT,
  unidad_medida VARCHAR(50), -- 'ml', 'gramos', 'unidades', etc.
  stock NUMERIC(15,2) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(15,2) DEFAULT 0,
  precio_unitario NUMERIC(10,2) DEFAULT 0,
  proveedor_id INTEGER REFERENCES proveedores(id),
  estado VARCHAR(20) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla relación producto-insumo
CREATE TABLE IF NOT EXISTS producto_insumos (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  cantidad_requerida NUMERIC(10,4) NOT NULL, -- Proporción
  UNIQUE(producto_id, insumo_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla para auditar consumo de insumos
CREATE TABLE IF NOT EXISTS insumo_movimientos (
  id SERIAL PRIMARY KEY,
  insumo_id INTEGER NOT NULL REFERENCES insumos(id),
  tipo_movimiento VARCHAR(20), -- 'Entrada', 'Salida'
  cantidad NUMERIC(10,4) NOT NULL,
  documento_tipo VARCHAR(50), -- 'Compra', 'Venta', etc.
  documento_id INTEGER,
  observaciones TEXT,
  created_by INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Backend - Nuevos Models

**Archivo:** Agregar al `backend/src/models/entities.models.js`

```javascript
const Insumos = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT i.*, 
             COUNT(pi.id) as productos_relacionados
      FROM insumos i
      LEFT JOIN producto_insumos pi ON i.id = pi.insumo_id
      WHERE i.estado = 'Activo'
      GROUP BY i.id
      ORDER BY i.nombre
    `);
    return result.rows;
  },
  
  getById: async (id) => {
    const result = await pool.query(`
      SELECT i.*,
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'producto_id', p.id,
                 'producto_nombre', p.nombre,
                 'cantidad_requerida', pi.cantidad_requerida
               )
             ) as productos
      FROM insumos i
      LEFT JOIN producto_insumos pi ON i.id = pi.insumo_id
      LEFT JOIN productos p ON pi.producto_id = p.id
      WHERE i.id = $1
      GROUP BY i.id
    `, [id]);
    return result.rows[0];
  },

  create: async (data) => {
    const result = await pool.query(
      `INSERT INTO insumos (nombre, descripcion, unidad_medida, stock, stock_minimo, precio_unitario, proveedor_id, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [data.nombre, data.descripcion, data.unidad_medida, 0, data.stock_minimo, data.precio_unitario, data.proveedor_id || null, 'Activo']
    );
    return result.rows[0].id;
  },

  update: async (id, data) => {
    try {
      await pool.query(
        `UPDATE insumos 
         SET nombre = COALESCE($2, nombre),
             descripcion = COALESCE($3, descripcion),
             stock_minimo = COALESCE($4, stock_minimo),
             precio_unitario = COALESCE($5, precio_unitario),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, data.nombre || null, data.descripcion || null, data.stock_minimo || null, data.precio_unitario || null]
      );
      return true;
    } catch (error) {
      error.statusCode = 500;
      throw error;
    }
  },

  consumir: async (insumoId, cantidad) => {
    try {
      const current = await pool.query('SELECT stock FROM insumos WHERE id = $1', [insumoId]);
      if (!current.rows[0]) throw new Error('Insumo no encontrado');
      
      if (current.rows[0].stock < cantidad) {
        const error = new Error('Stock insuficiente del insumo');
        error.statusCode = 400;
        throw error;
      }
      
      await pool.query(
        'UPDATE insumos SET stock = stock - $2 WHERE id = $1',
        [insumoId, cantidad]
      );
      
      // Registrar movimiento
      await pool.query(
        'INSERT INTO insumo_movimientos (insumo_id, tipo_movimiento, cantidad, documento_tipo) VALUES ($1, $2, $3, $4)',
        [insumoId, 'Salida', cantidad, 'Venta']
      );
      
      return true;
    } catch (error) {
      error.statusCode = error.statusCode || 500;
      throw error;
    }
  }
};

const ProductoInsumos = {
  vincular: async (productoId, insumoId, cantidadRequerida) => {
    try {
      await pool.query(
        'INSERT INTO producto_insumos (producto_id, insumo_id, cantidad_requerida) VALUES ($1, $2, $3)',
        [productoId, insumoId, cantidadRequerida]
      );
      return true;
    } catch (error) {
      error.statusCode = error.statusCode || 500;
      throw error;
    }
  },

  desvincular: async (productoId, insumoId) => {
    await pool.query(
      'DELETE FROM producto_insumos WHERE producto_id = $1 AND insumo_id = $2',
      [productoId, insumoId]
    );
    return true;
  },

  getByProducto: async (productoId) => {
    const result = await pool.query(
      `SELECT pi.*, i.nombre, i.unidad_medida, i.stock
       FROM producto_insumos pi
       JOIN insumos i ON pi.insumo_id = i.id
       WHERE pi.producto_id = $1`,
      [productoId]
    );
    return result.rows;
  }
};
```

---

## 3.3 📚 CRUD ENDPOINTS INSUMOS: GET, POST, PUT, DELETE

**Duración estimada:** 1 día  
**Descripción:** Crear rutas backend para gestionar insumos

### Backend - `backend/src/routes/insumos.routes.js` (NUEVO ARCHIVO)

```javascript
const express = require('express');
const router = express.Router();
const controllers = require('../controllers/insumos.controllers');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth.middlewares');

// GET - Listar todos insumos
router.get('/', authMiddleware, controllers.getAll);

// GET - Obtener insumo por ID
router.get('/:id', authMiddleware, controllers.getById);

// POST - Crear insumo (Solo Admin)
router.post('/', authMiddleware, roleMiddleware(['Administrador']), controllers.create);

// PUT - Actualizar insumo (Solo Admin)
router.put('/:id', authMiddleware, roleMiddleware(['Administrador']), controllers.update);

// DELETE - Eliminar insumo (Solo Admin)
router.delete('/:id', authMiddleware, roleMiddleware(['Administrador']), controllers.delete);

// POST - Vincular insumo a producto
router.post('/vincular/:productoId', authMiddleware, roleMiddleware(['Administrador']), controllers.vincularInsumo);

// DELETE - Desvincular insumo de producto
router.delete('/desvincular/:productoId/:insumoId', authMiddleware, roleMiddleware(['Administrador']), controllers.desvincularInsumo);

module.exports = router;
```

### Backend - `backend/src/controllers/insumos.controllers.js` (NUEVO ARCHIVO)

```javascript
const models = require('../models');

module.exports = {
  getAll: async (req, res) => {
    try {
      const insumos = await models.Insumos.getAll();
      return res.json({ success: true, data: insumos });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  getById: async (req, res) => {
    try {
      const insumo = await models.Insumos.getById(req.params.id);
      if (!insumo) {
        return res.status(404).json({ success: false, message: 'Insumo no encontrado' });
      }
      return res.json({ success: true, data: insumo });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { nombre, descripcion, unidad_medida, stock_minimo, precio_unitario, proveedor_id } = req.body;
      
      if (!nombre) {
        return res.status(400).json({ success: false, message: 'Nombre es requerido' });
      }

      const id = await models.Insumos.create({
        nombre,
        descripcion,
        unidad_medida,
        stock_minimo: parseFloat(stock_minimo) || 0,
        precio_unitario: parseFloat(precio_unitario) || 0,
        proveedor_id
      });

      return res.status(201).json({ success: true, id, message: 'Insumo creado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  update: async (req, res) => {
    try {
      await models.Insumos.update(req.params.id, req.body);
      return res.json({ success: true, message: 'Insumo actualizado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },

  delete: async (req, res) => {
    try {
      // Implementar soft delete
      await models.Insumos.update(req.params.id, { estado: 'Inactivo' });
      return res.json({ success: true, message: 'Insumo eliminado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  vincularInsumo: async (req, res) => {
    try {
      const { insumo_id, cantidad_requerida } = req.body;
      
      if (!insumo_id || !cantidad_requerida) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos' });
      }

      await models.ProductoInsumos.vincular(
        req.params.productoId,
        insumo_id,
        parseFloat(cantidad_requerida)
      );

      return res.json({ success: true, message: 'Insumo vinculado al producto' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  desvincularInsumo: async (req, res) => {
    try {
      await models.ProductoInsumos.desvincular(req.params.productoId, req.params.insumoId);
      return res.json({ success: true, message: 'Insumo desvinculado del producto' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
};
```

### Backend - Registrar rutas en `backend/index.js`

```javascript
const insumosRoutes = require('./src/routes/insumos.routes');
app.use('/api/insumos', insumosRoutes);
```

---

## 3.4 🖥️ MÓDULO FRONTEND INSUMOS: UI COMPLETA CON CRUD

**Duración estimada:** 2 días  
**Descripción:** Crear interfaz web para gestionar insumos

### Frontend - `src/components/pages/compras/Insumos.tsx` (NUEVO ARCHIVO)

**Estructura:**
```typescript
// 1. Interface
interface Insumo {
  id: number;
  nombre: string;
  descripcion?: string;
  unidad_medida: string;
  stock: number;
  stock_minimo: number;
  precio_unitario: number;
  productos_relacionados: number;
}

// 2. Componente principal
export function Insumos() {
  // Estados
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedInsumo, setSelectedInsumo] = useState<Insumo | null>(null);
  
  // Formulario
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    unidad_medida: 'gramos',
    stock_minimo: 0,
    precio_unitario: 0
  });

  // Funciones CRUD
  const handleCreate = async (e) => { /* ... */ };
  const handleUpdate = async (e) => { /* ... */ };
  const handleDelete = async (insumoId) => { /* ... */ };

  // Render tabla con columnas:
  // - Nombre
  // - Unidad Medida
  // - Stock Actual
  // - Stock Mínimo
  // - Precio Unitario
  // - Productos Relacionados
  // - Acciones (Edit, Delete, Vincular)
}
```

**Características:**
- Tabla paginada de insumos
- Modal crear nuevo insumo
- Modal editar insumo
- Botón vincular a producto
- Búsqueda por nombre
- Filtro por stock bajo
- Alertas visuales cuando stock < stock_minimo

---

## 3.5 📈 VENTA POR PEDIDO: FLUJO COMPLETO CON TODAS LAS FEATURES

**Duración estimada:** 1 día  
**Descripción:** Integrar todas las features de FASE 3 en flujo de Venta por Pedido

### Frontend - `src/components/pages/ventas/Ventas.tsx`

**Cambios finales:**
1. ✅ Select dinámico de Pedidos (FASE 2.1)
2. ✅ Cargar productos desde pedido (FASE 2.2)
3. ✅ Productos read-only (FASE 2.8)
4. ✅ Método pago + esquema abono (FASE 2.6)
5. ✅ Consumo automático de insumos si producto es tipo "Preparación"

```typescript
// Agregar lógica de consumo de insumos
const handleGuardarVenta = async () => {
  // 1. Validar que abono cumpla con esquema
  if (formData.esquema_abono === '50%') {
    const abonoDebe = formData.total * 0.5;
    if (formData.abono_recibido < abonoDebe) {
      showAlert({
        title: 'Abono insuficiente',
        description: `Debe recibir mínimo ${formatCurrency(abonoDebe)}`,
        type: 'warning'
      });
      return;
    }
  }

  // 2. Guardar venta
  const ventaId = await ventasAPI.create(formData);

  // 3. Consumir insumos para productos tipo "Preparacion"
  for (const item of formData.items) {
    const producto = productosDisponibles.find(p => p.id === item.producto_id);
    
    if (producto?.tipo_producto === 'Preparacion') {
      const insumos = await getProductoInsumos(producto.id);
      
      for (const insumo of insumos) {
        const cantidadAConsumir = insumo.cantidad_requerida * item.cantidad;
        await consumirInsumo(insumo.insumo_id, cantidadAConsumir);
      }
    }
  }

  showAlert({
    title: 'Éxito',
    description: 'Venta creada exitosamente',
    type: 'success'
  });
};
```

---

# FASE 4: VALIDACIONES Y TESTING (2 DÍAS)

## 4.1 ✅ VALIDACIONES GLOBALES (TODAS LAS FASES)

**Duración estimada:** 1 día  
**Descripción:** Agregar validaciones en frontend y backend para tipos de datos, rangos y formatos

### Validación 1: FECHAS NO PASADAS (Frontend + Backend)

**Frontend - Utility: `src/utils/validations.ts`**

```typescript
export const isValidFutureDate = (date: string | Date): boolean => {
  const input = new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  input.setHours(0, 0, 0, 0);
  return input >= now;
};

export const getFutureMinDate = (): string => {
  const today = new Date();
  today.setDate(today.getDate() + 1); // Mínimo mañana
  return today.toISOString().split('T')[0];
};
```

**Frontend - Uso en Formularios:**

```jsx
// En Pedidos.tsx
<FormField
  label="Fecha Entrega"
  type="date"
  value={formData.fecha_entrega}
  onChange={(e) => {
    if (!isValidFutureDate(e.target.value)) {
      showAlert({
        title: 'Fecha inválida',
        description: 'La fecha debe ser futura',
        type: 'error'
      });
      return;
    }
    setFormData({...formData, fecha_entrega: e.target.value});
  }}
  min={getFutureMinDate()}
/>
```

**Backend - En todos los controllers:**

```javascript
// Verificar fecha en create/update
if (data.fecha_entrega) {
  const fecha = new Date(data.fecha_entrega);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  if (fecha < hoy) {
    const error = new Error('La fecha debe ser futura o actual');
    error.statusCode = 400;
    throw error;
  }
}
```

### Validación 2: NO PERMITIR VALORES NEGATIVOS (Frontend + Backend)

**Frontend - En todos los inputs numéricos:**

```jsx
<input
  type="number"
  min="0"
  value={value}
  onChange={(e) => {
    const val = parseFloat(e.target.value);
    if (val < 0) {
      showAlert({
        title: 'Valor inválido',
        description: 'No se permiten valores negativos',
        type: 'error'
      });
      return;
    }
    setFormData({...formData, field: val});
  }}
/>
```

**Backend - Validación en models:**

```javascript
// Cantidad debe ser > 0
if (data.cantidad && parseFloat(data.cantidad) <= 0) {
  const error = new Error('La cantidad debe ser mayor a 0');
  error.statusCode = 400;
  throw error;
}

// Precio debe ser >= 0
if (data.precio && parseFloat(data.precio) < 0) {
  const error = new Error('El precio no puede ser negativo');
  error.statusCode = 400;
  throw error;
}
```

### Validación 3: PERMITIR ENTRADA DIRECTA DE CANTIDADES (NO SOLO INCREMENT/DECREMENT)

**Frontend - Cambio en input cantidad:**

```jsx
// ACTUAL (solo increment/decrement):
<input type="number" step="1" min="1" />

// MEJORADO:
<input
  type="number"
  min="1"
  step="1"
  value={item.cantidad}
  onChange={(e) => {
    const cantidad = parseInt(e.target.value) || 1;
    if (cantidad < 1) {
      showAlert({
        title: 'Cantidad inválida',
        description: 'Mínimo 1 unidad',
        type: 'error'
      });
      return;
    }
    handleUpdateProducto(index, 'cantidad', cantidad);
  }}
  onBlur={(e) => {
    // Validar que no está vacío
    if (!e.target.value) {
      handleUpdateProducto(index, 'cantidad', 1);
    }
  }}
  placeholder="0"
/>
```

**Nota:** Remover atributos `step` restrictivos, permitir entrada libre validada.

---

## 4.2 ✅ SUITE DE PRUEBAS FUNCIONALES (Jest)

**Duración estimada:** 1 día  
**Descripción:** Crear pruebas unitarias y de integración para funciones críticas

### Backend - `backend/__tests__/models.test.js`

```javascript
const { Pedidos, Ventas, Insumos } = require('../src/models/entities.models');

describe('Pedidos Model', () => {
  test('Pedidos.update() debe validar transiciones de estado', async () => {
    // Arrange
    const pedidoId = 1;
    const estadoInvalido = 'InvalidState';

    // Act & Assert
    await expect(
      Pedidos.update(pedidoId, { estado: estadoInvalido })
    ).rejects.toThrow('Estado inválido');
  });

  test('Pedidos.update() debe permitir transición Pendiente → En Proceso', async () => {
    // Test que la transición es válida
  });

  test('Pedidos.update() debe rechazar transición Completado → Pendiente', async () => {
    // Test que estados finales no cambian
  });
});

describe('Ventas Model', () => {
  test('Ventas.create() debe iniciar en estado Pendiente', async () => {
    const venta = await Ventas.create({
      pedido_id: 1,
      cliente_id: 1,
      total: 50000
    });
    
    expect(venta.estado).toBe('Pendiente');
  });

  test('Ventas.create() debe rechazar estados inválidos', async () => {
    await expect(
      Ventas.create({
        estado: 'InvalidState'
      })
    ).rejects.toThrow();
  });
});

describe('Insumos Model', () => {
  test('Insumos.consumir() debe rechazar si stock es insuficiente', async () => {
    await expect(
      Insumos.consumir(1, 1000) // Asumiendo stock < 1000
    ).rejects.toThrow('Stock insuficiente');
  });

  test('Insumos.consumir() debe restar stock correctamente', async () => {
    const before = await Insumos.getById(1);
    await Insumos.consumir(1, 10);
    const after = await Insumos.getById(1);
    
    expect(after.stock).toBe(before.stock - 10);
  });
});
```

### Frontend - `src/__tests__/validations.test.ts`

```typescript
import { isValidFutureDate, isPositiveNumber } from '../utils/validations';

describe('Validations', () => {
  test('isValidFutureDate debe aceptar fechas futuras', () => {
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    
    expect(isValidFutureDate(mañana.toISOString())).toBe(true);
  });

  test('isValidFutureDate debe rechazar fechas pasadas', () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    
    expect(isValidFutureDate(ayer.toISOString())).toBe(false);
  });

  test('isPositiveNumber debe aceptar valores > 0', () => {
    expect(isPositiveNumber(10)).toBe(true);
    expect(isPositiveNumber(0.5)).toBe(true);
  });

  test('isPositiveNumber debe rechazar valores <= 0', () => {
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-5)).toBe(false);
  });
});
```

### Frontend - `src/__tests__/Pedidos.integration.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pedidos } from '../components/pages/ventas/Pedidos';

describe('Pedidos Integration', () => {
  test('Debe mostrar alerta cuando se intenta guardar sin productos', async () => {
    const { getByText, getByRole } = render(<Pedidos />);
    
    const guardarBtn = getByRole('button', { name: /guardar/i });
    fireEvent.click(guardarBtn);
    
    await waitFor(() => {
      expect(screen.getByText(/debe agregar/i)).toBeInTheDocument();
    });
  });

  test('Debe cargar productos cuando se selecciona un pedido', async () => {
    // Asumir setup de formulario Nueva Venta
    // 1. Seleccionar pedido del select dinámico
    // 2. Verificar que productos se cargan
    // 3. Verificar que campo "Agregar Productos" se deshabilita
  });

  test('Debe validar que fecha entrega sea futura', async () => {
    const { getByLabelText, getByRole } = render(<Pedidos />);
    
    const fechaInput = getByLabelText(/fecha entrega/i);
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    
    fireEvent.change(fechaInput, { target: { value: ayer.toISOString().split('T')[0] } });
    
    await waitFor(() => {
      expect(screen.getByText(/debe ser futura/i)).toBeInTheDocument();
    });
  });
});
```

---

## 4.3 ✅ PRUEBAS DE REGRESIÓN

**Duración estimada:** 0.5 días  
**Descripción:** Verificar que cambios nuevos no rompen funcionalidad existente

**Checklist de regresión:**

- [ ] **Compras:** Stock no se modifica manualmente
- [ ] **Compras:** Alerta visible cuando no hay productos
- [ ] **Pedidos:** Estado se guarda correctamente
- [ ] **Pedidos:** Tabla muestra cantidad de productos
- [ ] **Domicilios:** Auto-se crea al completar Pedido
- [ ] **Domicilios:** Auto-crear Venta al entregar
- [ ] **Ventas:** Estado inicial es "Pendiente"
- [ ] **Ventas:** Select de Pedido carga productos
- [ ] **Productos:** Stock inmutable desde UI
- [ ] **Insumos:** Stock se consume al vender producto Preparación
- [ ] **Auth:** Roles mantienen permisos correctos
- [ ] **API:** Endpoints devuelven formatos correctos
- [ ] **Validaciones:** Fechas pasadas rechazadas
- [ ] **Validaciones:** Negativos rechazados
- [ ] **Validaciones:** Cantidades permiten entrada directa

---

# RESUMEN CONSOLIDADO DE CAMBIOS

## Por Archivo

### Frontend
- `src/components/pages/compras/Productos.tsx` - Remover stock manual
- `src/components/pages/compras/Compras.tsx` - Alerta visible
- `src/components/pages/ventas/Pedidos.tsx` - Mostrar productos, precio auto, detalles
- `src/components/pages/ventas/Ventas.tsx` - Select dinámico, productos vinculados
- `src/components/pages/compras/Insumos.tsx` - NUEVO módulo CRUD
- `src/utils/validations.ts` - NUEVO utilidades de validación
- `src/__tests__/*.test.ts` - NUEVAS pruebas

### Backend
- `backend/src/models/entities.models.js` - Todas las validaciones, models nuevos
- `backend/src/controllers/pedidos.controllers.js` - Transiciones y permisos
- `backend/src/controllers/domicilios.controllers.js` - Auto-crear Venta
- `backend/src/controllers/insumos.controllers.js` - NUEVO CRUD
- `backend/src/routes/insumos.routes.js` - NUEVAS rutas
- `backend/historias-migraciones/018*.sql` - NUEVAS migrations
- `backend/__tests__/*.test.js` - NUEVAS pruebas

### Base de Datos (Migrations)
```
018_add_metodo_pago_abono.sql      → Métodos pago + esquema abono
019_add_tipo_producto.sql           → Tipos de producto
020_add_insumo_producto_relacion.sql → Insumos y relaciones
```

---

# VALIDACIONES FINALES POR MÓDULO

| Módulo | Validación | Frontend | Backend |
|--------|-----------|----------|---------|
| Productos | Stock no editable | ✅ Hidden | ✅ Force 0 |
| Compras | Mínimo 1 producto | ✅ Alerta | ✅ Validation |
| Pedidos | Fecha futura | ✅ min=date | ✅ Date check |
| Pedidos | Cantidad > 0 | ✅ min=1 | ✅ Check |
| Pedidos | Estado válido | ✅ Select | ✅ Enum |
| Pedidos | Transición válida | ✅ Disabled | ✅ Validation |
| Ventas | Precio del producto | ✅ Auto-load | ✅ N/A |
| Ventas | Abono suficiente | ✅ Alert | ✅ Validation |
| Venta (Pedido) | Productos read-only | ✅ Disabled | ✅ No update |
| Insumos | Stock positivo | ✅ min=0 | ✅ Check |
| Insumos | Consumo válido | ✅ N/A | ✅ Stock check |

---

# CRONOGRAMA ESTIMADO

| Fase | Duración | Inicio | Fin |
|------|----------|--------|-----|
| FASE 1 | 3 días | Day 1 | Day 3 |
| FASE 2 | 3-4 días | Day 4 | Day 7 |
| FASE 3 | 4-5 días | Day 8 | Day 12 |
| FASE 4 | 2 días | Day 13 | Day 14 |
| **TOTAL** | **12-14 días** | | |

---

# NOTAS IMPORTANTES

1. ✅ **FASE 1 COMPLETADA** - Se implementaron todas las 5 correcciones críticas
2. 🔄 **FASE 2 - PRÓXIMA** - Correcciones intermedias requieren completar FASE 1 primero
3. 🆕 **FASE 3** - Depende de FASE 2 (particularmente 2.6 para método pago)
4. ✔️ **FASE 4** - Pruebas deben ejecutarse continuamente, no solo al final
5. 📝 **Validaciones** - Se implementan en cada fase, no son independientes
6. 🔐 **Seguridad** - Todas las validaciones se implementan en backend (frontend es complementario)
7. 🧪 **Testing** - Comenzar pruebas unitarias en paralelo desde FASE 2

---

**Plan preparado:** 30 Abril 2026  
**Última revisión:** Hoy  
**Estado:** Listo para implementación
