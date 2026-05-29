/*
 * Script de migracion idempotente para Grandma's Liquors.
 *
 * Que hace:
 *   1. Verifica conectividad con PostgreSQL y avisa de forma clara si la base
 *      de datos no existe o las credenciales son erroneas (evita el "exit 1"
 *      sin contexto que confundia a quien clona por primera vez).
 *   2. Si no existe el esquema de la app (tabla `roles`), ejecuta `db.pgsql`.
 *      Si ya existe el esquema completo, omite `db.pgsql` (evita DROP + CREATE).
 *      Use `npm run migrate -- --bootstrap` para forzar db.pgsql (borra datos del proyecto).
 *   3. Aplica ALTERs de sincronizacion idempotentes para bases preexistentes
 *      que pudieran venir de versiones anteriores (IF NOT EXISTS / IF EXISTS).
 *
 * Uso:
 *   - Desde la carpeta `backend/`: `npm run migrate`
 *   - Variables de entorno usadas: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
 *     DB_DATABASE (todas tomadas del entorno actual/config.js).
 *   - IMPORTANTE: la base de datos debe existir antes de correr este script.
 *     Si no existe, se imprime el comando exacto para crearla.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

const dbPassword =
  typeof config.db.password === 'string'
    ? config.db.password
    : String(config.db.password || '');

const dbConfig = {
  host: config.db.host || 'localhost',
  port: config.db.port || 5432,
  user: config.db.user || 'postgres',
  password: dbPassword || 'password',
  database: config.db.database || 'grandmasliquorsdb',
  ssl: config.db.ssl,
};

const pool = new Pool(dbConfig);

/** Tabla mínima que indica que db.pgsql ya se aplicó en esta base. */
const APP_SCHEMA_MARKER_TABLE = 'roles';

const parseArgs = () => ({
  bootstrap: process.argv.slice(2).includes('--bootstrap') || process.argv.slice(2).includes('--schema'),
});

async function hasAppSchema(client) {
  const r = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS ok`,
    [APP_SCHEMA_MARKER_TABLE]
  );
  return Boolean(r.rows[0]?.ok);
}

const printConnectionHelp = (error) => {
  const code = error?.code || '';
  console.error('');
  console.error('No fue posible conectar a la base de datos:');
  console.error(`  host=${dbConfig.host}  port=${dbConfig.port}  database=${dbConfig.database}  user=${dbConfig.user}`);
  console.error(`  motivo: ${error?.message || error}`);
  console.error('');

  if (code === '3D000' || /database .* does not exist/i.test(error?.message || '')) {
    console.error('La base de datos no existe. Crearla primero (PostgreSQL):');
    console.error(`  createdb -U ${dbConfig.user} -h ${dbConfig.host} -p ${dbConfig.port} "${dbConfig.database}"`);
    console.error('  o desde psql:');
    console.error(`  CREATE DATABASE "${dbConfig.database}";`);
  } else if (code === '28P01' || /password authentication failed/i.test(error?.message || '')) {
    console.error('Credenciales invalidas. Revisa DB_USER y DB_PASSWORD en backend/.env');
  } else if (code === 'ECONNREFUSED') {
    console.error('PostgreSQL no responde en el host:puerto indicado. Asegurate de que el servicio este iniciado.');
  } else {
    console.error('Revisa que PostgreSQL este iniciado y que las variables DB_* en backend/.env sean correctas.');
  }
  console.error('');
};

async function runMigrations() {
  const opts = parseArgs();
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    printConnectionHelp(error);
    process.exit(1);
  }

  try {
    console.log('Iniciando migraciones de base de datos...\n');
    console.log(`  base: ${dbConfig.database} @ ${dbConfig.host}\n`);

    // 1) Esquema completo desde db.pgsql (tablas, datos semilla, triggers).
    const schemaPath = path.join(__dirname, 'db.pgsql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error('No se encontro backend/db.pgsql. Verifica que clonaste el repositorio completo.');
    }

    const schemaPresent = await hasAppSchema(client);
    const shouldRunDbPgsql = opts.bootstrap || !schemaPresent;

    if (shouldRunDbPgsql) {
      if (schemaPresent && opts.bootstrap) {
        console.log('-> --bootstrap: ejecutando db.pgsql (elimina y recrea tablas del proyecto)...\n');
      } else if (!schemaPresent) {
        console.log(
          `-> No existe la tabla «${APP_SCHEMA_MARKER_TABLE}». Ejecutando esquema completo (db.pgsql)...\n`
        );
      }
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schema);
      console.log('   OK db.pgsql aplicado (estructura + datos iniciales)\n');
    } else {
      console.log(
        '-> Esquema de la app ya presente. Se omite db.pgsql; solo ALTERs de sincronizacion.\n'
      );
    }

    // 2) ALTERs idempotentes de sincronizacion para bases preexistentes que
    //    pudieran venir de versiones anteriores. En una BD recien creada con
    //    db.pgsql todos estos cambios ya estan aplicados, asi que no hacen
    //    nada (IF NOT EXISTS / IF EXISTS).
    console.log('-> Aplicando alteraciones de sincronizacion (idempotentes)...');
    try {
      await client.query(
        `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS monto_abonado DECIMAL(18,2) DEFAULT 0`
      );
      try {
        await client.query(`ALTER TABLE ventas ALTER COLUMN total TYPE NUMERIC(18,2)`);
      } catch (_) { /* ya estaba */ }
      try {
        await client.query(`ALTER TABLE detalle_ventas ALTER COLUMN precio_unitario TYPE NUMERIC(18,2)`);
        await client.query(`ALTER TABLE detalle_ventas ALTER COLUMN subtotal TYPE NUMERIC(18,2)`);
      } catch (_) { /* ya estaba */ }
      try {
        await client.query(`ALTER TABLE detalle_pedidos ALTER COLUMN precio_unitario TYPE NUMERIC(18,2)`);
        await client.query(`ALTER TABLE detalle_pedidos ALTER COLUMN subtotal TYPE NUMERIC(18,2)`);
      } catch (_) { /* ya estaba */ }
      try {
        await client.query(`ALTER TABLE roles ALTER COLUMN nombre TYPE VARCHAR(50)`);
      } catch (_) { /* ya estaba o hay datos > 50 caracteres */ }
      try {
        await client.query(`ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_nombre_length_check`);
        await client.query(`
          ALTER TABLE roles
          ADD CONSTRAINT roles_nombre_length_check
          CHECK (char_length(trim(nombre)) BETWEEN 3 AND 50)
        `);
      } catch (err) {
        console.warn('   (aviso) no se pudo aplicar constraint roles_nombre_length_check:', err.message);
      }

      // Tablas de auditoria: por seguridad las creamos si no existen (en BDs
      // muy antiguas que no las tenian).
      const auditTables = [
        ['productos_auditoria', 'producto_id'],
        ['categorias_auditoria', 'categoria_id'],
        ['clientes_auditoria', 'cliente_id'],
      ];
      for (const [table, fkColumn] of auditTables) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${table} (
            id SERIAL PRIMARY KEY,
            ${fkColumn} INTEGER,
            accion VARCHAR(20) NOT NULL,
            usuario_id INTEGER,
            cambios JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }

      await client.query(`
        UPDATE productos
           SET stock = 0
         WHERE COALESCE(tipo_producto, 'terminado') = 'preparacion'
           AND COALESCE(stock, 0) <> 0
      `);
      await client.query(`
        ALTER TABLE productos
        DROP CONSTRAINT IF EXISTS productos_preparacion_stock_cero_chk
      `);
      await client.query(`
        ALTER TABLE productos
        ADD CONSTRAINT productos_preparacion_stock_cero_chk
        CHECK (tipo_producto <> 'preparacion' OR COALESCE(stock, 0) = 0)
      `);

      const productSeedImages = [
        ['Whisky Andino 750ml', '/uploads/productos/seed_01.webp'],
        ['Whisky Reserva Roble 750ml', '/uploads/productos/seed_02.webp'],
        ['Ron Caribe Dorado 750ml', '/uploads/productos/seed_03.webp'],
        ['Ron Anejo Gran Barrica 750ml', '/uploads/productos/seed_04.webp'],
        ['Vino Tinto Casa Vieja 750ml', '/uploads/productos/seed_05.webp'],
        ['Vino Blanco Monteluna 750ml', '/uploads/productos/seed_06.webp'],
        ['Espumoso Brisa Rosa 750ml', '/uploads/productos/seed_07.webp'],
        ['Cerveza Rubia Artesanal 330ml', '/uploads/productos/seed_08.webp'],
        ['Cerveza Roja Artesanal 330ml', '/uploads/productos/seed_09.webp'],
        ['Cerveza Negra Porter 330ml', '/uploads/productos/seed_10.webp'],
        ['Tequila Agave Azul 750ml', '/uploads/productos/seed_11.webp'],
        ['Tequila Reposado Sierra 750ml', '/uploads/productos/seed_12.webp'],
        ['Vodka Cristal 700ml', '/uploads/productos/seed_13.webp'],
        ['Vodka Citrus 700ml', '/uploads/productos/seed_14.webp'],
        ['Crema de Cafe 700ml', '/uploads/productos/seed_15.webp'],
        ['Crema de Coco 700ml', '/uploads/productos/seed_16.webp'],
        ['Ginebra Botanica 750ml', '/uploads/productos/seed_17.webp'],
        ['Ginebra Limonaria 750ml', '/uploads/productos/seed_18.webp'],
        ['Aguardiente Tradicion 750ml', '/uploads/productos/seed_19.webp'],
        ['Aguardiente Sin Azucar 750ml', '/uploads/productos/seed_20.webp'],
        ['Base de Limoncello', '/uploads/productos/seed_21.webp'],
        ['Base de Crema Irlandesa', '/uploads/productos/seed_22.webp'],
        ['Macerado de Frutos Rojos', '/uploads/productos/seed_23.webp'],
        ['Macerado de Cafe', '/uploads/productos/seed_24.webp'],
        ['Preparacion Pina Colada', '/uploads/productos/seed_25.webp'],
        ['Preparacion Mojito Artesanal', '/uploads/productos/seed_26.webp'],
        ['Preparacion Maracuya', '/uploads/productos/seed_27.webp'],
        ['Preparacion Naranja Especiada', '/uploads/productos/seed_28.webp'],
        ['Preparacion Hierbabuena', '/uploads/productos/seed_29.webp'],
        ['Preparacion Canelazo', '/uploads/productos/seed_30.webp'],
        ['Preparacion Crema de Whisky', '/uploads/productos/seed_31.webp'],
        ['Preparacion Licor de Coco', '/uploads/productos/seed_32.webp'],
        ['Preparacion Tamarindo', '/uploads/productos/seed_33.webp'],
        ['Preparacion Jamaica', '/uploads/productos/seed_34.webp'],
        ['Preparacion Frambuesa', '/uploads/productos/seed_35.webp'],
        ['Alcohol Etilico Food Grade', '/uploads/productos/seed_36.webp'],
        ['Azucar Refinada x 25kg', '/uploads/productos/seed_37.webp'],
        ['Botella Transparente 750ml', '/uploads/productos/seed_38.webp'],
        ['Tapa Rosca Dorada', '/uploads/productos/seed_39.webp'],
        ['Etiqueta Premium', '/uploads/productos/seed_40.webp'],
        ['Esencia de Vainilla x 1L', '/uploads/productos/seed_41.webp'],
        ['Pulpa de Mora x 5kg', '/uploads/productos/seed_42.webp'],
        ['Pulpa de Maracuya x 5kg', '/uploads/productos/seed_43.webp'],
        ['Jarabe Simple x 5L', '/uploads/productos/seed_44.webp'],
        ['Glicerina Alimentaria x 1L', '/uploads/productos/seed_45.webp'],
      ];
      for (const [nombre, imagenUrl] of productSeedImages) {
        await client.query(
          `UPDATE productos
              SET imagen_url = $2
            WHERE nombre = $1
              AND (imagen_url IS NULL OR TRIM(imagen_url) = '' OR imagen_url LIKE 'https://%')`,
          [nombre, imagenUrl]
        );
      }

      console.log('   OK alteraciones aplicadas\n');
    } catch (err) {
      console.warn('   (aviso) error al aplicar alteraciones de sincronizacion:', err.message);
    }

    console.log('Todas las migraciones completadas exitosamente.');
    process.exit(0);
  } catch (error) {
    console.error('Error durante las migraciones:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runMigrations();
