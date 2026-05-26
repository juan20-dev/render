const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('./config');

async function main() {
  const password =
    typeof config.db.password === 'string'
      ? config.db.password
      : String(config.db.password || '');
  const database = config.db.database || process.env.DB_NAME || 'grandmasliquorsdb';

  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password,
    database,
    ssl: config.db.ssl,
    connectionTimeoutMillis: 30000,
  });

  await client.connect();
  console.log(`Conectado a «${database}» en ${config.db.host}:${config.db.port}\n`);

  const candidatePaths = ['db_data.pgsql', 'db.pgsql'].map((fileName) => path.join(__dirname, fileName));
  const sqlPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!sqlPath) {
    console.error(`No existe ningún script SQL en: ${candidatePaths.join(', ')}`);
    process.exit(1);
  }

  const sqlFileName = path.basename(sqlPath);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await client.query('SET statement_timeout = 0');

    if (sqlFileName === 'db.pgsql') {
      const tableCheck = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'`
      );
      const existingTables = Number(tableCheck.rows[0]?.total || 0);
      if (existingTables > 0) {
        throw new Error(
          'Se detectó una base con tablas existentes y el único script disponible es db.pgsql, que recrea toda la base. ' +
          'Use run-migrations.js para actualizar una base existente o agregue db_data.pgsql si necesita una carga puntual.'
        );
      }
      console.warn('db_data.pgsql no existe. Se usará db.pgsql solo porque la base está vacía.');
    }

    console.log(`Ejecutando ${sqlFileName}...`);
    await client.query(sql);
    console.log(`\n✅ ${sqlFileName} aplicado correctamente.`);
  } catch (err) {
    console.error(`\n❌ Error al ejecutar ${sqlFileName}:`, err.message);
    if (err.position) console.error('Posición SQL aproximada:', err.position);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
