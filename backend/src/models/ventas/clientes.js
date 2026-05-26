/**
 * Modelo Clientes (incluye helpers locales: getClientePendingWork, buildClienteBloqueoMensaje)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const bcrypt = require('bcryptjs');
const { generateTempPassword } = require('../../utils/credentials');
const {
  ensureMotivoEstado,
  checkInactivacionDependencias,
  registerClienteAudit,
  getActiveUserSessionCount,
  revokeAllUserSessions,
  registerUserAudit,
} = require('../shared/auditoria');

/**
 * Calcula trabajo pendiente real de un cliente que impide eliminarlo o inactivarlo.
 * Pendiente significa:
 *   - pedidos en estado 'Pendiente' o 'En Proceso'
 *   - ventas en estado 'Pendiente'
 *   - domicilios cuyo estado no es 'Entregado' ni 'Cancelado' (es decir, en operacion)
 */
const getClientePendingWork = async (clienteId) => {
  const id = Number(clienteId);
  if (!Number.isFinite(id) || id <= 0) {
    return { pedidos: 0, ventas: 0, domicilios: 0, total: 0 };
  }
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM pedidos
         WHERE cliente_id = $1
           AND TRIM(LOWER(COALESCE(estado, ''))) IN ('pendiente','en proceso'))::int AS pedidos,
       (SELECT COUNT(*) FROM ventas
         WHERE cliente_id = $1
           AND TRIM(LOWER(COALESCE(estado, ''))) = 'pendiente')::int AS ventas,
       (SELECT COUNT(*) FROM domicilios
         WHERE cliente_id = $1
           AND TRIM(LOWER(COALESCE(estado, ''))) NOT IN ('entregado','cancelado'))::int AS domicilios`,
    [id]
  );
  const row = result.rows[0] || {};
  const pedidos = Number(row.pedidos || 0);
  const ventas = Number(row.ventas || 0);
  const domicilios = Number(row.domicilios || 0);
  return { pedidos, ventas, domicilios, total: pedidos + ventas + domicilios };
};

const buildClienteBloqueoMensaje = (work, accion) => {
  const partes = [];
  if (work.pedidos > 0) {
    partes.push(`${work.pedidos} pedido${work.pedidos === 1 ? '' : 's'} en estado Pendiente o En Proceso`);
  }
  if (work.ventas > 0) {
    partes.push(`${work.ventas} venta${work.ventas === 1 ? '' : 's'} en estado Pendiente`);
  }
  if (work.domicilios > 0) {
    partes.push(`${work.domicilios} domicilio${work.domicilios === 1 ? '' : 's'} sin entregar`);
  }
  const detalle = partes.join(', ');
  return `No se puede ${accion} el cliente porque tiene ${detalle}. Finalice o cancele esos registros antes de continuar.`;
};

const getClienteRecentTransactions = async (clienteId, days = 30) => {
  const id = Number(clienteId);
  const safeDays = Number.isFinite(Number(days)) ? Math.max(1, Number(days)) : 30;
  if (!Number.isFinite(id) || id <= 0) {
    return { pedidos: 0, ventas: 0, abonos: 0, domicilios: 0, total: 0, days: safeDays };
  }

  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM pedidos
         WHERE cliente_id = $1
           AND COALESCE(created_at, fecha::timestamp) >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day'))::int AS pedidos,
       (SELECT COUNT(*) FROM ventas
         WHERE cliente_id = $1
           AND COALESCE(created_at, fecha::timestamp) >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day'))::int AS ventas,
       (SELECT COUNT(*) FROM abonos
         WHERE cliente_id = $1
           AND COALESCE(created_at, fecha::timestamp) >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day'))::int AS abonos,
       (SELECT COUNT(*) FROM domicilios
         WHERE cliente_id = $1
           AND COALESCE(created_at, fecha::timestamp) >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day'))::int AS domicilios`,
    [id, safeDays]
  );

  const row = result.rows[0] || {};
  const pedidos = Number(row.pedidos || 0);
  const ventas = Number(row.ventas || 0);
  const abonos = Number(row.abonos || 0);
  const domicilios = Number(row.domicilios || 0);
  return {
    pedidos,
    ventas,
    abonos,
    domicilios,
    total: pedidos + ventas + abonos + domicilios,
    days: safeDays,
  };
};

const Clientes = {
  getPendingWork: getClientePendingWork,
  getRecentTransactions: getClienteRecentTransactions,
  buildBloqueoMensaje: buildClienteBloqueoMensaje,
  getAll: async () => {
    const result = await pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)::int
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ), 0) AS compras,
         (
           SELECT MAX(v.fecha)
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ) AS ultima_compra
       FROM clientes c
       ORDER BY
         CASE WHEN LOWER(TRIM(COALESCE(c.estado, ''))) = 'activo' THEN 0 ELSE 1 END,
         c.id DESC`
    );
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)::int
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ), 0) AS compras,
         (
           SELECT MAX(v.fecha)
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ) AS ultima_compra
       FROM clientes c
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  getByDocumento: async (documento) => {
    const result = await pool.query('SELECT * FROM clientes WHERE documento = $1', [documento]);
    return result.rows[0];
  },
  getByEmail: async (email) => {
    const result = await pool.query('SELECT * FROM clientes WHERE email = $1', [email]);
    return result.rows[0];
  },
  getByUsuarioId: async (usuarioId) => {
    const result = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuarioId]);
    return result.rows[0];
  },
  getOrCreateByUsuarioId: async (usuarioId) => {
    const existing = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuarioId]);
    if (existing.rows[0]) return existing.rows[0];

    // Intentar vincular por email si existe un cliente legacy sin usuario_id.
    const linked = await pool.query(
      `UPDATE clientes c
       SET usuario_id = u.id,
           nombre = COALESCE(c.nombre, u.nombre),
           apellido = COALESCE(c.apellido, u.apellido),
           tipo_documento = COALESCE(c.tipo_documento, u.tipo_documento),
           documento = COALESCE(c.documento, u.documento),
           telefono = COALESCE(c.telefono, u.telefono),
           direccion = COALESCE(c.direccion, u.direccion),
           estado = COALESCE(c.estado, u.estado),
           updated_at = CURRENT_TIMESTAMP
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1
         AND r.nombre = 'Cliente'
         AND c.usuario_id IS NULL
         AND c.email IS NOT NULL
         AND LOWER(c.email) = LOWER(u.email)
       RETURNING c.*`,
      [usuarioId]
    );
    if (linked.rows[0]) return linked.rows[0];

    // Crear perfil cliente si el usuario existe y su rol es Cliente.
    const inserted = await pool.query(
      `INSERT INTO clientes (
         usuario_id,
         nombre,
         apellido,
         tipo_documento,
         documento,
         telefono,
         email,
         direccion,
         estado
       )
       SELECT
         u.id,
         u.nombre,
         u.apellido,
         u.tipo_documento,
         u.documento,
         u.telefono,
         u.email,
         u.direccion,
         COALESCE(u.estado, 'Activo')
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1
         AND r.nombre = 'Cliente'
         AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.usuario_id = u.id)
       RETURNING *`,
      [usuarioId]
    );

    if (inserted.rows[0]) return inserted.rows[0];

    const fallback = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuarioId]);
    return fallback.rows[0] || null;
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO clientes (usuario_id, nombre, apellido, tipo_documento, documento, telefono, email, direccion, foto_url, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [data.usuario_id || null, data.nombre, data.apellido, data.tipoDocumento, data.documento, data.telefono, data.email, data.direccion, data.foto_url, data.estado || 'Activo']
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await pool.query(
      `UPDATE clientes
       SET usuario_id = COALESCE($1, usuario_id),
           nombre = COALESCE($2, nombre),
           apellido = COALESCE($3, apellido),
           tipo_documento = COALESCE($4, tipo_documento),
           documento = COALESCE($5, documento),
           telefono = COALESCE($6, telefono),
           email = COALESCE($7, email),
           direccion = COALESCE($8, direccion),
           estado = COALESCE($9, estado),
           foto_url = COALESCE($10, foto_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11`,
      [
        data.usuario_id,
        data.nombre,
        data.apellido,
        data.tipoDocumento,
        data.documento,
        data.telefono,
        data.email,
        data.direccion,
        data.estado,
        data.foto_url,
        id,
      ]
    );
    return true;
  },
  updateStatus: async (id, data = {}) => {
    const current = await Clientes.getById(id);
    if (!current) {
      const error = new Error('Cliente no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const estado = String(data?.estado || '').trim();
    if (!['Activo', 'Inactivo'].includes(estado)) {
      const error = new Error('Estado invalido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    ensureMotivoEstado(data?.motivo);
    const motivo = typeof data?.motivo === 'string' ? data.motivo.trim() : null;

    if (current.estado === estado) {
      return current;
    }

    let activeSessions = 0;
    let revokedSessions = 0;
    let currentUser = null;

    if (current.estado !== 'Inactivo' && estado === 'Inactivo') {
      if (current.usuario_id) {
        activeSessions = await getActiveUserSessionCount(current.usuario_id);
        const userResult = await pool.query('SELECT * FROM usuarios WHERE id = $1 LIMIT 1', [current.usuario_id]);
        currentUser = userResult.rows[0] || null;
      }

      const work = await getClientePendingWork(id);
      if (work.total > 0) {
        const error = new Error(buildClienteBloqueoMensaje(work, 'inactivar'));
        error.statusCode = 409;
        error.details = { dependencias: work };
        throw error;
      }
      // Mantener compatibilidad con check de BD si existe (no rompe si no esta).
      await checkInactivacionDependencias('cliente', id);
    }

    await pool.query(
      `UPDATE clientes
       SET estado = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [estado, id]
    );

    if (current.usuario_id) {
      await pool.query(
        `UPDATE usuarios
         SET estado = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [estado, current.usuario_id]
      );

      if (estado === 'Inactivo' && activeSessions > 0) {
        revokedSessions = await revokeAllUserSessions(current.usuario_id);
      }

      const updatedUserResult = await pool.query('SELECT * FROM usuarios WHERE id = $1 LIMIT 1', [current.usuario_id]);
      const updatedUser = updatedUserResult.rows[0] || null;

      await registerUserAudit({
        usuarioId: Number(current.usuario_id),
        accion: 'UPDATE',
        actorId: data?.actor_id ?? null,
        cambios: {
          before: currentUser ? { estado: currentUser.estado } : { estado: current.estado },
          after: updatedUser ? { estado: updatedUser.estado } : { estado },
          reason: motivo,
          statusChange: true,
          activeSessions,
          revokedSessions,
          synchronizedFromClienteId: Number(id),
        },
      });
    }

    await registerClienteAudit({
      clienteId: Number(id),
      accion: 'STATUS_CHANGE',
      usuarioId: data?.actor_id ?? null,
      cambios: {
        before: { estado: current.estado },
        after: { estado },
        motivo,
        usuario_id_sincronizado: current.usuario_id || null,
        activeSessions,
        revokedSessions,
      },
    });

    return Clientes.getById(id);
  },
  delete: async (id, options = {}) => {
    const previous = await Clientes.getById(id);
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    await registerClienteAudit({
      clienteId: Number(id),
      accion: 'DELETE',
      usuarioId: options?.actor_id ?? null,
      cambios: {
        before: previous
          ? {
              nombre: previous.nombre,
              apellido: previous.apellido,
              email: previous.email,
              documento: previous.documento,
              estado: previous.estado,
              usuario_id: previous.usuario_id,
            }
          : null,
        after: null,
      },
    });
    return true;
  }
};

module.exports = Clientes;
