# AUDIT ENDPOINTS - TABLA DETALLADA DE PROBLEMAS

## Leyenda
| Símbolo | Significado |
|---------|-----------|
| 🔴 | CRÍTICO - Endpoint sin try-catch o grave exposición de información |
| 🟠 | ALTO - Validación fuera try-catch o exposición severa de errores |
| 🟡 | MEDIO - Exposición de error.message o inconsistencia en respuestas |
| ✅ | OK - Bien implementado |

---

## PROBLEMAS ENCONTRADOS - TABLA COMPLETA

### Tabla 1: PROBLEMAS DE CONTROL DE FLUJO (Try-Catch)

| Criticidad | Archivo | Endpoint | Línea Problema | Descripción | Solución |
|-----------|---------|----------|---|-----------|----------|
| 🟠 ALTO | clientes.js | create | 66-68 | Validación `isClienteUser()` FUERA try-catch | Mover adentro try-catch |
| 🟠 ALTO | clientes.js | update | 196-208 | Validaciones FUERA try-catch: línea 196 (denied), 199 (normalize), 205 (isClienteUser) | Mover adentro try-catch |
| ✅ OK | domicilios.js | Todos | Interior | Validaciones DENTRO try-catch | - |
| ✅ OK | ventas.js | Todos | Interior | Validaciones DENTRO try-catch | - |

**Resumen**: 2 problemas altos, resto OK

---

### Tabla 2: PROBLEMAS DE EXPOSICIÓN DE ERRORES

| Criticidad | Archivo | Endpoint | Línea Error | Tipo Exposición | Detalle | Impacto |
|-----------|---------|----------|-----|---------|---------|---------|
| 🟡 MEDIO | auth.js | registerCliente | 597-620 | Códigos DB PostgreSQL | Expone error.code '23505', '22001' | Revelastructura de DB |
| 🟡 MEDIO | compras.js | create | 28-31 | error.message + details | `res.status(error.statusCode \|\| 500)` expone todo | Fuga de información interna |
| 🟡 MEDIO | compras.js | addProducto | 37 | error.message + details | Mismo patrón que create | Fuga de información interna |
| 🟡 MEDIO | compras.js | update | 57 | error.message + details | Mismo patrón que create | Fuga de información interna |
| 🟡 MEDIO | compras.js | updateStatus | 77 | error.message + details | Mismo patrón que create | Fuga de información interna |
| 🟡 MEDIO | compras.js | delete | 88 | error.message + details | Mismo patrón que create | Fuga de información interna |
| 🟡 MEDIO | productos.js | update | 67 | error.message | Expone directamente error.message | Fuga de información interna |
| 🟡 MEDIO | productos.js | updateStatus | 86 | error.message | Expone directamente error.message | Fuga de información interna |
| 🟡 MEDIO | usuarios.js | updateStatus | 295-296 | error.message + details | Expone error.message y error.details | Fuga de información interna |
| 🟡 MEDIO | roles.js | updatePermissions | 37-38 | error.message + details | Expone error.message y error.details | Fuga de información interna |
| 🟡 MEDIO | roles.js | delete | 49 | error.message + details | Expone error.message y error.details | Fuga de información interna |

**Resumen**: 11 problemas de exposición

---

### Tabla 3: PROBLEMAS CON CÓDIGOS HTTP

| Criticidad | Archivo | Endpoint | Línea | Problema | Código | Solución |
|-----------|---------|----------|-------|----------|--------|----------|
| 🟡 MEDIO | compras.js | create, addProducto, update, updateStatus, delete | 28, 37, 57, 77, 88 | `error.statusCode \|\| 500` - Si statusCode=0, devuelve 0 HTTP | 0 (inválido) | Validar: `Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 500` |
| 🟡 MEDIO | productos.js | update, updateStatus | 65, 85 | `error.statusCode \|\| 500` - Posible código inválido | Potencial 0 | Misma solución |
| ✅ OK | Mayoría | Todos | - | Códigos HTTP correctos | 400, 401, 403, 404, 409, 500 | - |

**Resumen**: 7 endpoints con posible código HTTP inválido

---

### Tabla 4: ESTRUCTURA DE RESPUESTAS

| Controlador | Estructura Success | Estructura Error | Incluyedetails | Status |
|-----------|--------|--------|--------|--------|
| auth | `{success,data,message}` | `{success,message}` | NO | ✅ BIEN |
| clientes | `{success,data,message}` | `{success,message}` | NO | ✅ BIEN |
| pedidos | `{success,id,message,data}` | `{success,message}` | NO | ✅ BIEN |
| productos | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| compras | `{success,id,message}` | `{success,message,details}` | SÍ ⚠️ | 🟡 INCONSISTENTE |
| proveedores | `{success,id,message}` | `{success,message,details}` | SÍ ⚠️ | 🟡 INCONSISTENTE |
| usuarios | `{success,id,message}` | `{success,message,details}` | SÍ ⚠️ | 🟡 INCONSISTENTE |
| categorias | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| roles | `{success,id,message}` | `{success,message,details}` | SÍ ⚠️ | 🟡 INCONSISTENTE |
| insumos | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| domicilios | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| abonos | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| ventas | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| produccion | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| entregas-insumos | `{success,id,message}` | `{success,message}` | NO | ✅ BIEN |
| public | `{success,data}` | `{success,message}` | NO | ✅ BIEN |

**Resumen**: 11/16 controladores bien, 5/16 con details inconsistente

---

## MATRIZ DE PROBLEMAS POR ARCHIVO

### auth.controllers.js (8 endpoints)
| Endpoint | Línea | Try-Catch | Autorización | Error Exposure | Códigos HTTP | Estado |
|----------|-------|-----------|--------------|---------|------------|--------|
| login | 85 | ✅ | ✅ | ⚠️ (591+) | ✅ | 🟡 |
| me | 167 | ✅ | ✅ | ✅ | ✅ | ✅ |
| logout | 193 | ✅ | N/A | ✅ | ✅ | ✅ |
| changePassword | 210 | ✅ | ✅ | ✅ | ✅ | ✅ |
| requestPasswordReset | 254 | ✅ | N/A | ✅ | ✅ | ✅ |
| confirmPasswordReset | 280 | ✅ | N/A | ✅ | ✅ | ✅ |
| logoutAll | 335 | ✅ | ✅ | ✅ | ✅ | ✅ |
| registerCliente | 350 | ✅ | ✅ | 🟡 (línea 597-620) | ✅ | 🟡 |

---

### clientes.controllers.js (9 endpoints)
| Endpoint | Línea | Try-Catch | Autorización | Error Exposure | Códigos HTTP | Estado |
|----------|-------|-----------|--------------|---------|------------|--------|
| getAll | 14 | ✅ | ✅ | ✅ | ✅ | ✅ |
| getById | 21 | ✅ | ✅ | ✅ | ✅ | ✅ |
| getByDocumento | 31 | ✅ | ✅ | ✅ | ✅ | ✅ |
| getByEmail | 41 | ✅ | ✅ | ✅ | ✅ | ✅ |
| getByUsuarioId | 51 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **create** | 62 | 🟠 (66-68 FUERA) | 🟠 FUERA | ✅ | ✅ | 🟠 |
| **update** | 195 | 🟠 (196-208 FUERA) | 🟠 FUERA | ✅ | ✅ | 🟠 |
| uploadProfilePhoto | 328 | ✅ | ✅ | ✅ | ✅ | ✅ |
| delete | 356 | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### pedidos.controllers.js (8 endpoints)
| Endpoint | Línea | Try-Catch | Autorización | Error Exposure | Códigos HTTP | Estado |
|----------|-------|-----------|--------------|---------|------------|--------|
| getAll | 34 | ✅ | ✅ | ✅ | ✅ | ✅ |
| getById | 50 | ✅ | ✅ | ✅ | ✅ | ✅ |
| getByCliente | 62 | ✅ | ✅ | ✅ | ✅ | ✅ |
| create | 73 | ✅ | ✅ | ✅ | ✅ | ✅ |
| addProducto | 85 | ✅ | ✅ | ✅ | ✅ | ✅ |
| update | 101 | ✅ | ✅ | ✅ | ✅ | ✅ |
| delete | 131 | ✅ | ✅ | ✅ | ✅ | ✅ |
| updateStatus | 143 | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### productos.controllers.js (7 endpoints)
| Endpoint | Línea | Try-Catch | Autorización | Error Exposure | Códigos HTTP | Estado |
|----------|-------|-----------|--------------|---------|------------|--------|
| getAll | 5 | ✅ | N/A | ✅ | ✅ | ✅ |
| getById | 13 | ✅ | N/A | ✅ | ✅ | ✅ |
| getByCategory | 21 | ✅ | N/A | ✅ | ✅ | ✅ |
| create | 29 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **update** | 39 | ✅ | ✅ | 🟡 (línea 67) | 🟡 (statusCode) | 🟡 |
| **updateStatus** | 49 | ✅ | ✅ | 🟡 (línea 86) | 🟡 (statusCode) | 🟡 |
| delete | 75 | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### compras.controllers.js (7 endpoints)
| Endpoint | Línea Try | Línea Error | Error Exposure | Códigos HTTP | Estado |
|----------|-------|----------|---------|------------|--------|
| getAll | 4 | - | ✅ | ✅ | ✅ |
| getById | 12 | - | ✅ | ✅ | ✅ |
| **create** | 23 | **28-31** | 🟡 message+details | 🟡 statusCode | 🟡 |
| **addProducto** | 33 | **37** | 🟡 message+details | 🟡 statusCode | 🟡 |
| **update** | 47 | **57** | 🟡 message+details | 🟡 statusCode | 🟡 |
| **updateStatus** | 55 | **77** | 🟡 message+details | 🟡 statusCode | 🟡 |
| **delete** | 79 | **88** | 🟡 message+details | 🟡 statusCode | 🟡 |

---

### proveedores.controllers.js (11 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Autorización ✅, Error handling ✅, Códigos HTTP ✅

---

### usuarios.controllers.js (14 endpoints)
| Endpoint | Línea | Try-Catch | Autorización | Error Exposure | Códigos HTTP | Estado |
|----------|-------|-----------|--------------|---------|------------|--------|
| getAll | 15 | ✅ | ✅ | ✅ | ✅ | ✅ |
| getById | 43 | ✅ | N/A | ✅ | ✅ | ✅ |
| getByEmail | 51 | ✅ | N/A | ✅ | ✅ | ✅ |
| getByDocumento | 59 | ✅ | N/A | ✅ | ✅ | ✅ |
| getByTelefono | 67 | ✅ | N/A | ✅ | ✅ | ✅ |
| getActivityById | 76 | ✅ | N/A | ✅ | ✅ | ✅ |
| getFullDetailById | 88 | ✅ | N/A | ✅ | ✅ | ✅ |
| getDeleteImpactById | 102 | ✅ | N/A | ✅ | ✅ | ✅ |
| create | 113 | ✅ | ✅ | ✅ | ✅ | ✅ |
| update | 163 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **updateStatus** | 236 | ✅ | ✅ | 🟡 (295-296) | ✅ | 🟡 |
| assignRole | 272 | ✅ | ✅ | ✅ | ✅ | ✅ |
| delete | 293 | ✅ | ✅ | ✅ | ✅ | ✅ |
| forceResetPassword | 316 | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### categorias.controllers.js (5 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Respuestas ✅, Error handling ✅

---

### roles.controllers.js (7 endpoints)
| Endpoint | Línea | Try-Catch | Autorización | Error Exposure | Códigos HTTP | Estado |
|----------|-------|-----------|--------------|---------|------------|--------|
| getAll | - | ✅ | N/A | ✅ | ✅ | ✅ |
| getById | - | ✅ | N/A | ✅ | ✅ | ✅ |
| create | - | ✅ | ✅ | ✅ | ✅ | ✅ |
| update | - | ✅ | ✅ | ✅ | ✅ | ✅ |
| **updatePermissions** | - | ✅ | ✅ | 🟡 (37-38) | ✅ | 🟡 |
| **delete** | - | ✅ | ✅ | 🟡 (49) | ✅ | 🟡 |
| getAuditByRole | - | ✅ | N/A | ✅ | ✅ | ✅ |

---

### insumos.controllers.js (5 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Respuestas ✅, Error handling ✅

---

### domicilios.controllers.js (6 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Autorización DENTRO try-catch ✅, Respuestas ✅

---

### abonos.controllers.js (6 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Respuestas ✅, Error handling ✅

---

### ventas.controllers.js (6 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Autorización DENTRO try-catch ✅, Respuestas ✅

---

### produccion.controllers.js (5 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Respuestas ✅, Error handling ✅

---

### entregas-insumos.controllers.js (5 endpoints)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Respuestas ✅, Error handling ✅

---

### public.controllers.js (1 endpoint)
**Estado General**: ✅ BIEN  
Todos los endpoints: Try-catch ✅, Respuestas ✅, Error handling ✅

---

## 📊 ESTADÍSTICAS FINALES

| Métrica | Valor |
|---------|-------|
| Total de endpoints | ~120 |
| Con try-catch completo | 118 (98%) ✅ |
| Con validación FUERA try-catch | 2 (2%) 🟠 |
| Con exposición de error.message | 11 (9%) 🟡 |
| Con códigos HTTP incorrectos | 7 (6%) 🟡 |
| Con estructura de respuesta inconsistente | 5 (4%) 🟡 |
| Totalmente correcto | 109 (91%) ✅ |

---

## 🎯 RESUMEN EJECUTIVO

### Problemas CRÍTICOS: 0
✅ Todos los endpoints están protegidos con try-catch

### Problemas ALTOS: 2
🟠 clientes.js línea 66, 196 - Validación fuera try-catch

### Problemas MEDIOS: 15
🟡 Exposición de error.message en 11 endpoints
🟡 Códigos HTTP potencialmente inválidos en 7 endpoints

### Problemas BAJOS: 5
🔵 Estructura de respuestas inconsistente

---

**Audit Completado**: 2026-04-30  
**Próximas Acciones**: Ver AUDIT_ENDPOINTS_RESUMEN.md para recomendaciones ordenadas
