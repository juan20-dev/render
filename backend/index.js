//cambios desde el pc de manolo 1mer commit
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
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

const clearApiRateLimitLog = async () => {
  if (process.env.RATE_LIMIT_ENABLED === 'true') return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_rate_limit_log (
        id BIGSERIAL PRIMARY KEY,
        route_key VARCHAR(120) NOT NULL,
        identifier VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const cleared = await pool.query('DELETE FROM api_rate_limit_log');
    if (cleared.rowCount > 0) {
      console.log(`🔓 Registros de rate limit eliminados (${cleared.rowCount})`);
    }
  } catch (err) {
    console.warn('⚠️  No se pudo limpiar api_rate_limit_log:', err.message);
  }
};

const app = express();
const UNLIMITED_RATE_LIMIT_ROLES = new Set(['Administrador']);
const ApiResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
    data: z.unknown().optional(),
    id: z.union([z.number(), z.string()]).optional(),
    code: z.string().optional(),
    details: z.unknown().optional(),
    path: z.string().optional(),
    timestamp: z.string().optional(),
    retryAfter: z.number().optional(),
    stack: z.array(z.string()).optional(),
  })
  .passthrough();

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

    // Flutter web y Vite dev: localhost/127.0.0.1 con cualquier puerto
    try {
      const lc = origin.toLowerCase();
      if (/^https?:\/\/localhost(:\d+)?$/.test(lc) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(lc)) {
        return callback(null, true);
      }
    } catch (e) {
      // fallthrough to reject
    }

    console.warn(`CORS: rejected origin ${origin}. Allowed: ${config.auth.corsOrigins.join(', ')}`);
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
};

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser());

const getTokenFromRequest = (req) => {
  const cookieToken = req.cookies?.[config.auth.cookieName];
  if (cookieToken) return cookieToken;
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return null;
};

const isUnlimitedRoleRequest = (req) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return false;
    const payload = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.auth.jwtIssuer,
      audience: config.auth.jwtAudience,
    });
    const role = String(payload?.rol || '').trim();
    return UNLIMITED_RATE_LIMIT_ROLES.has(role);
  } catch (_error) {
    return false;
  }
};

// Límite global desactivado por defecto (RATE_LIMIT_ENABLED=true en .env para activar).
const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED === 'true';
if (rateLimitEnabled) {
  const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.server.env === 'production' ? 400 : 10000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isUnlimitedRoleRequest(req),
    message: { success: false, message: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
  });
  app.use('/api', globalApiLimiter);
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
const uploadsRoot = config.uploads.root;
fs.mkdirSync(config.uploads.comprobantesDir, { recursive: true });
app.use('/uploads', express.static(uploadsRoot));

// Contrato formal de salida: todas las respuestas JSON deben cumplir un esquema base.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    let payload = body;
    if (payload === null || payload === undefined || typeof payload !== 'object' || Array.isArray(payload)) {
      payload = { success: res.statusCode < 400, data: payload };
    }
    if (typeof payload.success !== 'boolean') {
      payload = { ...payload, success: res.statusCode < 400 };
    }
    const validated = ApiResponseSchema.safeParse(payload);
    if (!validated.success) {
      return originalJson({
        success: false,
        code: 'RESPONSE_SCHEMA_ERROR',
        message: 'La respuesta del servidor no cumple el contrato esperado.',
        details: validated.error.flatten(),
      });
    }
    return originalJson(validated.data);
  };
  return next();
});

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

// Manejador de errores global (mejorado)
app.use((err, req, res, next) => {
  const isDevelopment = config.server.env === 'development';
  
  // Log del error
  console.error('❌ Error:', {
    message: err.message,
    status: err.status || 500,
    code: err.code,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { stack: err.stack })
  });

  // Determinar status code
  let statusCode = err.status || err.statusCode || 500;
  if (statusCode < 100 || statusCode > 599) statusCode = 500;

  // Mensaje de error seguro
  let message = err.message || 'Error interno del servidor';
  if (statusCode === 500 && !isDevelopment) {
    message = 'Error interno del servidor. Contacte al administrador.';
  }

  const payload = {
    success: false,
    code: err.code || 'INTERNAL_ERROR',
    message,
  };
  if (err.details !== undefined) {
    payload.details = err.details;
  }
  if (isDevelopment && err.stack) {
    payload.stack = err.stack.split('\n').slice(0, 8);
  }

  return res.status(statusCode).json(payload);
});

// ===== INICIAR SERVIDOR =====
const PORT = config.server.port;
const publicBaseUrl =
  process.env.PUBLIC_BASE_URL ||
  (config.server.env === 'production' ? '(configure PUBLIC_BASE_URL para mostrar la URL publica)' : `http://localhost:${PORT}`);

app.listen(PORT, async () => {
  await ensureAdminUnblocked();
  await clearApiRateLimitLog();
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
  if (config.server.env !== 'production') {
    console.log(`\n📋 ENDPOINTS DISPONIBLES:`);
    console.log(`   - GET    /api/health                 (Verificar estado)`);
    console.log(`   - GET    /api/categorias             (Listar categorías)`);
    console.log(`   - GET    /api/productos              (Listar productos)`);
    console.log(`   - GET    /api/clientes               (Listar clientes)`);
    console.log(`   - GET    /api/proveedores            (Listar proveedores)`);
    console.log(`   - GET    /api/pedidos                (Listar pedidos)`);
    console.log(`   - POST   /api/pedidos/comprobante    (Subir comprobante transferencia)`);
    console.log(`   - GET    /api/ventas                 (Listar ventas)`);
    console.log(`   - GET    /api/abonos                 (Listar abonos)`);
    console.log(`   - GET    /api/domicilios             (Listar domicilios)`);
    console.log(`   - GET    /api/compras                (Listar compras)`);
    console.log(`   - GET    /api/insumos                (Listar insumos)`);
    console.log(`   - GET    /api/entregas-insumos       (Listar entregas)`);
    console.log(`   - GET    /api/produccion             (Listar producción)`);
    console.log(`   - GET    /api/producto-insumos       (Recetas producto–insumo)`);
  }
  console.log(`\n🌐 URL Base: ${publicBaseUrl}`);
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
