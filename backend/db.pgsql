-- ============================================================
-- GRANDMA'S LIQUORS - BASE DE DATOS COMPLETA
-- ============================================================
-- Script de inicialización completo compatible con pgAdmin 4
-- Versión: 1.0
-- 
-- INSTRUCCIONES EN PGADMIN 4:
-- 1. Cree una base de datos vacía desde pgAdmin 4.
-- 2. Seleccione esa base de datos y abra Query Tool.
-- 3. Copie y pegue este archivo completo y ejecútelo.
-- 4. Este script trabaja sobre la base actualmente seleccionada:
--    elimina tablas previas del proyecto, recrea la estructura, funciones,
--    triggers y carga los datos semilla solicitados.
-- 5. También puede seguir usándose desde `npm run migrate` sin cambios.
--
-- El script incluye:
--    - Estructura de tablas
--    - Datos iniciales (roles, usuarios, categorías, productos)
--    - Funciones y triggers
-- ============================================================

BEGIN;

-- ============================================================
-- PARTE 1: LIMPIAR TABLAS EXISTENTES
-- ============================================================

DROP TRIGGER IF EXISTS trigger_sync_cliente_from_usuario ON usuarios CASCADE;
DROP TRIGGER IF EXISTS trigger_sync_usuario_from_cliente ON clientes CASCADE;
DROP FUNCTION IF EXISTS sync_cliente_from_usuario() CASCADE;
DROP FUNCTION IF EXISTS sync_usuario_from_cliente() CASCADE;

DROP TABLE IF EXISTS schema_migrations CASCADE;
DROP TABLE IF EXISTS usuarios_login_intentos CASCADE;
DROP TABLE IF EXISTS usuarios_password_resets CASCADE;
DROP TABLE IF EXISTS usuarios_password_historial CASCADE;
DROP TABLE IF EXISTS usuarios_backup CASCADE;
DROP TABLE IF EXISTS usuarios_sesiones CASCADE;
DROP TABLE IF EXISTS usuarios_auditoria CASCADE;
DROP TABLE IF EXISTS roles_auditoria CASCADE;
DROP TABLE IF EXISTS proveedores_auditoria CASCADE;
DROP TABLE IF EXISTS compras_estado_historial CASCADE;
DROP TABLE IF EXISTS productos_auditoria CASCADE;
DROP TABLE IF EXISTS categorias_auditoria CASCADE;
DROP TABLE IF EXISTS clientes_auditoria CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS detalle_ventas CASCADE;
DROP TABLE IF EXISTS detalle_compras CASCADE;
DROP TABLE IF EXISTS detalle_pedidos CASCADE;
DROP TABLE IF EXISTS producto_insumos CASCADE;
DROP TABLE IF EXISTS entregas_insumos CASCADE;
DROP TABLE IF EXISTS insumo_movimientos CASCADE;
DROP TABLE IF EXISTS produccion CASCADE;
DROP TABLE IF EXISTS domicilios CASCADE;
DROP TABLE IF EXISTS abonos CASCADE;
DROP TABLE IF EXISTS ventas CASCADE;
DROP TABLE IF EXISTS pedidos CASCADE;
DROP TABLE IF EXISTS compras CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS insumos CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS proveedores CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ============================================================
-- PARTE 2: CREAR TABLAS
-- ============================================================

-- TABLA: roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
        CHECK (char_length(trim(nombre)) BETWEEN 3 AND 50),
    descripcion TEXT,
    permisos TEXT[],
    estado VARCHAR(20) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: schema_migrations
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE,
    version VARCHAR(255) UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: categorias
CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    cantidad_productos INTEGER NOT NULL DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: productos
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    descripcion TEXT,
    precio DECIMAL(18,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 10,
    imagen_url VARCHAR(255),
    estado VARCHAR(20) DEFAULT 'Activo',
    tipo_producto VARCHAR(30) NOT NULL DEFAULT 'terminado'
        CHECK (tipo_producto IN ('terminado','preparacion','insumo')),
    insumo_unidad_medida VARCHAR(30), -- presentacion: texto libre; UI catalogo insumo usa Unidades/Mililitros
    insumo_cantidad_medida NUMERIC(12,4), -- volumen/unidad: factor de receta en produccion (no afecta el descuento de stock al entregar al productor)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE productos
    ADD CONSTRAINT productos_preparacion_stock_cero_chk
    CHECK (tipo_producto <> 'preparacion' OR COALESCE(stock, 0) = 0);

-- TABLA: usuarios
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    tipo_documento VARCHAR(20) NOT NULL,
    documento VARCHAR(20) UNIQUE NOT NULL,
    direccion TEXT,
    email VARCHAR(100) UNIQUE NOT NULL,
    telefono VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    rol_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    estado VARCHAR(20) DEFAULT 'Activo',
    password_email_expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: clientes
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    tipo_documento VARCHAR(20) NOT NULL,
    documento VARCHAR(20) UNIQUE NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT,
    foto_url VARCHAR(255),
    estado VARCHAR(20) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: proveedores
CREATE TABLE proveedores (
    id SERIAL PRIMARY KEY,
    tipo_persona VARCHAR(20) NOT NULL,
    nombre_empresa VARCHAR(150),
    nit VARCHAR(20),
    nombre VARCHAR(100),
    apellido VARCHAR(100),
    tipo_documento VARCHAR(20),
    numero_documento VARCHAR(20),
    telefono VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT,
    estado VARCHAR(20) DEFAULT 'Activo',
    preferente BOOLEAN DEFAULT FALSE,
    rating NUMERIC(3,2),
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: pedidos
CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    numero_pedido VARCHAR(50) UNIQUE NOT NULL,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    fecha DATE NOT NULL,
    fecha_entrega DATE,
    detalles TEXT,
    direccion TEXT,
    telefono VARCHAR(20),
    total DECIMAL(10,2) DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'Pendiente',
    metodo_pago VARCHAR(50) DEFAULT 'Efectivo',
    esquema_abono VARCHAR(20) DEFAULT '100%',
    monto_abonado DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: detalle_pedidos
CREATE TABLE detalle_pedidos (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(18,2) NOT NULL,
    subtotal DECIMAL(18,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: ventas
CREATE TABLE ventas (
    id SERIAL PRIMARY KEY,
    numero_venta VARCHAR(50) UNIQUE NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE RESTRICT,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    metodopago VARCHAR(50),
    metodo_pago VARCHAR(50),
    abono_recibido DECIMAL(18,2) DEFAULT 0,
    total DECIMAL(18,2) NOT NULL,
    estado VARCHAR(30) DEFAULT 'Completada',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: detalle_ventas
CREATE TABLE detalle_ventas (
    id SERIAL PRIMARY KEY,
    venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(18,2) NOT NULL,
    subtotal DECIMAL(18,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: abonos
CREATE TABLE abonos (
    id SERIAL PRIMARY KEY,
    numero_abono VARCHAR(50) UNIQUE NOT NULL,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    monto DECIMAL(10,2) NOT NULL,
    fecha DATE NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    -- Estados validos: Registrado, Verificado, Aplicado, Cancelado, Finalizado.
    -- 'Finalizado' es un estado terminal que se asigna automaticamente cuando el
    -- domicilio del pedido se marca como entregado: en ese momento el abono
    -- inicial se actualiza al 100% del total y se consolida la informacion
    -- de las dos partes del pago en la columna `detalle`.
    estado VARCHAR(20) DEFAULT 'Registrado',
    detalle TEXT,
    porcentaje_abonado INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: domicilios
CREATE TABLE domicilios (
    id SERIAL PRIMARY KEY,
    numero_domicilio VARCHAR(50) UNIQUE NOT NULL,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    direccion TEXT NOT NULL,
    repartidor VARCHAR(100),
    repartidor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    hora TIME,
    estado VARCHAR(20) DEFAULT 'Pendiente',
    detalle TEXT,
    motivo_cancelacion VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: compras
CREATE TABLE compras (
    id SERIAL PRIMARY KEY,
    numero_compra VARCHAR(50) UNIQUE NOT NULL,
    proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal DECIMAL(18,2) DEFAULT 0,
    iva DECIMAL(18,2) DEFAULT 0,
    total DECIMAL(18,2) NOT NULL,
    observaciones TEXT,
    requiere_aprobacion BOOLEAN DEFAULT FALSE,
    aprobacion_extraordinaria BOOLEAN DEFAULT FALSE,
    motivo_aprobacion TEXT,
    estado VARCHAR(20) DEFAULT 'Pendiente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: detalle_compras (lineas: no incluir productos tipo preparacion; validado en API)
CREATE TABLE detalle_compras (
    id SERIAL PRIMARY KEY,
    compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(18,2) NOT NULL,
    subtotal DECIMAL(18,2) NOT NULL,
    porcentaje_ganancia NUMERIC(12,2) DEFAULT 0 CHECK (porcentaje_ganancia >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: insumos
CREATE TABLE insumos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    cantidad DECIMAL(10,2) DEFAULT 0,
    unidad VARCHAR(20) NOT NULL,
    stock_minimo DECIMAL(10,2) DEFAULT 10,
    estado VARCHAR(20) DEFAULT 'Activo',
    ultimo_operario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ultima_fecha TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: producto_insumos (receta: insumo legacy por id; la produccion descuenta entregas al productor segun suma cantidad_requerida * cantidad preparacion del pedido)
CREATE TABLE producto_insumos (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    cantidad_requerida DECIMAL(12,4) NOT NULL CHECK (cantidad_requerida > 0),
    unidad VARCHAR(20) NOT NULL,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (producto_id, insumo_id)
);

-- TABLA: entregas_insumos (al registrar una entrega se descuenta stock en productos tipo insumo o en insumos legacy)
CREATE TABLE entregas_insumos (
    id SERIAL PRIMARY KEY,
    numero_entrega VARCHAR(50) UNIQUE NOT NULL,
    insumo_id INTEGER REFERENCES insumos(id) ON DELETE CASCADE,
    producto_catalogo_id INTEGER REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad DECIMAL(10,2) NOT NULL,
    unidad VARCHAR(20) NOT NULL,
    operario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    hora TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    anulada BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT entregas_insumos_catalogo_xor_chk CHECK (
        (insumo_id IS NOT NULL AND producto_catalogo_id IS NULL)
        OR (insumo_id IS NULL AND producto_catalogo_id IS NOT NULL)
    )
);

-- TABLA: insumo_movimientos
CREATE TABLE insumo_movimientos (
    id SERIAL PRIMARY KEY,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    tipo_movimiento VARCHAR(30) NOT NULL,
    cantidad DECIMAL(12,4) NOT NULL,
    unidad VARCHAR(20) NOT NULL,
    saldo_anterior DECIMAL(12,4),
    saldo_nuevo DECIMAL(12,4),
    referencia_tabla VARCHAR(50),
    referencia_id INTEGER,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    razon TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA: produccion
CREATE TABLE produccion (
    id SERIAL PRIMARY KEY,
    numero_produccion VARCHAR(50) UNIQUE NOT NULL,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL, -- regla negocio: un pedido solo una produccion (API)
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    fecha DATE NOT NULL,
    responsable VARCHAR(150),
    productor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    tiempo_preparacion_minutos INTEGER DEFAULT 1 CHECK (tiempo_preparacion_minutos > 0),
    estado VARCHAR(40) DEFAULT 'Orden Recibida'
        CHECK (estado IN ('Orden Recibida','Orden en preparacion','Orden Lista','Cancelada')),
    notes TEXT,
    -- insumos_gastados: descuento solo en entregas_insumos (FIFO); no modifica productos.stock del inventario central
    insumos_gastados JSONB DEFAULT '[]'::jsonb,
    detalle_preparacion JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLAS DE AUDITORÍA
CREATE TABLE productos_auditoria (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER,
    accion VARCHAR(20) NOT NULL,
    usuario_id INTEGER,
    cambios JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categorias_auditoria (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER,
    accion VARCHAR(20) NOT NULL,
    usuario_id INTEGER,
    cambios JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clientes_auditoria (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER,
    accion VARCHAR(20) NOT NULL,
    usuario_id INTEGER,
    cambios JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proveedores_auditoria (
    id SERIAL PRIMARY KEY,
    proveedor_id INTEGER,
    accion VARCHAR(20) NOT NULL,
    usuario_id INTEGER,
    cambios JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE compras_estado_historial (
    id SERIAL PRIMARY KEY,
    compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    motivo TEXT,
    usuario_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles_auditoria (
    id SERIAL PRIMARY KEY,
    rol_id INTEGER,
    accion VARCHAR(20) NOT NULL,
    usuario_id INTEGER,
    cambios JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios_auditoria (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER,
    accion VARCHAR(20) NOT NULL,
    actor_id INTEGER,
    cambios JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios_sesiones (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    jti VARCHAR(120) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(64),
    user_agent TEXT
);

CREATE TABLE usuarios_backup (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    actor_id INTEGER,
    reason TEXT,
    snapshot JSONB NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios_password_historial (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios_password_resets (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios_login_intentos (
    email VARCHAR(255) PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    blocked_until TIMESTAMP NULL,
    last_attempt_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PARTE 3: DATOS INICIALES
-- ============================================================

-- Insertar roles
-- Nota:
--  * "Administrador" tiene bypass total en el frontend (ver routePermissions.ts),
--    asi que mantener permisos = '{}' es valido y no rompe nada.
--  * Los permisos sembrados para los demas roles son los conjuntos minimos
--    para que cada perfil pueda iniciar sesion y trabajar sin requerir
--    configuracion manual posterior por parte del Admin.
--  * Los permisos del rol "Cliente" son OBLIGATORIOS: sin ellos un cliente
--    recien registrado no veria la tienda ni sus pedidos. La lista debe
--    coincidir con CLIENT_ALLOWED_PERMISSIONS en src/models/entities.models.js.
INSERT INTO roles (nombre, descripcion, permisos, estado) VALUES
('Administrador', 'Acceso total a todas las funcionalidades', '{}', 'Activo'),
('Asesor', 'Operación completa excepto configuración y usuarios (solo Administrador)', ARRAY[
  'Ver Dashboard',
  'Ver Clientes', 'Crear Clientes', 'Editar Clientes', 'Eliminar Clientes',
  'Ver Ventas', 'Crear Ventas', 'Editar Ventas', 'Eliminar Ventas',
  'Ver Pedidos', 'Crear Pedidos', 'Editar Pedidos', 'Eliminar Pedidos',
  'Ver Abonos', 'Crear Abonos', 'Editar Abonos', 'Eliminar Abonos',
  'Ver Domicilios', 'Crear Domicilios', 'Editar Domicilios', 'Eliminar Domicilios',
  'Ver Productos', 'Crear Productos', 'Editar Productos', 'Eliminar Productos',
  'Ver Categorías', 'Crear Categorías', 'Editar Categorías', 'Eliminar Categorías',
  'Ver Proveedores', 'Crear Proveedores', 'Editar Proveedores', 'Eliminar Proveedores',
  'Ver Compras', 'Crear Compras', 'Editar Compras', 'Eliminar Compras',
  'Ver Insumos', 'Crear Insumos', 'Editar Insumos', 'Eliminar Insumos',
  'Entregar Insumos',
  'Ver Producción', 'Registrar Producción',
  'Ver Producto-Insumos', 'Crear Producto-Insumos', 'Editar Producto-Insumos', 'Eliminar Producto-Insumos'
], 'Activo'),
('Productor', 'Solo órdenes de producción asignadas: consulta y cambio de estado', ARRAY[
  'Ver Dashboard',
  'Ver Producción'
], 'Activo'),
('Repartidor', 'Puede gestionar domicilios y entregas', ARRAY[
  'Ver Dashboard',
  'Ver Domicilios', 'Editar Domicilios'
], 'Activo'),
('Cliente', 'Tienda y mis pedidos (estado de domicilio incluido en el pedido)', ARRAY[
  'Cliente',
  'Ver Dashboard',
  'Ver Tienda',
  'Ver Mis Pedidos'
], 'Activo');

-- Insertar usuarios semilla
-- Conteo solicitado: 10 usuarios internos
--   * 1 Administrador
--   * 3 Asesores
--   * 3 Productores
--   * 3 Repartidores
-- Todos los usuarios sembrados usan la misma contraseña: password_123
INSERT INTO usuarios (nombre, apellido, tipo_documento, documento, email, telefono, direccion, password_hash, rol_id, estado) VALUES
('Admin', 'Sistema', 'CC', '100012345600', 'admin@grandmas.com', '3001234500', 'Oficina Central', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 1, 'Activo'),
('Laura', 'Gomez', 'CC', '100012345601', 'asesor1@grandmas.com', '3001234501', 'Sucursal Norte', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 2, 'Activo'),
('Mateo', 'Rios', 'CC', '100012345602', 'asesor2@grandmas.com', '3001234502', 'Sucursal Centro', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 2, 'Activo'),
('Sara', 'Lopez', 'CC', '100012345603', 'asesor3@grandmas.com', '3001234503', 'Sucursal Sur', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 2, 'Activo'),
('Daniel', 'Mora', 'CC', '100012345604', 'productor1@grandmas.com', '3001234504', 'Planta 1', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 3, 'Activo'),
('Paula', 'Vargas', 'CC', '100012345605', 'productor2@grandmas.com', '3001234505', 'Planta 2', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 3, 'Activo'),
('Julian', 'Castro', 'CC', '100012345606', 'productor3@grandmas.com', '3001234506', 'Planta 3', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 3, 'Activo'),
('Nicolas', 'Perez', 'CC', '100012345607', 'repartidor1@grandmas.com', '3001234507', 'Zona Occidente', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 4, 'Activo'),
('Valentina', 'Reyes', 'CC', '100012345608', 'repartidor2@grandmas.com', '3001234508', 'Zona Oriente', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 4, 'Activo'),
('Camilo', 'Torres', 'CC', '100012345609', 'repartidor3@grandmas.com', '3001234509', 'Zona Metropolitana', '$2b$10$npauCy3OmoZRWSMfDCfLGO1AfbaCFv54unyLryPZ6SsX0gFPhVuqC', 4, 'Activo');

INSERT INTO usuarios_password_historial (usuario_id, password_hash)
SELECT id, password_hash
FROM usuarios;

-- Insertar categorías de productos (12)
INSERT INTO categorias (nombre, descripcion, estado) VALUES
('Whiskies', 'Whiskies nacionales e importados para venta directa', 'Activo'),
('Rones', 'Rones blancos, dorados y anejo premium', 'Activo'),
('Vinos', 'Vinos tintos, blancos y espumosos', 'Activo'),
('Cervezas', 'Cervezas artesanales y comerciales listas para venta', 'Activo'),
('Tequilas', 'Tequilas y mezcales de distintas gamas', 'Activo'),
('Vodkas', 'Vodkas tradicionales y saborizados', 'Activo'),
('Cremas', 'Cremas licorosas listas para consumo', 'Activo'),
('Ginebras', 'Ginebras botanicas y citricas', 'Activo'),
('Aguardientes', 'Aguardientes clasicos y sin azucar', 'Activo'),
('Cocteleria lista', 'Bebidas y mezclas listas para servir', 'Activo'),
('Preparaciones', 'Bases y macerados de elaboracion interna', 'Activo'),
('Insumos de produccion', 'Materias primas y suministros para elaboracion', 'Activo');

-- Insertar productos (45)
-- 20 terminados, 15 de preparación, 10 tipo insumo
INSERT INTO productos (nombre, categoria_id, descripcion, precio, stock, stock_minimo, estado, tipo_producto) VALUES
('Whisky Andino 750ml', 1, 'Whisky suave con notas de roble y vainilla', 68000.00, 24, 6, 'Activo', 'terminado'),
('Whisky Reserva Roble 750ml', 1, 'Whisky madurado con perfil intenso y especiado', 82000.00, 18, 5, 'Activo', 'terminado'),
('Ron Caribe Dorado 750ml', 2, 'Ron dorado ideal para cocteleria y consumo solo', 42000.00, 32, 8, 'Activo', 'terminado'),
('Ron Anejo Gran Barrica 750ml', 2, 'Ron anejo con final largo y aroma tostado', 59000.00, 20, 6, 'Activo', 'terminado'),
('Vino Tinto Casa Vieja 750ml', 3, 'Vino tinto afrutado de cuerpo medio', 36000.00, 28, 8, 'Activo', 'terminado'),
('Vino Blanco Monteluna 750ml', 3, 'Vino blanco fresco con notas citricas', 34000.00, 22, 6, 'Activo', 'terminado'),
('Espumoso Brisa Rosa 750ml', 3, 'Espumoso semidulce para celebraciones', 39000.00, 16, 5, 'Activo', 'terminado'),
('Cerveza Rubia Artesanal 330ml', 4, 'Cerveza ligera con amargor balanceado', 6500.00, 72, 18, 'Activo', 'terminado'),
('Cerveza Roja Artesanal 330ml', 4, 'Cerveza maltosa con notas caramelizadas', 6900.00, 65, 15, 'Activo', 'terminado'),
('Cerveza Negra Porter 330ml', 4, 'Cerveza oscura con notas a cacao y cafe', 7200.00, 54, 14, 'Activo', 'terminado'),
('Tequila Agave Azul 750ml', 5, 'Tequila joven 100 por ciento agave', 76000.00, 14, 4, 'Activo', 'terminado'),
('Tequila Reposado Sierra 750ml', 5, 'Tequila reposado con notas de miel y madera', 89000.00, 12, 4, 'Activo', 'terminado'),
('Vodka Cristal 700ml', 6, 'Vodka clasico de perfil limpio y neutro', 47000.00, 26, 7, 'Activo', 'terminado'),
('Vodka Citrus 700ml', 6, 'Vodka saborizado con limon y cascara de naranja', 49000.00, 19, 5, 'Activo', 'terminado'),
('Crema de Cafe 700ml', 7, 'Licor cremoso con notas intensas de cafe', 41000.00, 18, 5, 'Activo', 'terminado'),
('Crema de Coco 700ml', 7, 'Licor cremoso de coco para postres y cocteles', 43000.00, 17, 5, 'Activo', 'terminado'),
('Ginebra Botanica 750ml', 8, 'Ginebra artesanal con botanicos colombianos', 78000.00, 15, 4, 'Activo', 'terminado'),
('Ginebra Limonaria 750ml', 8, 'Ginebra citrica con final herbal', 80000.00, 13, 4, 'Activo', 'terminado'),
('Aguardiente Tradicion 750ml', 9, 'Aguardiente clasico anisado de venta continua', 33000.00, 40, 10, 'Activo', 'terminado'),
('Aguardiente Sin Azucar 750ml', 9, 'Aguardiente suave sin azucar adicionada', 35000.00, 34, 8, 'Activo', 'terminado'),

('Base de Limoncello', 11, 'Preparacion macerada de limon para embotellado', 22000.00, 0, 0, 'Activo', 'preparacion'),
('Base de Crema Irlandesa', 11, 'Preparacion cremosa para licor estilo irlandes', 28000.00, 0, 0, 'Activo', 'preparacion'),
('Macerado de Frutos Rojos', 11, 'Base macerada de frutos rojos para licor', 24000.00, 0, 0, 'Activo', 'preparacion'),
('Macerado de Cafe', 11, 'Preparacion de cafe para licor artesanal', 23000.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Pina Colada', 11, 'Base de pina y coco para cocteleria lista', 26000.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Mojito Artesanal', 11, 'Preparacion con hierbabuena y limon', 21000.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Maracuya', 11, 'Base tropical para licor frutal', 22500.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Naranja Especiada', 11, 'Macerado citrico con clavo y canela', 21500.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Hierbabuena', 11, 'Base herbal para bebidas refrescantes', 20500.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Canelazo', 11, 'Base especiada para licor caliente', 23500.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Crema de Whisky', 11, 'Base cremosa para licor de whisky', 29500.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Licor de Coco', 11, 'Preparacion dulce de coco para embotellar', 25500.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Tamarindo', 11, 'Base concentrada de tamarindo', 22500.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Jamaica', 11, 'Macerado de flor de jamaica', 21800.00, 0, 0, 'Activo', 'preparacion'),
('Preparacion Frambuesa', 11, 'Base de frambuesa para licor artesanal', 24800.00, 0, 0, 'Activo', 'preparacion'),

('Alcohol Etilico Food Grade', 12, 'Alcohol base para elaboracion de licores artesanales', 95000.00, 60, 15, 'Activo', 'insumo'),
('Azucar Refinada x 25kg', 12, 'Azucar refinada para preparaciones y jarabes', 82000.00, 48, 12, 'Activo', 'insumo'),
('Botella Transparente 750ml', 12, 'Botella de vidrio para productos terminados', 4200.00, 220, 60, 'Activo', 'insumo'),
('Tapa Rosca Dorada', 12, 'Tapa metalica de seguridad para botella 750ml', 450.00, 500, 120, 'Activo', 'insumo'),
('Etiqueta Premium', 12, 'Etiqueta adhesiva resistente a humedad', 380.00, 480, 120, 'Activo', 'insumo'),
('Esencia de Vainilla x 1L', 12, 'Esencia concentrada para perfiles dulces y cremosos', 36000.00, 26, 8, 'Activo', 'insumo'),
('Pulpa de Mora x 5kg', 12, 'Pulpa congelada para macerados de fruta', 54000.00, 18, 6, 'Activo', 'insumo'),
('Pulpa de Maracuya x 5kg', 12, 'Pulpa tropical para preparaciones frutales', 56000.00, 16, 6, 'Activo', 'insumo'),
('Jarabe Simple x 5L', 12, 'Jarabe base para cocteleria y mezclas', 29000.00, 22, 7, 'Activo', 'insumo'),
('Glicerina Alimentaria x 1L', 12, 'Glicerina para ajustar textura en cremas licorosas', 31000.00, 14, 5, 'Activo', 'insumo');

UPDATE categorias c
SET cantidad_productos = (
    SELECT COUNT(*)
    FROM productos p
    WHERE p.categoria_id = c.id
);

-- Insertar proveedores (12)
INSERT INTO proveedores (tipo_persona, nombre_empresa, nit, nombre, apellido, tipo_documento, numero_documento, email, telefono, direccion, estado, preferente, rating, observaciones) VALUES
('Juridica', 'Distribuidora Andina SAS', '900800123401', 'Laura', 'Suarez', NULL, NULL, 'contacto@andina.com', '6015551101', 'Bogota, Centro logistico 12', 'Activo', TRUE, 4.80, 'Proveedor principal de destilados'),
('Juridica', 'Casa del Ron SAS', '900800123402', 'Andres', 'Nieto', NULL, NULL, 'ventas@casadelron.com', '6015551102', 'Barranquilla, Via 40 bodega 8', 'Activo', TRUE, 4.70, 'Especialista en rones importados'),
('Juridica', 'Importadora Premium Ltda', '900800123403', 'Paola', 'Mendez', NULL, NULL, 'info@premiumltda.com', '6015551103', 'Bogota, Zona Franca modulo 5', 'Activo', FALSE, 4.50, 'Portafolio premium de whiskies y ginebras'),
('Juridica', 'Bebidas del Valle SAS', '900800123404', 'Felipe', 'Guerra', NULL, NULL, 'comercial@bebidasdelvalle.com', '6025551104', 'Cali, Parque industrial Yumbo', 'Activo', FALSE, 4.40, 'Licores nacionales y cocteleria'),
('Juridica', 'Vidrios y Envases SAS', '900800123405', 'Monica', 'Ortiz', NULL, NULL, 'servicio@vidriosenvases.com', '6045551105', 'Medellin, Autopista sur km 4', 'Activo', TRUE, 4.90, 'Envases y tapas para produccion'),
('Juridica', 'Sabores y Esencias SAS', '900800123406', 'Karen', 'Pardo', NULL, NULL, 'pedidos@saboresyesencias.com', '6015551106', 'Bogota, Fontibon bodega 14', 'Activo', FALSE, 4.60, 'Esencias y aditivos alimentarios'),
('Natural', NULL, NULL, 'Carlos', 'Martinez', 'CC', '100012349001', 'carlos.martinez@proveedores.com', '3105551107', 'Medellin, barrio Laureles', 'Activo', FALSE, 4.20, 'Proveedor independiente de frutas'),
('Natural', NULL, NULL, 'Marta', 'Rojas', 'CC', '100012349002', 'marta.rojas@proveedores.com', '3115551108', 'Bogota, barrio Kennedy', 'Activo', FALSE, 4.30, 'Suministro de insumos secos'),
('Natural', NULL, NULL, 'Jorge', 'Bernal', 'CC', '100012349003', 'jorge.bernal@proveedores.com', '3125551109', 'Cali, barrio San Fernando', 'Activo', FALSE, 4.10, 'Proveedor ocasional de botellas'),
('Natural', NULL, NULL, 'Liliana', 'Acosta', 'CC', '100012349004', 'liliana.acosta@proveedores.com', '3135551110', 'Pereira, sector industrial', 'Activo', FALSE, 4.00, 'Suministro regional de empaques'),
('Natural', NULL, NULL, 'Oscar', 'Forero', 'CC', '100012349005', 'oscar.forero@proveedores.com', '3145551111', 'Bucaramanga, centro empresarial', 'Activo', FALSE, 4.35, 'Proveedor de insumos de cocteleria'),
('Natural', NULL, NULL, 'Diana', 'Moreno', 'CC', '100012349006', 'diana.moreno@proveedores.com', '3155551112', 'Manizales, avenida Santander', 'Activo', FALSE, 4.25, 'Proveedor de pulpas y frutas congeladas');

-- Insertar clientes (10)
INSERT INTO clientes (usuario_id, nombre, apellido, tipo_documento, documento, email, telefono, direccion, estado) VALUES
(NULL, 'Sofia', 'Ramirez', 'CC', '100045670001', 'sofia.ramirez@clientes.com', '3205552001', 'Medellin, Calle 10 25 41', 'Activo'),
(NULL, 'Juan', 'Herrera', 'CC', '100045670002', 'juan.herrera@clientes.com', '3205552002', 'Bogota, Carrera 15 99 21', 'Activo'),
(NULL, 'Valeria', 'Quintero', 'CC', '100045670003', 'valeria.quintero@clientes.com', '3205552003', 'Cali, Avenida 3 norte 45 18', 'Activo'),
(NULL, 'Sebastian', 'Ospina', 'CC', '100045670004', 'sebastian.ospina@clientes.com', '3205552004', 'Pereira, Calle 22 14 09', 'Activo'),
(NULL, 'Camila', 'Restrepo', 'CC', '100045670005', 'camila.restrepo@clientes.com', '3205552005', 'Envigado, Transversal 34 28 55', 'Activo'),
(NULL, 'Andres', 'Luna', 'CC', '100045670006', 'andres.luna@clientes.com', '3205552006', 'Barranquilla, Calle 84 51 10', 'Activo'),
(NULL, 'Mariana', 'Salazar', 'CC', '100045670007', 'mariana.salazar@clientes.com', '3205552007', 'Bucaramanga, Carrera 33 52 18', 'Activo'),
(NULL, 'Felipe', 'Cano', 'CC', '100045670008', 'felipe.cano@clientes.com', '3205552008', 'Manizales, Avenida Paralela 61 44', 'Activo'),
(NULL, 'Daniela', 'Rincon', 'CC', '100045670009', 'daniela.rincon@clientes.com', '3205552009', 'Bogota, Calle 134 19 77', 'Activo'),
(NULL, 'Tomas', 'Arango', 'CC', '100045670010', 'tomas.arango@clientes.com', '3205552010', 'Medellin, Circular 5 70 12', 'Activo');

-- La tabla insumos permanece vacía en el seed porque el modulo de inventario
-- de insumos trabaja principalmente sobre productos de tipo "insumo".

-- ============================================================
-- PARTE 4: FUNCIONES Y TRIGGERS (Sin cambios)
-- ============================================================

CREATE OR REPLACE FUNCTION sync_cliente_from_usuario()
RETURNS TRIGGER AS $$
DECLARE
    cliente_role_id INTEGER;
BEGIN
    SELECT id INTO cliente_role_id FROM roles WHERE nombre = 'Cliente' LIMIT 1;
    IF cliente_role_id IS NULL THEN RETURN NEW; END IF;
    
    IF NEW.rol_id = cliente_role_id THEN
        INSERT INTO clientes (usuario_id, nombre, apellido, tipo_documento, documento, email, telefono, direccion, estado)
        VALUES (NEW.id, NEW.nombre, NEW.apellido, NEW.tipo_documento, NEW.documento, NEW.email, NEW.telefono, NEW.direccion, NEW.estado)
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_cliente_from_usuario
AFTER INSERT OR UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION sync_cliente_from_usuario();

COMMIT;

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
-- Base de datos inicializada exitosamente.
--
-- CREDENCIALES DE PRUEBA (todas comparten la misma contrasena):
--   Contrasena: password_123
--
--   Usuarios internos sembrados:
--     Administrador: admin@grandmas.com
--     Asesores: asesor1@grandmas.com, asesor2@grandmas.com, asesor3@grandmas.com
--     Productores: productor1@grandmas.com, productor2@grandmas.com, productor3@grandmas.com
--     Repartidores: repartidor1@grandmas.com, repartidor2@grandmas.com, repartidor3@grandmas.com
--   Nota: los 10 registros de clientes se siembran en la tabla `clientes`
--   para pruebas funcionales de ventas, pedidos y domicilios.
--
-- Para regenerar las contrasenas con un valor distinto, edita la seccion
-- "Insertar usuarios de ejemplo" arriba y ejecuta:
--   node -e "console.log(require('bcryptjs').hashSync('TU_NUEVA_PASSWORD', 10))"
-- ============================================================
