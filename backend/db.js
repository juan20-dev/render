const { Pool } = require('pg');
const config = require('./config');

const dbPassword =
  typeof config.db.password === 'string' ? config.db.password : String(config.db.password || '');

// Crear el pool de conexiones a la base de datos PostgreSQL
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: dbPassword,
  database: config.db.database,
  ssl: config.db.ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Manejo de errores inesperados en clientes inactivos del pool para evitar caídas del servidor
pool.on('error', (err) => {
  console.error('⚠️ Error inesperado en un cliente inactivo de la base de datos:', err.message);
});

// Verificar conexión a la base de datos
pool.connect()
  .then((client) => {
    console.log('✓ Conexión a Base de Datos PostgreSQL exitosa');
    client.release();
  })
  .catch((error) => {
    console.error('✗ Error al conectar a la Base de Datos:', error.message);
    process.exit(1);
  });

module.exports = pool;
