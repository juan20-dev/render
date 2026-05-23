const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('./config');

async function main() {
  const password =
    typeof config.db.password === 'string'
      ? config.db.password
      : String(config.db.password || '');
  const database = config.db.database || process.env.DB_NAME || 'grandmas_liquors';

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

  const sqlPath = path.join(__dirname, 'db_data.pgsql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`No existe: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await client.query('SET statement_timeout = 0');
    console.log('Ejecutando db_data.pgsql (DROP, DDL, triggers, índices y seed)…');
    await client.query(sql);
    console.log('\n✅ db_data.pgsql aplicado correctamente.');
  } catch (err) {
    console.error('\n❌ Error al ejecutar db_data.pgsql:', err.message);
    if (err.position) console.error('Posición SQL aproximada:', err.position);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
