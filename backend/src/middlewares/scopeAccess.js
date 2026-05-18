/**
 * Control de alcance por rol (defensa en profundidad junto a authorizePermissions).
 * Admin: acceso total. Asesor: operación completa excepto módulos solo-admin.
 * Repartidor / Productor / Cliente: datos y acciones acotados.
 */

const FORBIDDEN = { success: false, message: 'No autorizado' };

const roleName = (req) => String(req.user?.rol || '').trim();

const isAdministrador = (req) => roleName(req) === 'Administrador';
const isAsesor = (req) => roleName(req) === 'Asesor';
const isRepartidor = (req) => roleName(req).toLowerCase() === 'repartidor';
const isProductor = (req) => roleName(req).toLowerCase() === 'productor';
const isCliente = (req) => roleName(req) === 'Cliente';

/** Solo Administrador (configuración, usuarios, roles). */
const authorizeAdministrador = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }
  if (!isAdministrador(req)) {
    return res.status(403).json(FORBIDDEN);
  }
  return next();
};

/** Repartidor: solo GET y cambio de estado en domicilios. */
const repartidorDomiciliosGuard = (req, res, next) => {
  if (!isRepartidor(req)) return next();
  if (req.method === 'GET') return next();
  const path = req.path || '';
  if ((req.method === 'PUT' || req.method === 'PATCH') && /\/estado\/?$/.test(path)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'El repartidor solo puede consultar domicilios asignados y actualizar su estado',
  });
};

/** Productor: solo GET y cambio de estado en órdenes de producción. */
const productorProduccionGuard = (req, res, next) => {
  if (!isProductor(req)) return next();
  if (req.method === 'GET') return next();
  const path = req.path || '';
  if ((req.method === 'PUT' || req.method === 'PATCH') && /\/estado\/?$/.test(path)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'El productor solo puede ver sus órdenes asignadas y actualizar su estado',
  });
};

/** Bloquea roles operativos en rutas de escritura genérica (crear/eliminar). */
const denyRoles =
  (...roles) =>
  (req, res, next) => {
    const r = roleName(req);
    if (roles.some((x) => x === r)) {
      return res.status(403).json(FORBIDDEN);
    }
    return next();
  };

module.exports = {
  isAdministrador,
  isAsesor,
  isRepartidor,
  isProductor,
  isCliente,
  authorizeAdministrador,
  repartidorDomiciliosGuard,
  productorProduccionGuard,
  denyRoles,
};
