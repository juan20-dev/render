const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Configurar conexión a PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || "grandma'sdb",
});

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando migraciones de base de datos...\n');

    // Leer y ejecutar schema inicial
    const schemaPath = path.join(__dirname, 'db.pgsql');
    if (fs.existsSync(schemaPath)) {
      console.log('📋 Ejecutando schema inicial (db.pgsql)...');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schema);
      console.log('✓ Schema inicial completado\n');
    }

    // Ejecutar migraciones en orden
    const migrationsDir = path.join(__dirname, 'historias-migraciones');
    const migrationFiles = [
      '015_add_pedido_tiempo_insumos_to_produccion.sql',
      '016_add_positive_constraints_to_produccion.sql',
      '018_cliente_role_permisos_tienda.sql'
    ];

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`📋 Ejecutando migración: ${file}...`);
        const migration = fs.readFileSync(filePath, 'utf8');
        await client.query(migration);
        console.log(`✓ ${file} completada\n`);
      } else {
        console.warn(`⚠️  Archivo de migración no encontrado: ${file}\n`);
      }
    }

    // Ejecutar ALTERs de sincronización para DB existentes
    console.log('🔧 Aplicando alteraciones de sincronización (si aplican)...');
    try {
      await client.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS monto_abonado DECIMAL(18,2) DEFAULT 0`);
      // Asegurar tipos numéricos amplios en tablas críticas (silencioso si no aplica)
      try {
        await client.query(`ALTER TABLE ventas ALTER COLUMN total TYPE NUMERIC(18,2)`);
      } catch (_) {
        // ignore
      }
      try {
        await client.query(`ALTER TABLE detalle_ventas ALTER COLUMN precio_unitario TYPE NUMERIC(18,2)`);
        await client.query(`ALTER TABLE detalle_ventas ALTER COLUMN subtotal TYPE NUMERIC(18,2)`);
      } catch (_) {
        // ignore
      }
      try {
        await client.query(`ALTER TABLE detalle_pedidos ALTER COLUMN precio_unitario TYPE NUMERIC(18,2)`);
        await client.query(`ALTER TABLE detalle_pedidos ALTER COLUMN subtotal TYPE NUMERIC(18,2)`);
      } catch (_) {
        // ignore
      }
      // Asegurar que roles.nombre respete límite 3-50 caracteres en bases existentes.
      try {
        await client.query(`ALTER TABLE roles ALTER COLUMN nombre TYPE VARCHAR(50)`);
      } catch (_) {
        // ignore (puede que ya sea VARCHAR(50) o que existan datos > 50 caracteres)
      }
      try {
        await client.query(`ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_nombre_length_check`);
        await client.query(`
          ALTER TABLE roles
          ADD CONSTRAINT roles_nombre_length_check
          CHECK (char_length(trim(nombre)) BETWEEN 3 AND 50)
        `);
      } catch (err) {
        console.warn('⚠️  No se pudo aplicar constraint de longitud de nombre de rol:', err.message);
      }

      // Garantizar tablas de auditoría de productos / categorías / clientes en BDs existentes.
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS productos_auditoria (
            id SERIAL PRIMARY KEY,
            producto_id INTEGER,
            accion VARCHAR(20) NOT NULL,
            usuario_id INTEGER,
            cambios JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS categorias_auditoria (
            id SERIAL PRIMARY KEY,
            categoria_id INTEGER,
            accion VARCHAR(20) NOT NULL,
            usuario_id INTEGER,
            cambios JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS clientes_auditoria (
            id SERIAL PRIMARY KEY,
            cliente_id INTEGER,
            accion VARCHAR(20) NOT NULL,
            usuario_id INTEGER,
            cambios JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch (err) {
        console.warn('⚠️  No se pudieron crear tablas de auditoría:', err.message);
      }
      console.log('✓ Alteraciones aplicadas (si fueron necesarias)\n');
    } catch (err) {
      console.warn('⚠️  Error al aplicar alteraciones de sincronización:', err.message);
    }

    console.log('✅ ¡Todas las migraciones completadas exitosamente!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante las migraciones:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
