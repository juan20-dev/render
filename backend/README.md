# Backend - Liqueur Sales Management App

## Descripción

Backend completo para la aplicación de Gestión de Ventas de Licores. Proporciona una API REST con endpoints para gestionar:

- Categorías y Productos
- Clientes y Proveedores
- Pedidos, Ventas y Abonos
- Domicilios/Entregas
- Compras a Proveedores
- Insumos y Producción

---

## Estructura del Proyecto

```
backend/
├── index.js              # Entrada principal del servidor
├── config.js             # Configuración (variables de entorno)
├── db.js                 # Pool de conexiones PostgreSQL
├── models.js             # Modelos de datos (CRUD)
├── controllers.js        # Controladores de rutas
├── routes.js             # Definición de rutas API
├── db.pgsql              # Script de base de datos PostgreSQL
├── .env                  # Variables de entorno
├── API_ENDPOINTS.md      # Documentación de endpoints
└── README.md             # Este archivo
```

---

## Requisitos Previos

- **Node.js** (v14 o superior)
- **PostgreSQL** (v12 o superior)
- **npm** o **yarn**

---

## Instalación

### 1. Instalar Dependencias

```bash
npm install
```

O si usas yarn:

```bash
yarn install
```

### 2. Configurar Base de Datos

#### Opción A: Importar schema automáticamente

```bash
npm run setup-db
```

#### Opción B: Importar manualmente en PostgreSQL

```bash
psql -h localhost -p 5432 -U postgres -d grandmasliquorsdb -f backend/db.pgsql
```

### 3. Configurar Variables de Entorno

Actualiza el archivo `.env` con tus credenciales:

```env
# Configuración de Base de Datos (PostgreSQL local)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_DATABASE=grandmasliquorsdb

# Configuración del Servidor
PORT=3002
NODE_ENV=development
```

---

## Dependencias Requeridas

```json
{
  "express": "^4.18.0",
  "cors": "^2.8.5",
  "pg": "^8.8.0",
  "dotenv": "^16.0.0"
}
```

**Instalar todas:**

```bash
npm install express cors pg dotenv
```

---

## Ejecutar el Servidor

### Desarrollo

```bash
npm start
```

o con nodemon (actualizaciones automáticas):

```bash
npm run dev
```

### Producción

```bash
npm run prod
```

---

## Resultado Esperado

Al iniciar el servidor, deberías ver:

```
╔════════════════════════════════════════════════════════════╗
║        LIQUEUR SALES MANAGEMENT APP - BACKEND              ║
╚════════════════════════════════════════════════════════════╝

✓ Servidor Backend iniciado exitosamente
✓ Puerto: 3002 (configurable en .env con PORT)
✓ Ambiente: development
✓ Base de Datos: PostgreSQL Conectada
✓ Conexión App-Backend: Establecida

Método	Ruta
POST
/api/auth/login
GET
/api/auth/me
POST
/api/auth/logout
POST
/api/auth/logout-all
POST
/api/auth/change-password
POST
/api/auth/password-reset-request
POST
/api/auth/password-reset-confirm
POST
/api/auth/register-cliente
/api/public
Método	Ruta
GET
/api/public/catalogo
/api/categorias
Método	Ruta
GET
/api/categorias
GET
/api/categorias/:id
POST
/api/categorias
PUT
/api/categorias/:id
PUT
/api/categorias/:id/estado
DELETE
/api/categorias/:id
/api/productos
Método	Ruta
GET
/api/productos
GET
/api/productos/categoria/:categoryId
GET
/api/productos/:id
POST
/api/productos
PUT
/api/productos/:id
PUT
/api/productos/:id/estado
DELETE
/api/productos/:id
/api/clientes
Método	Ruta
GET
/api/clientes
GET
/api/clientes/documento/:documento
GET
/api/clientes/email/:email
GET
/api/clientes/usuario/:usuarioId
POST
/api/clientes/perfil/foto
GET
/api/clientes/:id
POST
/api/clientes
PUT
/api/clientes/:id
DELETE
/api/clientes/:id
/api/proveedores
Método	Ruta
GET
/api/proveedores
GET
/api/proveedores/nit/:nit
GET
/api/proveedores/email/:email
GET
/api/proveedores/telefono/:telefono
GET
/api/proveedores/:id
GET
/api/proveedores/:id/historial
GET
/api/proveedores/:id/pendientes
POST
/api/proveedores
PUT
/api/proveedores/:id
PUT
/api/proveedores/:id/estado
DELETE
/api/proveedores/:id
/api/pedidos
Método	Ruta
GET
/api/pedidos/cliente/:clienteId
POST
/api/pedidos/producto
PUT
/api/pedidos/:id/estado
GET
/api/pedidos
GET
/api/pedidos/:id
POST
/api/pedidos
PUT
/api/pedidos/:id
DELETE
/api/pedidos/:id
/api/ventas
Método	Ruta
GET
/api/ventas/cliente/:clienteId
GET
/api/ventas
GET
/api/ventas/:id
POST
/api/ventas
POST
/api/ventas/producto
PUT
/api/ventas/:id
DELETE
/api/ventas/:id
/api/abonos
Método	Ruta
GET
/api/abonos
GET
/api/abonos/pedido/:pedidoId
PUT
/api/abonos/:id/estado
GET
/api/abonos/:id
POST
/api/abonos
PUT
/api/abonos/:id
DELETE
/api/abonos/:id
/api/domicilios
Método	Ruta
GET
/api/domicilios/cliente/:clienteId
GET
/api/domicilios
GET
/api/domicilios/pedido/:pedidoId
GET
/api/domicilios/:id
POST
/api/domicilios
PUT
/api/domicilios/:id
DELETE
/api/domicilios/:id
/api/compras
Método	Ruta
GET
/api/compras
GET
/api/compras/:id
POST
/api/compras
POST
/api/compras/producto
PUT
/api/compras/:id
PUT
/api/compras/:id/estado
DELETE
/api/compras/:id
/api/insumos
Método	Ruta
GET
/api/insumos
GET
/api/insumos/:id
POST
/api/insumos
PUT
/api/insumos/:id
DELETE
/api/insumos/:id
/api/entregas-insumos
Método	Ruta
GET
/api/entregas-insumos
GET
/api/entregas-insumos/:id
POST
/api/entregas-insumos
PUT
/api/entregas-insumos/:id
DELETE
/api/entregas-insumos/:id
/api/produccion
Método	Ruta
GET
/api/produccion
GET
/api/produccion/:id
POST
/api/produccion
PUT
/api/produccion/:id
PUT
/api/produccion/:id/estado
DELETE
/api/produccion/:id
/api/roles
Método	Ruta
GET
/api/roles
GET
/api/roles/:id
GET
/api/roles/:id/auditoria
POST
/api/roles
PUT
/api/roles/:id
PUT
/api/roles/:id/permisos
DELETE
/api/roles/:id
/api/usuarios
Método	Ruta
GET
/api/usuarios
GET
/api/usuarios/email/:email
GET
/api/usuarios/documento/:documento
GET
/api/usuarios/telefono/:telefono
POST
/api/usuarios
PUT
/api/usuarios/:id/estado
PUT
/api/usuarios/:id/rol
GET
/api/usuarios/:id/impacto-eliminacion
GET
/api/usuarios/:id/detalle-completo
POST
/api/usuarios/:id/reset-password-forzado
GET
/api/usuarios/:id/historial
GET
/api/usuarios/:id
PUT
/api/usuarios/:id
DELETE
/api/usuarios/:id

🌐 URL Base: http://localhost:3002

════════════════════════════════════════════════════════════
```

---

## Arquitetura

### Flujo de Datos

```
Cliente (Frontend)
    ↓
    ├─→ Express API (routes.js)
    ├─→ Controladores (controllers.js)
    ├─→ Modelos (models.js)
    └─→ Base de Datos PostgreSQL
```

### Capas

1. **Rutas** (`routes.js`): Define endpoints HTTP
2. **Controladores** (`controllers.js`): Maneja la lógica de solicitudes
3. **Modelos** (`models.js`): Interactúa con la base de datos
4. **Base de Datos** (`db.js`): Pool de conexiones MySQL

---

## Endpoints Disponibles

### Health Check
```
GET /api/health
```

### CRUD Operations

#### Categorías
```
GET    /api/categorias          - Obtener todas
GET    /api/categorias/:id      - Obtener por ID
POST   /api/categorias          - Crear
PUT    /api/categorias/:id      - Actualizar
DELETE /api/categorias/:id      - Eliminar
```

#### Productos
```
GET    /api/productos           - Obtener todas
GET    /api/productos/:id       - Obtener por ID
GET    /api/productos/categoria/:categoryId - Por categoría
POST   /api/productos           - Crear
PUT    /api/productos/:id       - Actualizar
DELETE /api/productos/:id       - Eliminar
```

*Ver [API_ENDPOINTS.md](./API_ENDPOINTS.md) para documentación completa*

---

## Variables de Entorno

```env
# Base de Datos (PostgreSQL / AWS RDS)
DB_HOST          # Host del servidor PostgreSQL (ej: localhost)
DB_PORT          # Puerto PostgreSQL (default: 5432)
DB_USER          # Usuario PostgreSQL (default: postgres)
DB_PASSWORD      # Contraseña PostgreSQL
DB_DATABASE      # Nombre de la base de datos (ej: grandmasliquorsdb)

# Servidor
PORT             # Puerto del servidor (default: 3002)
NODE_ENV         # Ambiente: development, production (default: development)
```

---

## Manejo de Errores

### Respuesta de Error Estándar

```json
{
  "success": false,
  "message": "Descripción del error",
  "error": { /* Detalles en desarrollo */ }
}
```

### Códigos HTTP

| Código | Significado |
|--------|------------|
| 200 | Operación exitosa |
| 201 | Recurso creado |
| 400 | Solicitud inválida |
| 404 | No encontrado |
| 500 | Error del servidor |

---

## Seguridad

### Recomendaciones

1. **CORS**: Configurado para accept requests desde cualquier origen (modificar en producción)
2. **Variables de Entorno**: Nunca commitar `.env` con credenciales reales
3. **Validación**: Implementar validación de entrada en producción
4. **Autenticación**: Agregar JWT u otro sistema de autenticación
5. **Rate Limiting**: Considerar agregar límite de solicitudes

---

## Testing

### Test Health Endpoint

```bash
curl http://localhost:3002/api/health
```

### Test Crear Cliente

```bash
curl -X POST http://localhost:3002/api/clientes \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan",
    "apellido": "Pérez",
    "documento": "123456789",
    "email": "juan@example.com",
    "estado": "Activo"
  }'
```

---

## Troubleshooting

### Problema: "Cannot find module 'mysql2'"
**Solución:**
```bash
npm install mysql2
```

### Problema: "ECONNREFUSED - MySQL no está corriendo"
**Solución:**
```bash
# En Windows
net start MySQL80

# En Mac/Linux
brew services start mysql
# o
sudo systemctl start mysql
```

### Problema: "Access denied for user 'root'"
**Solución:**
- Verifica las credenciales en `.env`
- Asegúrate de que el usuario MySQL tiene permisos apropiados

### Problema: "Database does not exist"
**Solución:**
```bash
mysql -u root -p -e "CREATE DATABASE liqueur_sales;"
mysql -u root -p liqueur_sales < backend/schema.sql
```

---

## Próximas Mejoras

- [ ] Autenticación JWT
- [ ] Validación de entrada mejorada
- [ ] Rate limiting
- [ ] Logging mejorado
- [ ] Tests unitarios
- [ ] Documentación Swagger/OpenAPI
- [ ] Caché con Redis
- [ ] Notificaciones en tiempo real (WebSockets)

---

## Contribuciones

Para contribuir al proyecto:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## Licencia

Este proyecto está bajo licencia MIT.

---

## Contacto

Para preguntas o sugerencias sobre el backend, contacta al equipo de desarrollo.

---

**Última actualización:** 12 de Diciembre de 2024
