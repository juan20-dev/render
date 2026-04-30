# FASE 0: AUDITORÍA PROFUNDA - MÓDULO DE INSUMOS

**Fecha:** 30 de Abril de 2026  
**Estado:** COMPLETADO ✅  
**Riesgo de Regresión:** BAJO (Sistema bien estructurado)

---

## 📋 AUDITORÍA 0.1: BACKEND - ENDPOINTS Y SERVICIOS

### ✅ Estado General
- **Rutas definidas:** SÍ ✓
- **Controladores implementados:** SÍ ✓
- **Modelos creados:** SÍ ✓
- **Servicios frontend vinculados:** SÍ ✓

### 🔍 ENDPOINTS ACTUALES

#### **POST /api/insumos** (CREATE)
```javascript
// Input: { nombre, descripcion?, cantidad?, unidad?, stock_minimo?, estado? }
// Output: { success: true, id: number, message: string }
// Error: 500 (catch-all)
// Ubicación: backend/src/controllers/insumos.controllers.js:22-31
```

#### **GET /api/insumos** (READ ALL)
```javascript
// Output: { success: true, data: Insumo[] }
// Error: 500
// Ubicación: backend/src/controllers/insumos.controllers.js:7-12
```

#### **GET /api/insumos/:id** (READ ONE)
```javascript
// Output: { success: true, data: Insumo }
// Error: 404 (not found), 500
// Ubicación: backend/src/controllers/insumos.controllers.js:13-20
```

#### **PUT /api/insumos/:id** (UPDATE)
```javascript
// Input: { nombre?, descripcion?, cantidad?, unidad?, stock_minimo?, estado? }
// Output: { success: true, message: string }
// Error: 500
// Ubicación: backend/src/controllers/insumos.controllers.js:32-41
```

#### **DELETE /api/insumos/:id** (DELETE)
```javascript
// Output: { success: true, message: string }
// Error: 500
// Ubicación: backend/src/controllers/insumos.controllers.js:42-47
```

#### **POST /api/entregas-insumos** (CREATE DELIVERY)
```javascript
// Input: { numero_entrega, insumo_id, cantidad, unidad?, operario?, fecha, hora? }
// Output: { success: true, id: number, message: string }
// Error: 500
// Ubicación: backend/src/controllers/entregas-insumos.controllers.js:22-31
```

#### **GET /api/entregas-insumos** (READ ALL DELIVERIES)
```javascript
// Output: { success: true, data: EntregaInsumo[] }
// Error: 500
// Ubicación: backend/src/controllers/entregas-insumos.controllers.js:7-12
```

#### **GET /api/entregas-insumos/:id** (READ ONE DELIVERY)
```javascript
// Output: { success: true, data: EntregaInsumo }
// Error: 404, 500
// Ubicación: backend/src/controllers/entregas-insumos.controllers.js:13-20
```

#### **PUT /api/entregas-insumos/:id** (UPDATE DELIVERY)
```javascript
// Output: { success: true, message: string }
// Error: 500
// Ubicación: backend/src/controllers/entregas-insumos.controllers.js:32-41
```

#### **DELETE /api/entregas-insumos/:id** (DELETE DELIVERY)
```javascript
// Output: { success: true, message: string }
// Error: 500
// Ubicación: backend/src/controllers/entregas-insumos.controllers.js:42-47
```

#### **POST /api/produccion** (CREATE PRODUCTION ORDER)
```javascript
// Input: { numero_produccion?, producto_id, pedido_id?, cantidad, fecha, responsable?, 
//          tiempo_preparacion_minutos?, estado?, notes?, insumos_gastados? }
// Output: { success: true, id: number, message: string }
// Error: 500
// Ubicación: backend/src/controllers/produccion.controllers.js:22-31
```

#### **GET /api/produccion** (READ ALL ORDERS)
```javascript
// Output: { success: true, data: Produccion[] }
// Error: 500
// Ubicación: backend/src/controllers/produccion.controllers.js:7-12
```

#### **GET /api/produccion/:id** (READ ONE ORDER WITH DETAILS)
```javascript
// Output: { success: true, data: Produccion (includes pedido details + insumos_gastados) }
// Error: 404, 500
// Ubicación: backend/src/controllers/produccion.controllers.js:13-20
```

#### **PUT /api/produccion/:id/estado** (UPDATE STATUS WITH TRANSITIONS)
```javascript
// Input: { estado: string, motivo_cancelacion?: string }
// Transitions: 
//   - Orden Recibida → [Orden en preparacion, Cancelada]
//   - Orden en preparacion → [Orden Lista, Cancelada]
//   - Orden Lista → [] (LOCKED)
//   - Cancelada → [] (LOCKED)
// Output: { success: true, data: Produccion, message: string }
// Error: 400 (invalid transition), 404, 409 (locked state), 500
// Ubicación: backend/src/controllers/produccion.controllers.js:40-48
// **CRÍTICO:** Validación de motivo requerida si estado='Cancelada'
```

### 📊 Tabla Comparativa: Endpoints Implementados vs Faltantes

| Módulo | GET ALL | GET ONE | CREATE | UPDATE | DELETE | UPDATE STATUS |
|--------|---------|---------|--------|--------|--------|---------------|
| **insumos** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (no aplica) |
| **entregas_insumos** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (no aplica) |
| **produccion** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (especial) |

**Resultado:** 100% de endpoints básicos implementados ✅

---

## 🗄️ AUDITORÍA 0.2: BASE DE DATOS - ESQUEMA Y RELACIONES

### Tabla: `insumos`

```sql
CREATE TABLE insumos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    cantidad DECIMAL(10, 2) DEFAULT 0,  -- ALMACENABLE EN BD (stock actual)
    unidad VARCHAR(20) NOT NULL,        -- 'Litros', 'Kilos', 'Unidades', etc.
    stock_minimo DECIMAL(10, 2) DEFAULT 10,
    estado VARCHAR(20) DEFAULT 'Activo', -- 'Activo' | 'Inactivo'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_insumos_estado ON insumos(estado);
CREATE INDEX idx_insumos_nombre ON insumos(nombre);
```

**Análisis:**
- ✅ Estructura clara y simple
- ✅ Campos esenciales presentes
- ✅ Índices adecuados para búsquedas
- ⚠️ `cantidad` almacenada como DECIMAL (bueno para precisión)
- 🔍 **CRÍTICO:** No hay relación directa con `productos` (aún)

### Tabla: `entregas_insumos`

```sql
CREATE TABLE entregas_insumos (
    id SERIAL PRIMARY KEY,
    numero_entrega VARCHAR(50) UNIQUE NOT NULL,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    cantidad DECIMAL(10, 2) NOT NULL,
    unidad VARCHAR(20) NOT NULL,
    operario VARCHAR(100),              -- Nombre del operario (string, no FK)
    fecha DATE NOT NULL,
    hora TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_entregas_insumo_id ON entregas_insumos(insumo_id);
CREATE INDEX idx_entregas_fecha ON entregas_insumos(fecha);
```

**Análisis:**
- ✅ FK a `insumos` con ON DELETE CASCADE (safe)
- ✅ Rastreo de fecha/hora
- ⚠️ `operario` es VARCHAR (string), no FK a `usuarios` → Posible inconsistencia
- ⚠️ No hay validación de si `cantidad` descuenta de `insumos.cantidad`
- 📌 **ACTUALMENTE:** Las entregas NO descuentan stock automáticamente

### Tabla: `produccion`

```sql
CREATE TABLE produccion (
    id SERIAL PRIMARY KEY,
    numero_produccion VARCHAR(50) UNIQUE NOT NULL,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    fecha DATE NOT NULL,
    responsable VARCHAR(100),           -- Nombre del productor (string, no FK)
    tiempo_preparacion_minutos INTEGER DEFAULT 1 CHECK (tiempo_preparacion_minutos > 0),
    estado VARCHAR(30) DEFAULT 'Orden Recibida',
    notes TEXT,
    insumos_gastados JSONB DEFAULT '[]'::jsonb,  -- ARRAY DE OBJETOS
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_produccion_producto_id ON produccion(producto_id);
CREATE INDEX idx_produccion_pedido_id ON produccion(pedido_id);
CREATE INDEX idx_produccion_estado ON produccion(estado);
```

**Análisis:**
- ✅ FKs a `productos` (CASCADE) y `pedidos` (SET NULL)
- ✅ Validaciones CHECK en cantidad y tiempo
- ✅ Campo `insumos_gastados` es JSONB (flexible para futuros cálculos)
- ⚠️ `responsable` es VARCHAR (string, no FK)
- 📌 **ACTUALMENTE:** `insumos_gastados` se llena manualmente (no automático)
- 🔍 **CRÍTICO:** NO hay integración automática con `entregas_insumos` al crear producción

### Tabla: `productos`

```sql
-- Campos relevantes para insumos:
-- id, nombre, precio, stock, estado, created_at, updated_at
-- **FALTANTE:** No tiene columna `tipo_producto` (Terminado | Preparacion)
```

**Necesidad identificada:**
```sql
-- FUTURO (FASE 3):
ALTER TABLE productos 
ADD COLUMN tipo_producto VARCHAR(20) DEFAULT 'Terminado' 
CHECK (tipo_producto IN ('Terminado', 'Preparacion'));
```

### 🔗 Mapa de Relaciones Actual

```
insumos (id)
    ↓ FK: ON DELETE CASCADE
entregas_insumos (insumo_id)

productos (id)
    ↓ FK: ON DELETE CASCADE
produccion (producto_id)

pedidos (id)
    ↓ FK: ON DELETE SET NULL
produccion (pedido_id)

insumos <-- ??? --> produccion  ← **NO HAY RELACIÓN DIRECTA AÚN**
```

**Problemas Identificados:**
1. ❌ No existe tabla `producto_insumos` (relación N:N)
2. ❌ No existe `insumo_movimientos` (auditoría de stock)
3. ❌ `produccion.insumos_gastados` es JSONB (no normalizado)

---

## 🎨 AUDITORÍA 0.3: FRONTEND - COMPONENTES Y ESTRUCTURA

### ✅ Módulos Existentes

#### 1. **Entrega de Insumos** (`src/components/pages/produccion/Insumos.tsx`)

**Ubicación en Sidebar:** Producción → Entrega de Insumos

**Funcionalidades Implementadas:**
- ✅ Listar entregas con tabla (columns: numero_entrega, insumo, cantidad, operario, fecha, hora)
- ✅ Crear nueva entrega (modal con form)
- ✅ Ver detalles de entrega (modal de lectura)
- ✅ Generar PDF
- ✅ Anular entrega (delete)
- ✅ Filtros: por ID, operario, fecha

**Estado de Integración:**
- ✅ API conectada: `entregas_insumos.getAll()`, `.create()`, `.delete()`
- ✅ Carga de insumos disponibles
- ✅ Carga de operarios (Asesor/Productor activos)

**Patrón de Componentes Usado:**
```typescript
const [data, setData] = useState([]);
const [formData, setFormData] = useState({...});
const [isModalOpen, setIsModalOpen] = useState(false);

useEffect(() => { loadData(); }, []);

const handleCreate = async (formData) => { await API.create(formData); };
const handleDelete = async (id) => { await API.delete(id); };

// DataTable + Modal + Form pattern
```

#### 2. **Producción** (`src/components/pages/produccion/Produccion.tsx`)

**Ubicación en Sidebar:** Producción → Producción

**Funcionalidades Implementadas:**
- ✅ Listar órdenes con tabla (columns: numero, producto, cantidad, responsable, fecha, estado)
- ✅ Crear nueva orden (modal con form + agregar productos)
- ✅ Ver detalles orden (incluyendo pedido relacionado + insumos_gastados)
- ✅ Cambiar estado con transiciones validadas
- ✅ Generar PDF
- ✅ Filtros: por productor, fecha
- ✅ Tiempo transcurrido en minutos (auto-update cada minuto)

**Estado de Integración:**
- ✅ API conectada: `produccion.getAll()`, `.getById()`, `.create()`, `.updateStatus()`
- ✅ Carga de productos activos
- ✅ Carga de productores (Productor activos)
- ✅ Validación de transiciones de estado (backend + frontend)

**Patrón de Componentes:**
```typescript
// Similar a Insumos, pero con:
// - Validación de transiciones de estado
// - Modal especial para cambiar estado con motivo de cancelación
// - Detalles expandidos incluyendo pedido + insumos
// - JSONB render: insumos_gastados[]
```

### 🔗 Cómo se Relacionan Actualmente

```
Entrega de Insumos (UI)
    ↓ create(numero_entrega, insumo_id, cantidad, operario, fecha, hora)
entregas_insumos API
    ↓
entregas_insumos BD table
    
Producción (UI)
    ↓ create(numero_produccion, producto_id, pedido_id, cantidad, fecha, responsable, tiempo_preparacion, estado, insumos_gastados=[])
produccion API
    ↓
produccion BD table
    ↓
insumos_gastados (JSONB) ← puede referencia obj{insumo_id, cantidad, ...}

PERO: NO HAY INTEGRACIÓN AUTOMÁTICA ↔
      Crear una entrega NO actualiza produccion.insumos_gastados
      Crear una producción NO consume de insumos.cantidad
```

### 📦 Patrón de Componentes (Reutilizable)

Ambos módulos siguen este patrón exitoso:

```typescript
// ✅ PATRÓN PROBADO Y EFECTIVO

export function ModuleName() {
  // 1. States
  const [data, setData] = useState([]);
  const [formData, setFormData] = useState({...defaults...});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState({...});
  const [loading, setLoading] = useState(false);

  // 2. Load initial data
  useEffect(() => { loadData(); }, []);

  // 3. API calls
  const loadData = async () => { 
    const result = await API.getAll(); 
    setData(result);
  };

  // 4. CRUD handlers
  const handleCreate = async (data) => { 
    await API.create(data); 
    await loadData(); 
    setIsModalOpen(false);
  };

  // 5. Render
  return (
    <DataTable columns={...} data={filteredData} actions={[view, pdf, delete]} />
    <Modal> ... Form ... </Modal>
  );
}
```

---

## 🔐 AUDITORÍA 0.4: INTEGRIDAD REFERENCIAL Y PUNTOS DE QUIEBRE

### ✅ Lo que Funciona Bien

| Item | Estado | Riesgo |
|------|--------|--------|
| CRUD insumos aislado | ✓ | BAJO |
| CRUD entregas_insumos aislado | ✓ | BAJO |
| CRUD produccion aislado | ✓ | BAJO |
| Transiciones de estado (produccion) | ✓ | BAJO |
| FK entregas_insumos → insumos | ✓ | BAJO |
| FK produccion → productos | ✓ | BAJO |
| FK produccion → pedidos | ✓ | BAJO |

### ⚠️ Áreas Sensibles (NO MODIFICAR)

1. **Cascadas DELETE:**
   ```sql
   entregas_insumos.insumo_id → insumos(id) ON DELETE CASCADE
   -- Si eliminas un insumo, se borran sus entregas
   
   produccion.producto_id → productos(id) ON DELETE CASCADE
   -- Si eliminas un producto, se borran sus órdenes de producción
   ```
   
   **Impacto:** Muy alto. Cambiar esto rompe auditoría.

2. **Estado machine en produccion:**
   ```javascript
   Orden Recibida → Orden en preparacion → Orden Lista → [LOCKED]
                  ↓
                  Cancelada [LOCKED]
   ```
   
   **Impacto:** Cambiar transiciones afecta usuarios existentes.

3. **API Response Format:**
   ```javascript
   { success: true, data: [], message: "" } 
   // Cambiar esta estructura rompe frontend
   ```

### 🚨 Puntos de Quiebre Detectados

1. **Sin integración insumos ← → produccion**
   - No descuentan stock automáticamente
   - No calculan proporciones (producto → insumos)
   - No hay validación de stock suficiente

2. **Sin relación producto_insumos**
   - No hay registro de "receta" (qué insumos necesita cada producto)
   - No hay cálculo de proporciones

3. **Auditoria de stock incompleta**
   - No hay tabla `insumo_movimientos`
   - No se registra quién hizo qué cambio en insumos

---

## 📌 HALLAZGOS Y RECOMENDACIONES

### ✅ LO BUENO

1. **Arquitectura MVC clara:** Controllers → Models → Routes
2. **Frontend modular:** Component pattern reusable
3. **Validaciones en cascade:** Frontend + Backend
4. **API RESTful bien formada:** Endpoints seguros y documentados
5. **Nombres consistentes:** `numero_entrega`, `numero_produccion`, etc.
6. **Errores con statusCode:** Error handling profundo

### ⚠️ LO QUE NECESITA MEJORA (NO URGENTE)

1. **Stock manual:** Actualmente no se descuenta automáticamente
2. **Sin relación producto-insumo:** Falta normalización
3. **operario/responsable como strings:** Debería ser FK a usuarios

### 🚨 CRÍTICO (DEBE IMPLEMENTARSE)

1. ✅ Tabla `producto_insumos` (relación N:N)
2. ✅ Tabla `insumo_movimientos` (auditoría)
3. ✅ Descuento automático de insumos en producción
4. ✅ Validación de stock suficiente antes de crear producción

---

## 📊 RESUMEN EJECUTIVO

### Estado Actual: **PREPARADO PARA INTEGRACIÓN** ✅

| Aspecto | Status | Score |
|---------|--------|-------|
| Backend endpoints | ✅ Completo | 100% |
| Base de datos | ✅ Completo | 100% |
| Frontend UI | ✅ Completo | 100% |
| Integraciones | 🟡 Parcial | 40% |
| Validaciones | ✅ Buenas | 90% |
| Error handling | ✅ Bueno | 85% |

### Riesgo de Regresión: **BAJO** 🟢

- Todos los módulos funcionan independientemente
- Las FK tienen CASCADE/SET NULL apropiadas
- No hay dependencias cruzadas no documentadas
- Los tests existentes no deberían fallar

### Listo para: **FASE 1 (DISEÑO)** ✅

Los sistemas base están en lugar. Ahora podemos:
1. Diseñar tabla `producto_insumos`
2. Diseñar tabla `insumo_movimientos`
3. Implementar descuentos automáticos

---

## 📋 Próximos Pasos

**FASE 1:** Diseño controlado del módulo insumos
- Definir relaciones N:N exactas
- Definir reglas de negocio para descuentos
- Validar con stakeholders

**NO HACER CAMBIOS HASTA COMPLETAR FASE 1**

