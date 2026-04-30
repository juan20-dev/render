# Análisis Detallado: Flujo de Registro de Cliente

**Fecha del análisis:** 29 de abril de 2026

---

## 1. ENDPOINT DE REGISTRO EN BACKEND

### 1.1 Ruta Exacta
**Archivo:** [backend/src/routes/auth.routes.js](backend/src/routes/auth.routes.js#L13)

```javascript
router.post('/register-cliente', controller.registerCliente);
```

**Endpoint:** `POST /api/auth/register-cliente`

---

### 1.2 Controlador - Función `registerCliente`

**Archivo:** [backend/src/controllers/auth.controllers.js](backend/src/controllers/auth.controllers.js#L345)

**Líneas:** 345-600

#### Resumen del Flujo:
1. **Validación de entrada:** Normaliza y valida todos los campos usando `normalizeAuthRegisterPayload()`
2. **Validaciones de duplicados:** Verifica si email/documento ya existen en `usuarios` y `clientes`
3. **Transacción atómica:** Usa `BEGIN/COMMIT/ROLLBACK` para garantizar consistencia
4. **Creación de usuario:** Inserta en tabla `usuarios` con rol 'Cliente'
5. **Creación/Actualización de cliente:** Crea o actualiza en tabla `clientes`
6. **Envío de email:** Si no hay contraseña personalizada, envía contraseña temporal

---

### 1.3 Campos Esperados

El controlador recibe y espera estos campos (en `req.body`):

| Campo | Tipo | Requerido | Validación | Notas |
|-------|------|-----------|-----------|-------|
| `tipoDocumento` | string | ✓ | CC, CE, TI, Pasaporte (default: 'CC') | Se normaliza automáticamente |
| `documento` | string | ✓ | No vacío, trimmed | Se busca en ambas tablas |
| `nombre` | string | ✓ | No vacío, trimmed | |
| `apellido` | string | ✓ | No vacío, trimmed | |
| `telefono` | string | ✓ | 7-15 dígitos numéricos | Se elimina caracteres no numéricos |
| `direccion` | string | ✓ | No vacío, trimmed | |
| `email` | string | ✓ | No vacío, lowercase | Se valida en ambas tablas |
| `password` | string | ✓ | Mínimo 8 caracteres | Requerido en registro |
| `estado` | string | ✗ | Activo/Inactivo (default: 'Activo') | Se normaliza |

**Código de validación de campos requeridos:** [auth.controllers.js L365-382](backend/src/controllers/auth.controllers.js#L365)

```javascript
const requiredFields = [
  { key: 'documento', value: normalizedDocumento, label: 'Número de Documento' },
  { key: 'nombre', value: normalizedNombre, label: 'Nombre' },
  { key: 'apellido', value: normalizedApellido, label: 'Apellido' },
  { key: 'telefono', value: normalizedTelefono, label: 'Teléfono' },
  { key: 'direccion', value: normalizedDireccion, label: 'Dirección' },
  { key: 'email', value: normalizedEmail, label: 'Correo Electrónico' },
  { key: 'password', value: password, label: 'Contraseña' },
];
```

---

### 1.4 Tablas Modificadas

#### Tabla `usuarios` (Líneas 448-461):
Inserción inicial con los siguientes campos:

```sql
INSERT INTO usuarios
  (nombre, apellido, tipo_documento, documento, direccion, email, 
   telefono, password_hash, rol_id, estado)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Activo')
RETURNING id
```

**Campos insertados:**
- `nombre`, `apellido`, `tipo_documento`, `documento`, `direccion`, `email`, `telefono`
- `password_hash` (con hash bcrypt, 10 rounds)
- `rol_id` (búsqueda del rol 'Cliente')
- `estado` (fijo a 'Activo')

#### Tabla `clientes` (Líneas 463-572):
Puede tener 3 escenarios:

**Escenario 1:** Cliente ya existe por trigger (líneas 464-483)
```sql
UPDATE clientes
SET nombre = $1, apellido = $2, tipo_documento = $3, documento = $4,
    telefono = $5, email = $6, direccion = $7, estado = $8,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $9
RETURNING id
```

**Escenario 2:** Cliente existe sin usuario (líneas 484-507)
```sql
UPDATE clientes
SET usuario_id = $1, nombre = $2, apellido = $3, tipo_documento = $4,
    documento = $5, telefono = $6, email = $7, direccion = $8,
    estado = $9, updated_at = CURRENT_TIMESTAMP
WHERE id = $10
RETURNING id
```

**Escenario 3:** Cliente no existe (líneas 508-520)
```sql
INSERT INTO clientes
  (usuario_id, nombre, apellido, tipo_documento, documento, 
   telefono, email, direccion, estado)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (documento) DO UPDATE
SET usuario_id = EXCLUDED.usuario_id, nombre = EXCLUDED.nombre, ...
WHERE clientes.usuario_id IS NULL
RETURNING id
```

---

### 1.5 Respuesta del Endpoint

**Status 201 (Éxito):** [auth.controllers.js L523-533](backend/src/controllers/auth.controllers.js#L523)
```json
{
  "success": true,
  "message": "Cliente registrado exitosamente",
  "data": {
    "cliente_id": 123,
    "usuario_id": 456
  }
}
```

**Errores posibles:**
- `400`: Campo faltante o inválido
- `409`: Email/documento ya registrados
- `500`: Error interno (constraint violation, etc.)

---

## 2. FORMULARIO DE REGISTRO EN FRONTEND

### 2.1 Archivo y Ubicación

**Archivo:** [src/components/pages/Login.tsx](src/components/pages/Login.tsx)

**Componente:** `Login` con tab `register`

**Líneas:** 1-500+ (Renderizado del formulario en líneas ~280-450)

---

### 2.2 Estado del Formulario

[Login.tsx L31-42](src/components/pages/Login.tsx#L31)

```typescript
const [registerData, setRegisterData] = useState({ 
  tipoDocumento: 'CC' as 'CC' | 'CE' | 'TI' | 'Pasaporte',
  documento: '',
  nombre: '',
  apellido: '',
  telefono: '',
  direccion: '',
  email: '',
  estado: 'Activo' as 'Activo' | 'Inactivo',
  password: '',
  confirmPassword: '',
});
```

---

### 2.3 Campos del Formulario

| Campo | Tipo | Requerido | Validación | Placeholder |
|-------|------|-----------|-----------|-------------|
| `tipoDocumento` | select | ✓ | CC, CE, TI, Pasaporte | CC (default) |
| `documento` | text | ✓ | Input | 1234567890 |
| `nombre` | text | ✓ | Input | |
| `apellido` | text | ✓ | Input | |
| `telefono` | text | ✓ | 7-15 dígitos | 300 123 4567 |
| `direccion` | textarea | ✓ | Input | Dirección completa |
| `email` | email | ✓ | email + lowercase | usuario@mail.com |
| `password` | password | ✓ | Custom validation | •••••••• |
| `confirmPassword` | password | ✓ | Debe coincidir | •••••••• |
| `estado` | select | ✗ | Activo/Inactivo | Activo (fijo) |

---

### 2.4 Validaciones del Formulario

[Login.tsx L71-138](src/components/pages/Login.tsx#L71)

```typescript
const handleRegister = async (e: React.FormEvent) => {
  // 1. Validar campos requeridos
  const requiredFields = [
    { key: 'documento', label: 'Número de Documento' },
    { key: 'nombre', label: 'Nombre' },
    { key: 'apellido', label: 'Apellido' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'email', label: 'Correo Electrónico' },
    { key: 'password', label: 'Contraseña' },
  ];
  
  // 2. Normalización de datos
  const trimmed = {
    documento: registerData.documento.trim(),
    telefono: registerData.telefono.replace(/\D/g, '').trim(),
    email: registerData.email.trim().toLowerCase(),
    // ... resto de campos
  };
  
  // 3. Validación de rango de teléfono
  if (trimmed.telefono.length < 7 || trimmed.telefono.length > 15) {
    // Error: teléfono inválido
  }
  
  // 4. Validación de coincidencia de contraseñas
  if (trimmed.password !== trimmed.confirmPassword) {
    // Error: contraseñas no coinciden
  }
};
```

---

### 2.5 POST al Endpoint

[Login.tsx L133-148](src/components/pages/Login.tsx#L133)

```typescript
await auth.registerCliente({
  tipoDocumento: trimmed.tipoDocumento,
  documento: trimmed.documento,
  nombre: trimmed.nombre,
  apellido: trimmed.apellido,
  telefono: trimmed.telefono,
  direccion: trimmed.direccion,
  email: trimmed.email,
  estado: trimmed.estado,
  password: trimmed.password,
});
```

**Servicio:** [src/services/api.ts L910-920](src/services/api.ts#L910)

```typescript
registerCliente: (data: {
  tipoDocumento: 'CC' | 'CE' | 'TI' | 'Pasaporte';
  documento?: string;
  numeroDocumento?: string;
  nombre: string;
  apellido: string;
  telefono: string;
  direccion: string;
  email: string;
  estado?: 'Activo' | 'Inactivo';
  password: string;
}) => apiCall('/api/auth/register-cliente', 'POST', normalizeAuthRegisterPayload(data))
```

---

### 2.6 Manejo de Respuesta

[Login.tsx L150-169](src/components/pages/Login.tsx#L150)

```typescript
// Éxito: Alert + Tab switch
setAlertState({
  title: 'Registro exitoso',
  description: `Registro exitoso para ${trimmed.nombre} ${trimmed.apellido}...`,
  type: 'success'
});

// Después de 3 segundos: cambiar a tab login y precargar email
setTimeout(() => {
  setActiveTab('login');
  setLoginData({ email: trimmed.email, password: '' });
}, 3000);

// Error: Alert con mensaje del backend
setAlertState({
  title: 'Error en el registro',
  description: error?.message || 'No fue posible registrar...',
  type: 'danger'
});
```

---

## 3. TRIGGER DE SINCRONIZACIÓN

### 3.1 Archivo y Ubicación

**Archivo:** [backend/historias-migraciones/003_clientes_usuario_link.sql](backend/historias-migraciones/003_clientes_usuario_link.sql)

**Líneas:** 62-124

---

### 3.2 Función PostgreSQL: `sync_cliente_from_usuario()`

[003_clientes_usuario_link.sql L63-113](backend/historias-migraciones/003_clientes_usuario_link.sql#L63)

```sql
CREATE OR REPLACE FUNCTION sync_cliente_from_usuario()
RETURNS TRIGGER AS $$
DECLARE
  cliente_role_id INTEGER;
BEGIN
  -- 1. Obtener ID del rol 'Cliente'
  SELECT id INTO cliente_role_id FROM roles WHERE nombre = 'Cliente' LIMIT 1;
  
  IF cliente_role_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- 2. Si el nuevo usuario tiene rol 'Cliente'...
  IF NEW.rol_id = cliente_role_id THEN
    -- 2a. Intentar actualizar cliente existente (sin usuario vinculado)
    UPDATE clientes
    SET usuario_id = NEW.id,
        nombre = COALESCE(nombre, NEW.nombre),
        apellido = COALESCE(apellido, NEW.apellido),
        tipo_documento = COALESCE(tipo_documento, NEW.tipo_documento),
        documento = COALESCE(documento, NEW.documento),
        telefono = COALESCE(NEW.telefono, telefono),
        direccion = COALESCE(NEW.direccion, direccion),
        estado = COALESCE(NEW.estado, estado),
        updated_at = CURRENT_TIMESTAMP
    WHERE usuario_id IS NULL
      AND email IS NOT NULL
      AND LOWER(email) = LOWER(NEW.email);
    
    -- 2b. Si no existe cliente para este usuario, crear uno
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE usuario_id = NEW.id) THEN
      INSERT INTO clientes (
        usuario_id, nombre, apellido, tipo_documento, documento,
        telefono, email, direccion, estado
      ) VALUES (
        NEW.id, NEW.nombre, NEW.apellido, NEW.tipo_documento,
        NEW.documento, NEW.telefono, NEW.email, NEW.direccion,
        COALESCE(NEW.estado, 'Activo')
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 3.3 Trigger: `trg_sync_cliente_from_usuario`

[003_clientes_usuario_link.sql L118-124](backend/historias-migraciones/003_clientes_usuario_link.sql#L118)

```sql
DROP TRIGGER IF EXISTS trg_sync_cliente_from_usuario ON usuarios;

CREATE TRIGGER trg_sync_cliente_from_usuario
AFTER INSERT OR UPDATE OF rol_id, nombre, apellido, tipo_documento, 
                        documento, telefono, email, direccion, estado
ON usuarios
FOR EACH ROW
EXECUTE FUNCTION sync_cliente_from_usuario();
```

---

### 3.4 ¿Qué hace el Trigger?

#### Timing
- Se dispara **DESPUÉS** de INSERT o UPDATE en tabla `usuarios`
- Solo si cambian ciertos campos: `rol_id`, `nombre`, `apellido`, etc.

#### Lógica
1. **Búsqueda del rol 'Cliente':**
   - Si no existe, no hace nada (RETURN NEW)

2. **Si el usuario nuevo tiene rol 'Cliente':**
   - **Paso 1:** UPDATE de cliente existente SIN usuario vinculado que coincida por email
     - Actualiza: `usuario_id`, campos de perfil (nombre, apellido, etc.)
     - Solo modifica si `usuario_id IS NULL` AND email coincide
   
   - **Paso 2:** INSERT de nuevo cliente si no existe
     - Crea cliente con datos del usuario si no hay uno vinculado

#### Campos Sincronizados
| Campo | Lógica |
|-------|--------|
| `usuario_id` | Se asigna el ID del nuevo usuario |
| `nombre` | Coalesce: mantiene existente, sino usa NEW |
| `apellido` | Coalesce: mantiene existente, sino usa NEW |
| `tipo_documento` | Coalesce: mantiene existente, sino usa NEW |
| `documento` | Coalesce: mantiene existente, sino usa NEW |
| `telefono` | Coalesce: NEW tiene prioridad |
| `direccion` | Coalesce: NEW tiene prioridad |
| `estado` | Coalesce: NEW tiene prioridad |
| `updated_at` | Se actualiza a CURRENT_TIMESTAMP |

---

## 4. ANÁLISIS DE ALINEACIÓN Y VALIDACIÓN

### 4.1 Comparativa: Frontend vs Backend

#### Campos Enviados y Esperados

| Campo | Frontend | Backend Esperado | Normalización Backend | Status |
|-------|----------|------------------|----------------------|--------|
| `tipoDocumento` | ✓ (CC/CE/TI/Pasaporte) | ✓ Requerido | `CC` default, validación TIPO_DOCUMENTO_MAP | ✅ |
| `documento` | ✓ | ✓ Requerido | trim() + validación unicidad | ✅ |
| `nombre` | ✓ | ✓ Requerido | trim() | ✅ |
| `apellido` | ✓ | ✓ Requerido | trim() | ✅ |
| `telefono` | ✓ | ✓ Requerido | /\D/g (solo dígitos), 7-15 chars | ✅ |
| `direccion` | ✓ | ✓ Requerido | trim() | ✅ |
| `email` | ✓ | ✓ Requerido | lowercase, validación unicidad | ✅ |
| `estado` | ✓ (select) | ✗ Ignorado | Default 'Activo', se normaliza | ⚠️ |
| `password` | ✓ | ✓ Requerido | Validación fuerza, hash bcrypt | ✅ |
| `confirmPassword` | ✓ (frontend only) | ✗ (no esperado) | No enviado | ✅ |

---

### 4.2 Validaciones Alineadas

#### Teléfono (7-15 dígitos)
- **Frontend:** [Login.tsx L110-117](src/components/pages/Login.tsx#L110)
  ```typescript
  if (trimmed.telefono.length < 7 || trimmed.telefono.length > 15) {
    // Error
  }
  ```

- **Backend:** [normalizador-http.js L176-181](backend/src/controllers/normalizador-http.js#L176)
  ```javascript
  if (telefono.length < 7 || telefono.length > 15) {
    return { error: 'Telefono invalido...' };
  }
  ```

✅ **Perfectamente alineados**

---

#### Documento (Tipo válido)
- **Frontend:** Dropdown con opciones CC/CE/TI/Pasaporte (no puede enviar inválido)
- **Backend:** [normalizador-http.js L164-169](backend/src/controllers/normalizador-http.js#L164)
  ```javascript
  const tipoDocumento = normalizeTipoDocumento(
    payload.tipoDocumento ?? payload.tipo_documento ?? 'CC'
  );
  if (!tipoDocumento) {
    return { error: 'Tipo de documento invalido...' };
  }
  ```

✅ **Alineados (frontend usa select, backend valida map)**

---

#### Email (Lowercase)
- **Frontend:** [Login.tsx L64](src/components/pages/Login.tsx#L64)
  ```typescript
  email: registerData.email.trim().toLowerCase(),
  ```

- **Backend:** [auth.controllers.js L352](backend/src/controllers/auth.controllers.js#L352)
  ```javascript
  const normalizedEmail = String(email || '').trim().toLowerCase();
  ```

✅ **Alineados**

---

#### Contraseña (Coincidencia)
- **Frontend:** [Login.tsx L120-127](src/components/pages/Login.tsx#L120)
  ```typescript
  if (trimmed.password !== trimmed.confirmPassword) {
    // Error: Las contraseñas no coinciden
  }
  ```

- **Backend:** No valida porque asume que el frontend ya lo hizo

⚠️ **Potencial issue:** El backend NO valida coincidencia de contraseñas. Si alguien hace POST directo, solo recibe `password`, no `confirmPassword`.

---

### 4.3 Validaciones de Unicidad

#### Email (Doble Check)
- **Validación en `usuarios`:** [auth.controllers.js L387-391](backend/src/controllers/auth.controllers.js#L387)
  ```javascript
  const emailInUsuarios = await client.query(
    'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [normalizedEmail]
  );
  if (emailInUsuarios.rows.length > 0) {
    return res.status(409).json({ success: false, message: 'El correo ya esta registrado' });
  }
  ```

- **Validación en `clientes`:** [auth.controllers.js L403-407](backend/src/controllers/auth.controllers.js#L403)
  ```javascript
  const emailInClientes = await client.query(
    'SELECT id, usuario_id FROM clientes WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [normalizedEmail]
  );
  ```

✅ **Robusto: Valida en ambas tablas**

---

#### Documento
- **Validación en `usuarios`:** [auth.controllers.js L394-398](backend/src/controllers/auth.controllers.js#L394)
- **Validación en `clientes`:** [auth.controllers.js L408-412](backend/src/controllers/auth.controllers.js#L408)

✅ **Robusto: Valida en ambas tablas**

---

### 4.4 Potenciales Problemas de Sincronización

#### Problema 1: Campo `estado` Ignorado en Frontend
**Severidad:** ⚠️ Media

- **Frontend:** Envía `estado: 'Activo'` (hardcodeado en [Login.tsx L65](src/components/pages/Login.tsx#L65))
  ```typescript
  estado: 'Activo' as const,
  ```

- **Backend:** Lo recibe pero el controlador de `registerCliente` siempre usa 'Activo' en línea 455
  ```javascript
  VALUES (..., 'Activo') -- fijo
  ```

**Impacto:** Ninguno. El campo nunca puede ser otro valor en registro de cliente.

---

#### Problema 2: Tabla `clientes` sin `usuario_id` único en migraciones antiguas
**Severidad:** 🔴 Alta (ya resuelto)

**Migración 003:** [003_clientes_usuario_link.sql L21-23](backend/historias-migraciones/003_clientes_usuario_link.sql#L21)
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_usuario_id_unique
  ON clientes(usuario_id)
  WHERE usuario_id IS NOT NULL;
```

✅ **Resuelto:** Índice único con WHERE evita duplicados, permite NULLs

---

#### Problema 3: Sincronización Condicional del Trigger
**Severidad:** ⚠️ Media

El trigger usa `COALESCE()` lo que significa:
```sql
nombre = COALESCE(nombre, NEW.nombre)  -- mantiene cliente.nombre si existe
```

**Escenario:** Si un cliente existe sin `usuario_id` y sus datos (nombre, apellido) están vacíos o NULL, el trigger NO sobrescribirá con datos del nuevo usuario.

**Solución:** El controlador `registerCliente` maneja 3 casos explícitamente (lines 464-520) y siempre actualiza datos consistentemente.

---

### 4.5 Flujo Completo de Sincronización

```
┌─────────────────────────────────────────────────────────────┐
│ POST /api/auth/register-cliente (Frontend)                  │
│ Datos: email, documento, nombre, apellido, telefono,        │
│        direccion, tipoDocumento, password, estado           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend: normalizeAuthRegisterPayload()                      │
│ ✓ Normaliza tipoDocumento (CC default)                      │
│ ✓ Convierte telefono a dígitos (7-15)                       │
│ ✓ Convierte email a lowercase                               │
│ ✓ Establece estado a 'Activo' (default)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend: Validación de Duplicados                           │
│ ✓ SELECT email FROM usuarios WHERE email                    │
│ ✓ SELECT documento FROM usuarios WHERE documento            │
│ ✓ SELECT email FROM clientes WHERE email                    │
│ ✓ SELECT documento FROM clientes WHERE documento            │
│ ✓ Verifica: email+documento correspondan a MISMO cliente    │
│ ✓ Verifica: si cliente existe, NO está vinculado a usuario  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend: BEGIN TRANSACTION                                  │
│                                                             │
│ 1. INSERT INTO usuarios (...)  -- Rol: 'Cliente'            │
│    RETURNING id -> usuario_id = X                           │
│                                                             │
│ 2. TRIGGER se dispara: sync_cliente_from_usuario()          │
│    - IF rol_id = 'Cliente' THEN                             │
│      - UPDATE clientes IF email matches & usuario_id IS NULL│
│      - INSERT clientes IF no existe                         │
│                                                             │
│ 3. Backend verifica: ¿Existe cliente para usuario X?        │
│    - Si SÍ (por trigger): UPDATE clientes con datos finales │
│    - Si NO: INSERT nuevo cliente o UPDATE existente         │
│                                                             │
│ COMMIT TRANSACTION                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Resultado Final:                                             │
│ ✓ usuario_id = X (nuevo usuario)                            │
│ ✓ cliente_id = Y (nuevo o actualizado)                      │
│ ✓ usuario_id linked to cliente_id                           │
│ ✓ Email de contraseña temporal (si no manual)               │
│ ✓ Respuesta 201: { cliente_id: Y, usuario_id: X }           │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. RESUMEN DE DESALINEACIONES Y RIESGOS

### ✅ Alineaciones Correctas
1. Tipos de documento validados correctamente
2. Teléfono: 7-15 dígitos (idéntico en ambas capas)
3. Email: lowercase + trim en ambas capas
4. Campos requeridos: lista idéntica
5. Unicidad: validada en ambas tablas
6. Transacciones: uso de ACID en backend

### ⚠️ Áreas de Atención (No son bugs, pero son consideraciones)
1. **Campo `confirmPassword`:** Solo en frontend. Backend no valida coincidencia si se hace POST directo.
   - **Recomendación:** Agregar validación backend de coincidencia de contraseñas.

2. **Campo `estado` hardcodeado:** Siempre 'Activo' en registro de cliente
   - **Recomendación:** Es intencional (nuevos clientes siempre activos). Documentar claramente.

3. **Trigger con `COALESCE()`:** Mantiene datos existentes de cliente si están vacíos
   - **Recomendación:** Documentar que el trigger es asincrónico y el controlador maneja explícitamente.

### 🔴 Errores Potenciales Si No Se Usa Frontend
Si alguien hace POST directo a `/api/auth/register-cliente`:
- Sin `password`: Falla (requerido)
- Sin `confirmPassword`: No importa (no se valida backend)
- Con `documento` inválido: Falla
- Con `telefono` < 7 dígitos: Falla

---

## 6. LÍNEAS EXACTAS DE CÓDIGO CRÍTICAS

| Concepto | Archivo | Líneas |
|----------|---------|--------|
| Ruta POST | backend/src/routes/auth.routes.js | 13 |
| Controlador | backend/src/controllers/auth.controllers.js | 345-600 |
| Normalización | backend/src/controllers/normalizador-http.js | 120-185 |
| Trigger (función) | backend/historias-migraciones/003_clientes_usuario_link.sql | 63-113 |
| Trigger (definición) | backend/historias-migraciones/003_clientes_usuario_link.sql | 118-124 |
| Formulario | src/components/pages/Login.tsx | 31-169 |
| Servicio API | src/services/api.ts | 910-920 |
| Validación teléfono Frontend | src/components/pages/Login.tsx | 110-117 |
| Validación teléfono Backend | backend/src/controllers/normalizador-http.js | 176-181 |

---

**Análisis completado:** Todos los archivos verificados. No se encontraron desalineaciones críticas.
