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
  : ['http://localhost:3000'];

const configuredCorsOrigins = parseCsv(process.env.CORS_ORIGINS);

const config = {
  db: {
    host: process.env.DB_HOST ,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER ,
    password: process.env.DB_PASSWORD ,
    database: process.env.DB_DATABASE,
  },
  server: {
    port: process.env.PORT || 3002,
    env: process.env.NODE_ENV || 'development',
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
    from: process.env.MAIL_FROM || process.env.MAIL_USER || 'no-reply@grandmas-liquors.local',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ,
  },
};

module.exports = config;
