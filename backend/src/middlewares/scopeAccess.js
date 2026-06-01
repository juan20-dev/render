/**
 * Control de alcance por rol (defensa en profundidad junto a authorizePermissions).
 * Repartidor/Productor: si el rol tiene el permiso en BD, no se aplica el límite legacy.
 */

const pool = require('../../db');
const { roleGrantsPermission } = require('../models/shared/auditoria');

const FORBIDDEN = { success: false, message: 'No autorizado' };

const roleName = (req) => String(req.user?.rol || '').trim();

const isAdministrador = (req) => roleName(req) === 'Administrador';
const isAsesor = (req) => roleName(req) === 'Asesor';
const isRepartidor = (req) => roleName(req).toLowerCase() === 'repartidor';
const isProductor = (req) => roleName(req).toLowerCase() === 'productor';
const isCliente = (req) => roleName(req) === 'Cliente';

const getRolePermissions = async (req) => {
  const rolId = req.user?.rol_id;
  if (!rolId) return [];
  const roleResult = await pool.query('SELECT permisos FROM roles WHERE id = $1', [rolId]);
  return Array.isArray(roleResult.rows[0]?.permisos) ? roleResult.rows[0].permisos : [];
};

const roleHasAnyPermission = async (req, permissions) => {
  const list = await getRolePermissions(req);
  return permissions.some((perm) => roleGrantsPermission(list, perm));
};

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

/** Repartidor sin permiso de edición: solo GET y cambio de estado en domicilios. */
const repartidorDomiciliosGuard = async (req, res, next) => {
  if (!isRepartidor(req)) return next();
  if (req.method === 'GET') return next();

  try {
    if (
      await roleHasAnyPermission(req, [
        'Editar Domicilios',
        'Gestionar Domicilios',
        'Crear Domicilios',
        'Eliminar Domicilios',
      ])
    ) {
      return next();
    }

    const path = req.path || '';
    if ((req.method === 'PUT' || req.method === 'PATCH') && /\/estado\/?$/.test(path)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'El repartidor solo puede consultar domicilios asignados y actualizar su estado',
    });
  } catch (error) {
    console.error('Error en repartidorDomiciliosGuard:', error);
    return res.status(500).json({ success: false, message: 'Error al validar permisos' });
  }
};

/** Productor sin permiso de registro/edición: solo lectura y estado en producción. */
const productorProduccionGuard = async (req, res, next) => {
  if (!isProductor(req)) return next();
  if (req.method === 'GET') return next();

  try {
    if (await roleHasAnyPermission(req, ['Registrar Producción', 'Editar Producción'])) {
      return next();
    }

    const path = req.path || '';
    if (req.method === 'POST' && (path === '/' || path === '')) {
      return next();
    }
    if ((req.method === 'PUT' || req.method === 'PATCH') && /\/estado\/?$/.test(path)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message:
        'El productor solo puede consultar sus órdenes, registrar nuevas órdenes propias y actualizar su estado',
    });
  } catch (error) {
    console.error('Error en productorProduccionGuard:', error);
    return res.status(500).json({ success: false, message: 'Error al validar permisos' });
  }
};

/** Productor sin permiso de entrega: solo lectura de entregas de insumos. */
const productorEntregasGuard = async (req, res, next) => {
  if (!isProductor(req)) return next();
  if (req.method === 'GET') return next();

  try {
    if (await roleHasAnyPermission(req, ['Entregar Insumos', 'Crear Insumos', 'Editar Insumos'])) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'El productor solo puede consultar sus entregas de insumos',
    });
  } catch (error) {
    console.error('Error en productorEntregasGuard:', error);
    return res.status(500).json({ success: false, message: 'Error al validar permisos' });
  }
};

/** Bloquea roles en rutas donde no aplica (p. ej. Cliente en backoffice). */
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
  productorEntregasGuard,
  denyRoles,
};
