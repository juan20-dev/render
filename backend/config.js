const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env') });

const parseCsv = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET es obligatorio en produccion');
}

const defaultCorsOrigins = isProduction
  ? []
  : ['http://localhost:3000', 'http://localhost:8080'];

const configuredCorsOrigins = parseCsv(process.env.CORS_ORIGINS);

/** SSL para PostgreSQL: obligatorio en RDS; opcional en localhost. DB_SSL=true|false fuerza el valor. */
const resolveDbSsl = (host) => {
  const flag = String(process.env.DB_SSL || '').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  if (flag === 'true' || flag === '1' || flag === 'yes') {
    return { rejectUnauthorized: false };
  }
  if (String(host || '').includes('rds.amazonaws.com')) {
    return { rejectUnauthorized: false };
  }
  return false;
};

const dbHost = process.env.DB_HOST || 'localhost';

/** Raíz de archivos subidos (comprobantes, productos, perfiles). En EB puede fijarse con UPLOADS_ROOT. */
const uploadsRoot = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.join(__dirname, 'uploads');

const config = {
  db: {
    host: dbHost,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: resolveDbSsl(dbHost),
  },
  server: {
    port: process.env.PORT || 3002,
    env: process.env.NODE_ENV || 'development',
    publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').trim(),
  },
  uploads: {
    root: uploadsRoot,
    comprobantesDir: path.join(uploadsRoot, 'comprobantes'),
    perfilesDir: path.join(uploadsRoot, 'perfiles'),
    productosDir: path.join(uploadsRoot, 'productos'),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'dev_only_change_me'),
    jwtIssuer: process.env.JWT_ISSUER || 'grandmas-liquors-api',
    jwtAudience: process.env.JWT_AUDIENCE || 'grandmas-liquors-web',
    cookieName: process.env.AUTH_COOKIE_NAME || 'gl_session',
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || 'lax',
    cookieSecure: isProduction,
    // Sesión JWT rol Cliente: por defecto 30 min (sobreescribible con JWT_CLIENTE_TTL_MS).
    clienteTokenTtlMs: parseInt(process.env.JWT_CLIENTE_TTL_MS || `${30 * 60 * 1000}`, 10),
    staffTokenTtlMs: parseInt(process.env.JWT_STAFF_TTL_MS || `${3 * 60 * 60 * 1000}`, 10),
    longSessionTtlMs: parseInt(process.env.JWT_LONG_SESSION_TTL_MS || `${7 * 24 * 60 * 60 * 1000}`, 10),
    idleTimeoutMs: parseInt(process.env.SESSION_IDLE_TIMEOUT_MS || `${30 * 60 * 1000}`, 10),
    corsOrigins: configuredCorsOrigins.length > 0 ? configuredCorsOrigins : defaultCorsOrigins,
  },
  mail: {
    host: process.env.MAIL_HOST || '',
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    secure: String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.MAIL_USER || '',
    password: process.env.MAIL_PASSWORD || '',
    from: (() => {
      const user = String(process.env.MAIL_USER || '').trim();
      let from = String(process.env.MAIL_FROM || '').trim();
      if ((from.startsWith('"') && from.endsWith('"')) || (from.startsWith("'") && from.endsWith("'"))) {
        from = from.slice(1, -1).trim();
      }
      if (!from || (from.includes("'") && !from.includes('<')) || from.length < 5) {
        return user || 'no-reply@grandmas-liquors.local';
      }
      return from;
    })(),
  },
};

module.exports = config;
