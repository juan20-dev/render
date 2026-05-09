-- ============================================================
-- GRANDMA'S LIQUORS - BASE DE DATOS COMPLETA
-- ============================================================
-- Script de inicialización con datos de ejemplo
-- Versión: 1.0
-- 
-- INSTRUCCIONES:
-- 1. Crear BD vacía: createdb -U postgres grandma\'sdb
-- 2. Ejecutar este script: psql -U postgres -d grandma\'sdb -f db.pgsql
-- 3. El script incluye:
--    - Estructura de tablas
--    - Datos iniciales (roles, usuarios, categorías, productos)
--    - Funciones y triggers
-- ============================================================

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
        CHECK (tipo_producto IN ('terminado','preparacion')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- TABLA: detalle_compras
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

-- TABLA: producto_insumos
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

-- TABLA: entregas_insumos
CREATE TABLE entregas_insumos (
    id SERIAL PRIMARY KEY,
    numero_entrega VARCHAR(50) UNIQUE NOT NULL,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    cantidad DECIMAL(10,2) NOT NULL,
    unidad VARCHAR(20) NOT NULL,
    operario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    hora TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    fecha DATE NOT NULL,
    responsable VARCHAR(150),
    tiempo_preparacion_minutos INTEGER DEFAULT 1 CHECK (tiempo_preparacion_minutos > 0),
    estado VARCHAR(40) DEFAULT 'Orden Recibida'
        CHECK (estado IN ('Orden Recibida','Orden en preparacion','Orden Lista','Cancelada')),
    notes TEXT,
    insumos_gastados JSONB DEFAULT '[]'::jsonb,
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
INSERT INTO roles (nombre, descripcion, permisos, estado) VALUES
('Administrador', 'Acceso total a todas las funcionalidades', '{}', 'Activo'),
('Asesor', 'Puede crear compras y ver reportes', '{}', 'Activo'),
('Productor', 'Acceso a módulo de producción', '{}', 'Activo'),
('Repartidor', 'Puede gestionar domicilios y entregas', '{}', 'Activo'),
('Cliente', 'Acceso a tienda y pedidos personales', '{}', 'Activo');

-- Insertar usuarios de ejemplo
-- Credenciales de prueba para cada rol
INSERT INTO usuarios (nombre, apellido, tipo_documento, documento, email, telefono, direccion, password_hash, rol_id, estado) VALUES
('Admin', 'Sistema', 'CC', '100012345678', 'admin@grandmas.com', '3001234567', 'Oficina Central', '$2b$10$wll/iFG/TlbICeKe9AA6vegRb5SAE1sa9iQ7UpaCXKjHoYaxKxj6m', 1, 'Activo'),
('Asesor', 'Principal', 'CC', '100012345679', 'asesor@grandmas.com', '3001234568', 'Calle Principal 123', '$2b$10$s3bdN9VvLpe0rH1cePoFve2keWeP8flJTdQz00DYdknzEbJ7nVla6', 2, 'Activo'),
('Productor', 'Jefe', 'CC', '100012345680', 'productor@grandmas.com', '3001234569', 'Zona Producción', '$2b$10$u1iQnnuwr016HyIS3rNLS.sCd.kOOUjySWSQmTHrhd..rS/7Oor.a', 3, 'Activo'),
('Repartidor', 'Uno', 'CC', '100012345681', 'repartidor@grandmas.com', '3001234570', 'Zona Reparto', '$2b$10$mYIecNeT/FR43MtI0RLw4OPWNX2glNvp6f5qHFze/onh1l5dEcFSi', 4, 'Activo'),
('Cliente', 'Ejemplo', 'CC', '100012345682', 'cliente@grandmas.com', '3001234571', 'Calle Secundaria 456', '$2b$10$Xc4JiqZv5fsbWpVlXMjd4.sakub/owiYqXIB0jk5F5r9NLp4eczU6', 5, 'Activo');

-- Insertar categorías de productos
INSERT INTO categorias (nombre, descripcion, estado) VALUES
('Cervezas', 'Cervezas nacionales e internacionales', 'Activo'),
('Licores', 'Licores destilados premium', 'Activo'),
('Vinos', 'Vinos nacionales e importados', 'Activo'),
('Ron', 'Rones variados de diferentes regiones', 'Activo'),
('Tequila', 'Tequilas artesanales y industriales', 'Activo'),
('Vodka', 'Vodkas de diferentes marcas', 'Activo');

-- Insertar productos de ejemplo
INSERT INTO productos (nombre, categoria_id, descripcion, precio, stock, stock_minimo, estado, tipo_producto) VALUES
('Cerveza Pilsen 330ml', 1, 'Cerveza clara refrescante', 2500.00, 100, 20, 'Activo', 'terminado'),
('Cerveza Negra 330ml', 1, 'Cerveza oscura robusta', 3000.00, 75, 15, 'Activo', 'terminado'),
('Ron Bacardi 750ml', 4, 'Ron blanco premium', 35000.00, 25, 5, 'Activo', 'terminado'),
('Vodka Smirnoff 750ml', 6, 'Vodka internacional', 38000.00, 20, 5, 'Activo', 'terminado'),
('Vino Tinto Reserva 750ml', 3, 'Vino tinto con cuerpo', 45000.00, 30, 10, 'Activo', 'terminado'),
('Tequila Patrón 750ml', 5, 'Tequila 100% agave', 52000.00, 15, 5, 'Activo', 'terminado');

-- Insertar proveedores de ejemplo
INSERT INTO proveedores (tipo_persona, nombre_empresa, nit, nombre, apellido, tipo_documento, numero_documento, email, telefono, direccion, estado) VALUES
('Juridica', 'Distribuidora Licores S.A.', '900800123456', 'Juan', 'López', NULL, NULL, 'contacto@distribuidora.com', '6015551000', 'Cra. 5 #10-50, Bogotá', 'Activo'),
('Natural', NULL, NULL, 'Carlos', 'Martínez', 'CC', '100012345998', 'carlos@licores.com', '3105551234', 'Calle 20 #5-30, Medellín', 'Activo'),
('Juridica', 'Importadores Premium Ltd', '901900654321', 'María', 'Rodríguez', NULL, NULL, 'info@importadores.com', '6015556789', 'Av. Carrera 7 #100-50, Bogotá', 'Activo');

-- Insertar cliente de ejemplo
INSERT INTO clientes (usuario_id, nombre, apellido, tipo_documento, documento, email, telefono, direccion, estado) VALUES
(5, 'Cliente', 'Ejemplo', 'CC', '100012345682', 'cliente@grandmas.com', '3001234571', 'Calle Secundaria 456', 'Activo');

-- Insertar insumos de ejemplo (para producción)
INSERT INTO insumos (nombre, descripcion, cantidad, unidad, stock_minimo, estado) VALUES
('Levadura', 'Levadura de cervecería', 50.00, 'kg', 5.00, 'Activo'),
('Lúpulo', 'Lúpulo para cerveza', 30.00, 'kg', 5.00, 'Activo'),
('Malta', 'Malta tostada clara', 100.00, 'kg', 20.00, 'Activo'),
('Agua Purificada', 'Agua para destilación', 500.00, 'litros', 100.00, 'Activo');

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

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
-- Base de datos inicializada exitosamente
-- Usuarios de prueba disponibles:
--   - Email: admin@grandmas.local (Administrador)
--   - Email: asesor@grandmas.local (Asesor)
--   - Email: productor@grandmas.local (Productor)
--   - Email: repartidor1@grandmas.local (Repartidor)
--   - Email: cliente@gmail.com (Cliente)
-- 
-- Contraseña: password_123 (para todos)
-- ============================================================
