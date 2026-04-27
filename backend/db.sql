-- ========================================
-- LIQUEUR SALES MANAGEMENT DATABASE SCHEMA
-- PostgreSQL Script
-- ========================================

-- Drop existing tables if they exist (in correct order due to foreign keys)
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
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS detalle_ventas CASCADE;
DROP TABLE IF EXISTS detalle_compras CASCADE;
DROP TABLE IF EXISTS detalle_pedidos CASCADE;
DROP TABLE IF EXISTS entregas_insumos CASCADE;
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

-- ========================================
-- TABLA: roles
-- ========================================
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,
    descripcion TEXT,
    permisos TEXT[], -- Array de permisos
    estado VARCHAR(20) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: schema_migrations
-- ========================================
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE,
    version VARCHAR(255) UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: categorias
-- ========================================
CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    estado VARCHAR(20) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: productos
-- ========================================
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 10,
    imagen_url VARCHAR(255),
    estado VARCHAR(20) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: clientes
-- ========================================
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER,
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

-- ========================================
-- TABLA: proveedores
-- ========================================
CREATE TABLE proveedores (
    id SERIAL PRIMARY KEY,
    tipo_persona VARCHAR(20) NOT NULL, -- 'Natural' o 'Jurídica'
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

-- ========================================
-- TABLA: pedidos
-- ========================================
CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    numero_pedido VARCHAR(50) UNIQUE NOT NULL,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    fecha DATE NOT NULL,
    fecha_entrega DATE,
    detalles TEXT,
    total DECIMAL(10, 2) DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'Pendiente', -- Pendiente, En Proceso, Completado, Cancelado
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: detalle_pedidos
-- ========================================
CREATE TABLE detalle_pedidos (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: ventas
-- ========================================
CREATE TABLE ventas (
    id SERIAL PRIMARY KEY,
    numero_venta VARCHAR(50) UNIQUE NOT NULL,
    tipo VARCHAR(20) NOT NULL, -- 'Directa' o 'Por Pedido'
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    metodopago VARCHAR(50) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'Completada', -- Completada, Cancelada
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: detalle_ventas
-- ========================================
CREATE TABLE detalle_ventas (
    id SERIAL PRIMARY KEY,
    venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: abonos
-- ========================================
CREATE TABLE abonos (
    id SERIAL PRIMARY KEY,
    numero_abono VARCHAR(50) UNIQUE NOT NULL,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    monto DECIMAL(10, 2) NOT NULL,
    fecha DATE NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    estado VARCHAR(20) DEFAULT 'Registrado',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: domicilios
-- ========================================
CREATE TABLE domicilios (
    id SERIAL PRIMARY KEY,
    numero_domicilio VARCHAR(50) UNIQUE NOT NULL,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    direccion TEXT NOT NULL,
    repartidor VARCHAR(100),
    fecha DATE NOT NULL,
    hora TIME,
    estado VARCHAR(20) DEFAULT 'Pendiente', -- Pendiente, En Camino, Entregado, Cancelado
    detalle TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: compras
-- ========================================
CREATE TABLE compras (
    id SERIAL PRIMARY KEY,
    numero_compra VARCHAR(50) UNIQUE NOT NULL,
    proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal DECIMAL(10, 2) DEFAULT 0,
    iva DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    observaciones TEXT,
    requiere_aprobacion BOOLEAN DEFAULT FALSE,
    aprobacion_extraordinaria BOOLEAN DEFAULT FALSE,
    motivo_aprobacion TEXT,
    estado VARCHAR(20) DEFAULT 'Pendiente', -- Pendiente, Recibida, Cancelada
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: detalle_compras
-- ========================================
CREATE TABLE detalle_compras (
    id SERIAL PRIMARY KEY,
    compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: insumos
-- ========================================
CREATE TABLE insumos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    cantidad DECIMAL(10, 2) DEFAULT 0,
    unidad VARCHAR(20) NOT NULL, -- Litros, Kilos, Unidades, etc.
    stock_minimo DECIMAL(10, 2) DEFAULT 10,
    estado VARCHAR(20) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: entregas_insumos
-- ========================================
CREATE TABLE entregas_insumos (
    id SERIAL PRIMARY KEY,
    numero_entrega VARCHAR(50) UNIQUE NOT NULL,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
    cantidad DECIMAL(10, 2) NOT NULL,
    unidad VARCHAR(20) NOT NULL,
    operario VARCHAR(100),
    fecha DATE NOT NULL,
    hora TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: produccion
-- ========================================
CREATE TABLE produccion (
    id SERIAL PRIMARY KEY,
    numero_produccion VARCHAR(50) UNIQUE NOT NULL,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    fecha DATE NOT NULL,
    responsable VARCHAR(100),
    tiempo_preparacion_minutos INTEGER DEFAULT 1 CHECK (tiempo_preparacion_minutos > 0),
    estado VARCHAR(30) DEFAULT 'Orden Recibida', -- Orden Recibida, Orden en preparacion, Orden Lista, Cancelada
    notes TEXT,
    insumos_gastados JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: usuarios
-- ========================================
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

-- ========================================
-- TABLAS AUXILIARES (AUDITORIA / SEGURIDAD)
-- ========================================
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

ALTER TABLE clientes
ADD CONSTRAINT fk_clientes_usuario
FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- ========================================
-- ÍNDICES PARA MEJORAR RENDIMIENTO
-- ========================================

-- Índices para roles
CREATE INDEX idx_roles_nombre ON roles(nombre);
CREATE INDEX idx_roles_estado ON roles(estado);

-- Índices para usuarios
CREATE INDEX idx_usuarios_documento ON usuarios(documento);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(rol_id);
CREATE INDEX idx_usuarios_estado ON usuarios(estado);
CREATE INDEX idx_usuarios_rol_estado ON usuarios(rol_id, estado);
CREATE UNIQUE INDEX idx_usuarios_email_unique_lower ON usuarios(LOWER(email));

-- Índices para auditoría y seguridad
CREATE INDEX idx_usuarios_sesiones_usuario_activa ON usuarios_sesiones(usuario_id, revoked_at, expires_at);
CREATE INDEX idx_usuarios_password_historial_usuario ON usuarios_password_historial(usuario_id, created_at DESC);
CREATE INDEX idx_usuarios_password_resets_usuario ON usuarios_password_resets(usuario_id, created_at DESC);
CREATE INDEX idx_usuarios_password_resets_token ON usuarios_password_resets(token_hash);
CREATE INDEX idx_usuarios_auditoria_usuario_fecha ON usuarios_auditoria(usuario_id, created_at DESC);
CREATE INDEX idx_proveedores_auditoria_proveedor_fecha ON proveedores_auditoria(proveedor_id, created_at DESC);
CREATE INDEX idx_roles_auditoria_rol_fecha ON roles_auditoria(rol_id, created_at DESC);
CREATE INDEX idx_compras_estado_historial_compra_fecha ON compras_estado_historial(compra_id, created_at DESC);

-- Índices para productos
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_estado ON productos(estado);
CREATE INDEX idx_productos_nombre ON productos(nombre);

-- Índices para clientes
CREATE INDEX idx_clientes_documento ON clientes(documento);
CREATE INDEX idx_clientes_estado ON clientes(estado);
CREATE INDEX idx_clientes_nombre ON clientes(nombre);
CREATE UNIQUE INDEX idx_clientes_email_unique ON clientes(LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_clientes_usuario_id_unique ON clientes(usuario_id) WHERE usuario_id IS NOT NULL;

-- Índices para pedidos
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_fecha ON pedidos(fecha DESC);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_cliente_fecha ON pedidos(cliente_id, fecha DESC);

-- Índices para ventas
CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_ventas_pedido ON ventas(pedido_id);
CREATE INDEX idx_ventas_fecha ON ventas(fecha DESC);
CREATE INDEX idx_ventas_cliente_fecha ON ventas(cliente_id, fecha DESC);

-- Índices para compras, insumos y producción
CREATE INDEX idx_compras_fecha ON compras(fecha DESC);
CREATE INDEX idx_compras_proveedor_fecha ON compras(proveedor_id, fecha DESC);
CREATE INDEX idx_insumos_nombre ON insumos(nombre);
CREATE INDEX idx_entregas_insumos_fecha ON entregas_insumos(fecha DESC);
CREATE INDEX idx_produccion_fecha ON produccion(fecha DESC);
CREATE INDEX idx_produccion_pedido ON produccion(pedido_id);

-- Índices para detalles
CREATE INDEX idx_detalle_pedidos_pedido ON detalle_pedidos(pedido_id);
CREATE INDEX idx_detalle_ventas_venta ON detalle_ventas(venta_id);
CREATE INDEX idx_detalle_compras_compra ON detalle_compras(compra_id);

-- Índices para abonos y domicilios
CREATE INDEX idx_abonos_pedido ON abonos(pedido_id);
CREATE INDEX idx_abonos_fecha ON abonos(fecha DESC);
CREATE INDEX idx_abonos_cliente_fecha ON abonos(cliente_id, fecha DESC);
CREATE INDEX idx_domicilios_pedido ON domicilios(pedido_id);
CREATE INDEX idx_domicilios_fecha ON domicilios(fecha DESC);
CREATE INDEX idx_domicilios_cliente_fecha ON domicilios(cliente_id, fecha DESC);

-- Índices para proveedores
CREATE INDEX idx_proveedores_nit ON proveedores(nit);
CREATE INDEX idx_proveedores_numero_documento ON proveedores(numero_documento);
CREATE INDEX idx_proveedores_email_lower ON proveedores(LOWER(COALESCE(email, '')));
CREATE INDEX idx_proveedores_telefono_digits ON proveedores((regexp_replace(COALESCE(telefono, ''), '\\D', '', 'g')));

-- ========================================
-- DATOS MINIMOS (PRUEBAS DESDE CERO)
-- Solo roles esenciales y usuarios: Administrador, Asesor, Repartidor (domiciliario), Cliente.
-- Categorias, productos, clientes demo, proveedores, pedidos, ventas, etc. se crean desde la aplicacion.
-- ========================================

INSERT INTO roles (nombre, descripcion, permisos, estado) VALUES
('Administrador', 'Acceso total al sistema',
 ARRAY['Ver Dashboard','Ver Usuarios','Crear Usuarios','Editar Usuarios','Eliminar Usuarios','Ver Roles','Asignar Permisos','Ver Proveedores','Crear Proveedores','Editar Proveedores','Ver Compras','Registrar Compras','Anular Compras','Ver Productos','Crear Productos','Editar Productos','Ver Categorías','Crear Categorías','Ver Insumos','Entregar Insumos','Ver Producción','Registrar Producción','Ver Clientes','Crear Clientes','Editar Clientes','Ver Ventas','Registrar Ventas','Anular Ventas','Ver Abonos','Registrar Abonos','Ver Pedidos','Crear Pedidos','Ver Domicilios','Gestionar Domicilios'],
 'Activo'),
('Asesor', 'Gestión de ventas y clientes',
 ARRAY['Ver Dashboard','Ver Clientes','Crear Clientes','Editar Clientes','Ver Ventas','Registrar Ventas','Ver Abonos','Registrar Abonos','Ver Pedidos','Crear Pedidos'],
 'Activo'),
('Repartidor', 'Gestión de domicilios',
 ARRAY['Ver Dashboard','Ver Domicilios','Gestionar Domicilios','Ver Pedidos'],
 'Activo'),
('Cliente', 'Acceso cliente',
 ARRAY['Ver Dashboard','Ver Tienda','Ver Mis Pedidos','Ver Mis Lista de Compras','Ver Mis Domicilios'],
 'Activo');

-- Mantener sincronizado el perfil cliente cuando se crea/edita un usuario Cliente.
-- Debe existir antes del INSERT de usuarios para que el usuario Cliente dispare la creación de clientes.
CREATE OR REPLACE FUNCTION sync_cliente_from_usuario()
RETURNS TRIGGER AS $$
DECLARE
    cliente_role_id INTEGER;
BEGIN
    SELECT id INTO cliente_role_id FROM roles WHERE nombre = 'Cliente' LIMIT 1;

    IF cliente_role_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.rol_id = cliente_role_id THEN
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

        IF NOT EXISTS (SELECT 1 FROM clientes WHERE usuario_id = NEW.id) THEN
            INSERT INTO clientes (
                usuario_id,
                nombre,
                apellido,
                tipo_documento,
                documento,
                telefono,
                email,
                direccion,
                estado
            ) VALUES (
                NEW.id,
                NEW.nombre,
                NEW.apellido,
                NEW.tipo_documento,
                NEW.documento,
                NEW.telefono,
                NEW.email,
                NEW.direccion,
                COALESCE(NEW.estado, 'Activo')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_cliente_from_usuario ON usuarios;

CREATE TRIGGER trg_sync_cliente_from_usuario
AFTER INSERT OR UPDATE OF rol_id, nombre, apellido, tipo_documento, documento, telefono, email, direccion, estado
ON usuarios
FOR EACH ROW
EXECUTE FUNCTION sync_cliente_from_usuario();

-- Contraseñas (bcrypt): admin123, asesor123, repartidor123, cliente123
INSERT INTO usuarios (nombre, apellido, tipo_documento, documento, direccion, email, telefono, password_hash, rol_id, estado) VALUES
('Carlos', 'Rodríguez', 'CC', '1010123456', 'Carrera 50 #20-30, Bogotá', 'admin@grandmas.com', '3001234567', '$2b$10$4GJ/dyScA5T.oe5YXNh7ROx56KVYDkdLmQNcOpOGz3v3Hw7/XCHny', 1, 'Activo'),
('María', 'González', 'CC', '1020234567', 'Calle 45 #12-15, Medellín', 'asesor@grandmas.com', '3009876543', '$2b$10$5tQd1StaI0uEPVpKh8pcNO6ERWJuZXVcA8qSVHY3w4cxKAkzs3Qz.', 2, 'Activo'),
('Pedro', 'López', 'CC', '1040456789', 'Calle 10 #5-10, Barranquilla', 'repartidor@grandmas.com', '3207654321', '$2b$10$xLA7gMJp3iyU2kAJQaE9auEcqCrtZXpH9t3Vv59IWvH8KACUReYDG', 3, 'Activo'),
('Ana', 'Pérez', 'CC', '1050567890', 'Carrera 7 #14-25, Bogotá', 'cliente@grandmas.com', '3156543210', '$2b$10$fqDuOAL0nDlyypAENBdxTeY/KDrg0k69JrjVSH8DIgJKyKkkWvh.K', 4, 'Activo');

-- ========================================
-- COMENTARIOS FINALES
-- ========================================

COMMENT ON TABLE roles IS 'Roles de usuarios del sistema';
COMMENT ON TABLE schema_migrations IS 'Historial de migraciones ejecutadas';
COMMENT ON TABLE usuarios IS 'Usuarios del sistema';
COMMENT ON TABLE categorias IS 'Categorías de productos de licores';
COMMENT ON TABLE productos IS 'Catálogo de productos disponibles';
COMMENT ON TABLE clientes IS 'Registro de clientes';
COMMENT ON TABLE proveedores IS 'Registro de proveedores';
COMMENT ON TABLE pedidos IS 'Pedidos realizados por clientes';
COMMENT ON TABLE ventas IS 'Ventas completadas';
COMMENT ON TABLE abonos IS 'Abonos realizados a pedidos';
COMMENT ON TABLE domicilios IS 'Entregas a domicilio';
COMMENT ON TABLE compras IS 'Compras realizadas a proveedores';
COMMENT ON TABLE insumos IS 'Insumos para producción';
COMMENT ON TABLE produccion IS 'Registro de producción de licores';

-- Fin del script