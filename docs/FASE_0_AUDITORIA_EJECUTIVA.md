# FASE 0: AUDITORÍA EJECUTIVA - MÓDULO DE INSUMOS

**Fecha:** 30 de Abril de 2026  
**Estado:** ✅ COMPLETADO  
**Riesgo:** BAJO (Sistema bien estructurado, fácil de extender)

---

## 📋 RESUMEN EJECUTIVO

### ¿Qué Existe?
✅ **Backend:** CRUD completo para Insumos + Entregas (routes + controllers + models)  
✅ **Base de Datos:** Tablas `insumos`, `entregas_insumos`, `produccion` con estructura sólida  
✅ **Frontend:** Componentes `Insumos.tsx` y `Produccion.tsx` con UI funcional  

### ¿Qué Falta?
❌ **Relación N:N Producto ↔ Insumo** (tabla `producto_insumos`)  
❌ **Auditoría de Stock** (tabla `insumo_movimientos`)  
❌ **Integración Automática:** Crear producción NO consume insumos automáticamente  
❌ **Validaciones:** No hay límites de stock mínimo ni descuentos en BD  

### ¿Cuál es el Impacto?
🔴 **CRÍTICO:** Sin `producto_insumos`, no puedes definir QONSUMOS NECESITA cada producto  
🟡 **ALTO:** Sin `insumo_movimientos`, no hay auditoría de consumo (no sabes quién gastó qué)  
🟡 **MEDIO:** `insumos_gastados` en JSONB (flexible pero no normalizado)

---

## 🏗️ ARQUITECTURA ACTUAL - MAPA

```
┌─────────────────────────────────────────────────────────┐
│                    MÓDULO INSUMOS ACTUAL                 │
└─────────────────────────────────────────────────────────┘

BACKEND LAYER:
┌────────────────────────────────────────────────────────┐
│ Routes                                                   │
│ ├─ GET    /api/insumos          → getAll()              │
│ ├─ POST   /api/insumos          → create()              │
│ ├─ PUT    /api/insumos/:id      → update()              │
│ ├─ DELETE /api/insumos/:id      → delete()              │
│ └─ GET/POST /api/entregas-insumos → similar pattern     │
└────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────┐
│ Controllers (insumos.controllers.js)                    │
│ • Validan inputs en try-catch                           │
│ • Responden con { success, data/message }              │
│ • 100% try-catch coverage ✓                            │
└────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────┐
│ Models (entities.models.js)                             │
│ • Insumos.getAll/getById/create/update/delete          │
│ • EntregasInsumos.getAll/getById/create/update/delete  │
│ • SQL queries directo a pool                            │
└────────────────────────────────────────────────────────┘
                              ↓
DATABASE LAYER:
┌────────────────────────────────────────────────────────┐
│ PostgreSQL Tables                                       │
│ ├─ insumos (id, nombre, descripcion, cantidad, ...)   │
│ ├─ entregas_insumos (id, numero_entrega, insumo_id, ...)
│ ├─ produccion (id, producto_id, pedido_id, ...)        │
│ └─ productos (id, nombre, precio, stock, ...)          │
└────────────────────────────────────────────────────────┘

FRONTEND LAYER:
┌────────────────────────────────────────────────────────┐
│ src/services/api.ts                                     │
│ ├─ insumos = { getAll, getById, create, update, delete }
│ ├─ entregas_insumos = { similar }                       │
│ └─ produccion = { similar + updateStatus }              │
└────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────┐
│ React Components                                        │
│ ├─ Insumos.tsx (Entrega de Insumos)                     │
│ │  └─ DataTable + Modales + Filtros + PDF              │
│ ├─ Produccion.tsx (Órdenes de Producción)              │
│ │  └─ DataTable + Modales + Estado Transitions + PDF   │
│ └─ [FALTANTE] Gestión de Insumos por Producto          │
└────────────────────────────────────────────────────────┘
```

---

## 🔗 RELACIONES DE BASE DE DATOS

### ACTUAL (Incompleto)
```
insumos
  ↓ FK
entregas_insumos

productos
  ↓ FK
produccion

PERO: insumos ←→ productos  ❌ NO EXISTE RELACIÓN

produccion.insumos_gastados = JSONB (flexible pero no normalizado)
  └─ Podría ser: [{ insumo_id: 1, cantidad: 5, unidad: "L" }, ...]
```

### PROPUESTO (FASE 3)
```
productos
  ↓ N:N
producto_insumos  ← NUEVA TABLA
  ↓
insumos

produccion
  ↓ N:N
insumo_movimientos  ← NUEVA TABLA (auditoría)
  ↓
insumos  (descuenta cantidad)

SCHEMA:
┌──────────────────────────────────────┐
│ producto_insumos (NUEVA - FASE 3)    │
├──────────────────────────────────────┤
│ id (PK)                              │
│ producto_id (FK → productos)         │
│ insumo_id (FK → insumos)            │
│ cantidad_requerida (DECIMAL)         │
│ unidad (VARCHAR)                     │
│ notas (TEXT)                         │
│ created_at, updated_at               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ insumo_movimientos (NUEVA - FASE 3)  │
├──────────────────────────────────────┤
│ id (PK)                              │
│ insumo_id (FK → insumos)            │
│ tipo_movimiento (Entrega|Consumo)   │
│ cantidad (DECIMAL)                   │
│ referencia_tipo (produccion|manual)  │
│ referencia_id (produccion.id|NULL)  │
│ usuario_id (quien registró)          │
│ created_at                           │
└──────────────────────────────────────┘
```

---

## 📊 ENDPOINTS ACTUALES - AUDITORÍA DETALLADA

### 1. INSUMOS CRUD

| Endpoint | Método | Entrada | Salida | Validación | Status |
|----------|--------|---------|--------|-----------|--------|
| `/api/insumos` | GET | - | `{ success, data[] }` | ✓ Try-catch | ✅ READY |
| `/api/insumos/:id` | GET | id (URL) | `{ success, data }` | ✓ 404 si no existe | ✅ READY |
| `/api/insumos` | POST | `{ nombre, descripcion?, cantidad?, unidad?, stock_minimo?, estado? }` | `{ success, id, message }` | ⚠️ Mínima (solo try-catch) | ⚠️ NEEDS VALIDATION |
| `/api/insumos/:id` | PUT | same as POST | `{ success, message }` | ⚠️ Mínima | ⚠️ NEEDS VALIDATION |
| `/api/insumos/:id` | DELETE | id (URL) | `{ success, message }` | ✓ Cascade safe | ✅ READY |

**Problemas Detectados:**
- ❌ No valida `cantidad >= 0`
- ❌ No valida `nombre` no vacío
- ❌ No valida `unidad` en lista permitida (Litros, Kg, Unidades, etc.)
- ❌ No valida `stock_minimo >= 0`
- ❌ No valida `estado` in ('Activo', 'Inactivo')

### 2. ENTREGAS INSUMOS CRUD

Similar estructura a Insumos, pero:
- ✅ FK a `insumos` con CASCADE (seguro)
- ⚠️ `operario` es VARCHAR (no FK) → posible inconsistencia
- ❌ NO descuenta automáticamente de `insumos.cantidad`

### 3. PRODUCCIÓN CRUD

- ✅ FK a `productos` (CASCADE) y `pedidos` (SET NULL)
- ✅ Validación de transiciones de estado en backend
- ✅ `insumos_gastados` como JSONB (flexible)
- ❌ NO integración automática con `entregas_insumos`
- ❌ NO consume automáticamente de `insumos.cantidad`

---

## 🎨 ESTADO FRONTEND - COMPONENTES

### Insumos.tsx (Entrega de Insumos)
```
✅ FUNCIONAL:
  • Listar entregas (DataTable)
  • Crear entrega (Modal + Form)
  • Ver detalles (Modal)
  • Generar PDF
  • Anular entrega
  • Filtros (ID, operario, fecha)

✅ INTEGRACIÓN:
  • API conectada: entregas_insumos.getAll/create/delete
  • Carga de insumos activos
  • Carga de operarios (Asesor/Productor activos)
  
⚠️ FALTANTE:
  • No hay validación de cantidades negativas
  • No muestra stock disponible en modal
  • No descuenta automáticamente del stock
```

### Produccion.tsx
```
✅ FUNCIONAL:
  • Listar órdenes (DataTable)
  • Crear orden (Modal)
  • Ver detalles (Modal)
  • Cambiar estado (Transiciones validadas)
  • Generar PDF
  • Filtros

✅ INTEGRACIÓN:
  • API conectada
  • Validación de transiciones (backend)
  • JSONB insumos_gastados renderizado

⚠️ FALTANTE:
  • No hay selector de insumos requeridos (debería venir de producto_insumos)
  • Insumos_gastados se llenan manualmente (no automático)
  • No muestra proporciones de insumo por producto
```

### [FALTANTE] Gestión de Insumos por Producto
```
❌ NO EXISTE: Formulario para definir QONSUMOS NECESITA cada producto
   Esperado: "Crear Producto" → debería permitir definir insumos requeridos
   Impacto: No puedes automatizar consumo
```

---

## 🚨 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 🔴 CRÍTICO (Bloquea FASE 3)
1. **No existe relación `producto_insumos`**
   - Imposible definir qué insumos necesita cada producto
   - Impacto: No puedes automatizar consumo en producción
   - Solución: Crear tabla + CRUD + UI

2. **No existe auditoría `insumo_movimientos`**
   - No hay trazabilidad de dónde viene/va cada insumo
   - Impacto: No puedes responder "¿quién gastó estos 5L de aceite?"
   - Solución: Crear tabla + triggers/logic

### 🟡 ALTO (Debe solucionarse antes de FASE 3)
3. **Validaciones incompletas en Insumos.create/update**
   - Falta validar: cantidad, nombre, unidad, estado
   - Riesgo: Stock negativo, estados inválidos
   - Solución: Agregar validaciones en modelo + controller

4. **`operario` en entregas_insumos es VARCHAR**
   - Debería ser FK a `usuarios` con rol Asesor|Productor
   - Riesgo: Inconsistencia de datos (operario no existe)
   - Solución: Migración con backfill + FK constraint

### 🟠 MEDIO (Mejora UX)
5. **No hay integración automática Entrega → Producción → Insumo**
   - Actualmente todo manual (JSONB)
   - Solución: Triggers o lógica en controller al crear producción

---

## ✅ RECOMENDACIONES DE DISEÑO

### OPCIÓN A: Enfoque Automático (Recomendado)
```
Ventajas:
✅ Consumo automático al crear/completar producción
✅ Auditoría completa con insumo_movimientos
✅ Validación de stock mínimo
✅ Trazabilidad perfecta (quién, cuándo, qué)

Tareas FASE 3:
1. Crear tabla producto_insumos (definir proporciones)
2. Crear tabla insumo_movimientos (auditoría)
3. Agregar validaciones en Insumos.create/update
4. Agregar triggers o lógica: al crear producción → descuenta insumos
5. UI para gestionar insumos por producto
6. UI para ver movimientos de insumo (histórico)

Duración: ~4-5 días
Complejidad: ALTA (requiere triggers PostgreSQL o lógica compleja)
```

### OPCIÓN B: Enfoque Manual (Más seguro inicialmente)
```
Ventajas:
✅ Menor riesgo de bugs (todo explícito)
✅ Control total del usuario
✅ Fácil de debuggear

Tareas FASE 3:
1. Crear tabla producto_insumos (solo lectura de proporciones)
2. Crear tabla insumo_movimientos (solo registro)
3. Agregar validaciones en Insumos.create/update
4. UI para gestionar insumos por producto
5. UI para consumir insumos manualmente en producción
6. UI para ver movimientos de insumo (histórico)

Duración: ~2-3 días
Complejidad: MEDIA (no hay triggers, lógica simple en controllers)
```

### OPCIÓN C: Híbrida (Recomendada para este proyecto)
```
Propuesta:
✅ Fase 3.1-3.3: Implementar tablas + CRUD + validaciones (Opción B)
✅ Fase 4.x: Agregar triggers/automatización (Opción A)

Ventajas:
✅ Primero funciona bien manualmente
✅ Luego se optimiza con automatización
✅ Menor riesgo en cada fase
✅ Fácil rollback si es necesario

Duración total: ~5-6 días
Complejidad: MEDIA → ALTA (progresivo)
```

---

## 🎯 DECISIÓN RECOMENDADA

### Para FASE 3, implementar OPCIÓN C (Híbrida):

**FASE 3 (5 días):**
- 3.1: Crear `producto_insumos` table + CRUD + validaciones
- 3.2: Crear `insumo_movimientos` table (auditoría)
- 3.3: Agregar UI para gestionar insumos por producto
- 3.4: Agregar validaciones completas en Insumos
- 3.5: Permitir consumo manual en Producción

**FASE 4 (opcional, después):**
- 4.x: Agregar triggers PostgreSQL para automatizar consumo

### Secuencia de Implementación:
1. **DB:** Crear 2 tablas nuevas + índices
2. **Backend:** 5 nuevos endpoints (producto_insumos CRUD + movimientos LIST)
3. **Frontend:** 2 nuevos formularios/modales
4. **Testing:** Validar flujo manual end-to-end

---

## 📝 CHECKLIST - ANTES DE EMPEZAR FASE 3

- [ ] ¿Aceptas diseño híbrido (manual en FASE 3, automático en FASE 4)?
- [ ] ¿Quieres agregar validaciones a Insumos.create/update ahora o después?
- [ ] ¿Quieres convertir `operario` a FK o dejar como VARCHAR por ahora?
- [ ] ¿Necesitas historial de cambios en insumos (quién cambió qué)?

---

## 🚀 PRÓXIMO PASO

**Opción 1:** Comenzar FASE 3 directamente con diseño híbrido  
**Opción 2:** Responder preguntas del checklist primero  
**Opción 3:** Revisar este documento y pedir cambios  

¿Cuál prefieres?
