const jwt = require('jsonwebtoken');
const config = require('../../config');
const pool = require('../../db');

// ============================================================
// VALIDADORES CENTRALIZADOS DE ENTRADA
// ============================================================

const validators = {
  email: (value) => {
    const email = String(value || '').trim().toLowerCase();
    if (!email) return { valid: false, error: 'El correo es obligatorio' };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return { valid: false, error: 'El correo no es válido' };
    return { valid: true, value: email };
  },

  password: (value) => {
    const password = String(value || '').trim();
    if (!password) return { valid: false, error: 'La contraseña es obligatoria' };
    if (password.length < 6) return { valid: false, error: 'La contraseña debe tener al menos 6 caracteres' };
    return { valid: true, value: password };
  },

  string: (value, fieldName = 'Campo', minLength = 1, maxLength = 500) => {
    const str = String(value || '').trim();
    if (minLength > 0 && str.length < minLength) {
      return { valid: false, error: `${fieldName} debe tener al menos ${minLength} caracteres` };
    }
    if (str.length > maxLength) {
      return { valid: false, error: `${fieldName} no puede exceder ${maxLength} caracteres` };
    }
    return { valid: true, value: str };
  },

  integer: (value, fieldName = 'Campo', min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return { valid: false, error: `${fieldName} debe ser un número entero` };
    if (num < min || num > max) {
      return { valid: false, error: `${fieldName} debe estar entre ${min} y ${max}` };
    }
    return { valid: true, value: num };
  },

  array: (value, fieldName = 'Campo', minItems = 0, maxItems = 1000) => {
    if (!Array.isArray(value)) return { valid: false, error: `${fieldName} debe ser un array` };
    if (value.length < minItems) {
      return { valid: false, error: `${fieldName} debe tener al menos ${minItems} elementos` };
    }
    if (value.length > maxItems) {
      return { valid: false, error: `${fieldName} no puede exceder ${maxItems} elementos` };
    }
    return { valid: true, value };
  },

  sanitize: (value) => {
    // Remover caracteres peligrosos
    if (typeof value !== 'string') return value;
    return value
      .replace(/[<>]/g, '') // Remover < y >
      .replace(/--/g, '') // Remover comentarios SQL
      .replace(/['";]/g, '') // Remover comillas peligrosas
      .trim();
  }
};

const getTokenFromRequest = (req) => {
  const cookieToken = req.cookies?.[config.auth.cookieName];
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return null;
};

const authenticateJWT = (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const payload = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.auth.jwtIssuer,
      audience: config.auth.jwtAudience,
    });

    const userId = Number(payload.sub || payload.id);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ success: false, message: 'Token invalido' });
    }

    req.user = {
      id: userId,
      rol: payload.rol,
      rol_id: payload.rol_id,
      cliente_id: payload.cliente_id || null,
      email: payload.email,
      session_jti: payload.jti || null,
      session_expires_at_ms: typeof payload.exp === 'number' ? payload.exp * 1000 : null,
    };

    return next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError' ? 'Sesion expirada' : 'Token invalido';
    return res.status(401).json({ success: false, message });
  }
};

const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }

  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({ success: false, message: 'No autorizado' });
  }

  return next();
};

// Middleware para validar permisos específicos basados en el rol del usuario
const authorizePermissions = (...requiredPermissions) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    // Administrador tiene acceso a todo
    if (req.user.rol === 'Administrador') {
      return next();
    }

    // Cliente solo puede acceder a endpoints de cliente
    if (req.user.rol === 'Cliente') {
      if (!requiredPermissions.includes('Cliente')) {
        return res.status(403).json({ success: false, message: 'No autorizado para acceder a este recurso' });
      }
      return next();
    }

    // Para otros roles, obtener los permisos del rol desde la BD
    const roleResult = await pool.query(
      'SELECT permisos FROM roles WHERE id = $1',
      [req.user.rol_id]
    );

    const rol = roleResult.rows[0];
    if (!rol) {
      return res.status(403).json({ success: false, message: 'Rol no encontrado' });
    }

    const userPermissions = Array.isArray(rol.permisos) ? rol.permisos : [];

    // Verificar que el usuario tenga al menos uno de los permisos requeridos
    const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos suficientes para acceder a este recurso',
        requiredPermissions,
        userPermissions
      });
    }

    return next();
  } catch (error) {
    console.error('Error en authorizePermissions:', error);
    return res.status(500).json({ success: false, message: 'Error al validar permisos' });
  }
};

// Middleware de Rate Limiting simple en memoria para endpoints sensibles
const requestLog = new Map();

const simpleRateLimit = (maxRequests = 5, windowMs = 15 * 60 * 1000) => (req, res, next) => {
  const identifier = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!requestLog.has(identifier)) {
    requestLog.set(identifier, []);
  }
  
  const userRequests = requestLog.get(identifier);
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    const oldestRequest = Math.min(...recentRequests);
    const resetIn = Math.ceil((oldestRequest + windowMs - now) / 1000);
    return res.status(429).json({
      success: false,
      message: `Demasiadas solicitudes. Intenta de nuevo en ${resetIn} segundos.`,
      retryAfter: resetIn
    });
  }
  
  recentRequests.push(now);
  requestLog.set(identifier, recentRequests);
  
  return next();
};

// Limpiar logs antiguos cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [identifier, requests] of requestLog.entries()) {
    const recent = requests.filter(time => now - time < 15 * 60 * 1000);
    if (recent.length === 0) {
      requestLog.delete(identifier);
    } else {
      requestLog.set(identifier, recent);
    }
  }
}, 10 * 60 * 1000);

module.exports = {
  authenticateJWT,
  authorizeRoles,
  authorizePermissions,
  simpleRateLimit,
  validators,
};
