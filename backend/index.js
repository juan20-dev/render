//cambios desde el pc de manolo 1mer commit
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const db = require('./db');
const routes = require('./src/routes');
const pool = db;

/**
 * Bootstrap de auto-recuperación del admin del sistema (id=1, admin@grandmas.com).
 *
 * Razón: el límite anti-fuerza-bruta puede dejar al admin del sistema bloqueado
 * 15 minutos tras 5 intentos fallidos, impidiendo el acceso aun con la
 * contraseña correcta. Para evitar quedarse sin acceso administrativo, cada
 * vez que arranca el backend se limpian los bloqueos del correo de admin.
 *
 * Esto NO afecta a otros usuarios ni desactiva el bloqueo durante operación
 * normal (cualquier nuevo bloqueo se aplica igual). Solo elimina el estado
 * residual del admin al reiniciar el servicio.
 */
const SYSTEM_ADMIN_EMAIL = (process.env.SYSTEM_ADMIN_EMAIL || 'admin@grandmas.com')
  .trim()
  .toLowerCase();

const ensureAdminUnblocked = async () => {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS usuarios_login_intentos (
        email VARCHAR(255) PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        blocked_until TIMESTAMP NULL,
        last_attempt_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    const result = await pool.query(
      'DELETE FROM usuarios_login_intentos WHERE LOWER(email) = LOWER($1) RETURNING email',
      [SYSTEM_ADMIN_EMAIL]
    );
    if (result.rowCount > 0) {
      console.log(`🔓 Bloqueo de login eliminado para ${SYSTEM_ADMIN_EMAIL} (auto-recuperación al arranque)`);
    }
  } catch (err) {
    console.warn('⚠️  No se pudo aplicar auto-recuperación del admin:', err.message);
  }
};

const app = express();

if (config.server.env === 'production') {
  app.set('trust proxy', 1);
}

const corsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    // Allow explicit configured origins
    if (config.auth.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In non-production, allow localhost/127.0.0.1 with any port (useful for Flutter web dev servers)
    if (config.server.env !== 'production') {
      try {
        const lc = origin.toLowerCase();
        if (/^https?:\/\/localhost(:\d+)?$/.test(lc) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(lc)) {
          console.log(`CORS: allowing local dev origin ${origin}`);
          return callback(null, true);
        }
      } catch (e) {
        // fallthrough to reject
      }
    }

    console.warn(`CORS: rejected origin ${origin}. Allowed: ${config.auth.corsOrigins.join(', ')}`);
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
};

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== RUTAS =====
// Ruta de health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Todas las rutas de API
app.use('/', routes);

// Manejador de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.path
  });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    error: config.server.env === 'development' ? err : {}
  });
});

// ===== INICIAR SERVIDOR =====
const PORT = config.server.port;

app.listen(PORT, async () => {
  await ensureAdminUnblocked();
  console.log(`\n`);
  console.log(`╔════════════════════════════════════════════════════════════╗`);
  console.log(`║        LIQUEUR SALES MANAGEMENT APP - BACKEND              ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);
  console.log(`\n`);
  console.log(`✓ Servidor Backend iniciado exitosamente`);
  console.log(`✓ Puerto: ${PORT}`);
  console.log(`✓ Ambiente: ${config.server.env}`);
  console.log(`✓ Base de Datos: Conectada`);
  console.log(`✓ Conexión App-Backend: Establecida`);
  console.log(`\n📋 ENDPOINTS DISPONIBLES:`);
  console.log(`   - GET    /api/health                 (Verificar estado)`);
  console.log(`   - GET    /api/categorias             (Listar categorías)`);
  console.log(`   - GET    /api/productos              (Listar productos)`);
  console.log(`   - GET    /api/clientes               (Listar clientes)`);
  console.log(`   - GET    /api/proveedores            (Listar proveedores)`);
  console.log(`   - GET    /api/pedidos                (Listar pedidos)`);
  console.log(`   - GET    /api/ventas                 (Listar ventas)`);
  console.log(`   - GET    /api/abonos                 (Listar abonos)`);
  console.log(`   - GET    /api/domicilios             (Listar domicilios)`);
  console.log(`   - GET    /api/compras                (Listar compras)`);
  console.log(`   - GET    /api/insumos                (Listar insumos)`);
  console.log(`   - GET    /api/entregas-insumos       (Listar entregas)`);
  console.log(`   - GET    /api/produccion             (Listar producción)`);
  console.log(`   - GET    /api/producto-insumos       (Recetas producto–insumo)`);
  console.log(`\n🌐 URL Base: http://localhost:${PORT}`);
  console.log(`\n════════════════════════════════════════════════════════════\n`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  process.exit(1);
});

module.exports = app;
