/**
 * Modelo Usuarios
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
  ensureUserAuditTable,
  ensureUserSessionTable,
  ensureUserBackupTable,
  ensureUserPasswordHistoryTable,
  ensureUserPasswordResetTable,
  ensureUserLoginAttemptsTable,
  ensureUsuariosPasswordEmailExpiresColumn,
  registerUserSession,
  getPasswordHistory,
  storePasswordHistory,
  createPasswordResetToken,
  consumePasswordResetToken,
  getLoginAttemptRecord,
  registerLoginFailure,
  clearLoginAttempts,
  isLoginBlocked,
  getLoginBlockInfo,
  revokeUserSession,
  revokeAllUserSessions,
  isUserSessionActive,
  touchUserSession,
  getActiveUserSessionCount,
  getLatestUserStatusReason,
  getLinkedClienteForUsuario,
  getUserDeletionBlockers,
  getUserDeletionImpact,
  buildUserFilterQuery,
  registerUserAudit,
  toUserSnapshot,
  getUserChanges,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_BLOCK_DURATION_MS,
} = require('../shared/auditoria');

const Usuarios = {
  getAll: async (filters = {}) => {
    const { whereClause, values } = buildUserFilterQuery(filters);
    const querySuffix =
      typeof filters.limit === 'number' && Number.isFinite(filters.limit)
        ? ` LIMIT ${Math.max(1, Math.min(filters.limit, 50000))}`
        : '';

    const result = await pool.query(`
      SELECT u.id,
             u.nombre,
             u.apellido,
             u.tipo_documento,
             u.documento,
             u.direccion,
             u.email,
             u.telefono,
             u.rol_id,
             u.estado,
             u.created_at,
             u.updated_at,
             r.nombre AS rol
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      ${whereClause}
      ORDER BY
        CASE WHEN LOWER(TRIM(COALESCE(u.estado, ''))) = 'activo' THEN 0 ELSE 1 END,
        u.id DESC
      ${querySuffix}
    `, values);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(`
      SELECT u.*, r.nombre as rol
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      WHERE u.id = $1
    `, [id]);
    return result.rows[0];
  },
  getByEmail: async (email) => {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return result.rows[0];
  },
  getByDocumento: async (documento) => {
    const result = await pool.query('SELECT * FROM usuarios WHERE documento = $1', [documento]);
    return result.rows[0];
  },
  getByTelefono: async (telefono) => {
    const result = await pool.query('SELECT * FROM usuarios WHERE telefono = $1', [telefono]);
    return result.rows[0];
  },
  existsEmailExcept: async (email, excludeUserId = 0) => {
    const result = await pool.query(
      'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
      [email, Number(excludeUserId) || 0]
    );
    return result.rows.length > 0;
  },
  existsDocumentoExcept: async (documento, excludeUserId = 0) => {
    const result = await pool.query(
      'SELECT id FROM usuarios WHERE documento = $1 AND id <> $2 LIMIT 1',
      [documento, Number(excludeUserId) || 0]
    );
    return result.rows.length > 0;
  },
  existsTelefonoExcept: async (telefono, excludeUserId = 0) => {
    const result = await pool.query(
      'SELECT id FROM usuarios WHERE telefono = $1 AND id <> $2 LIMIT 1',
      [telefono, Number(excludeUserId) || 0]
    );
    return result.rows.length > 0;
  },
  getByEmailLogin: async (identifier) => {
    const result = await pool.query(
      `SELECT * FROM usuarios
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );
    return result.rows[0];
  },
  getFullDetailById: async (id, options = {}) => {
    await ensureUserAuditTable();
    await ensureUserSessionTable();

    const safeLimit = Number.isFinite(Number(options.limit))
      ? Math.max(20, Math.min(Number(options.limit), 300))
      : 120;

    const usuario = await Usuarios.getById(id);
    if (!usuario) return null;

    const auditResult = await pool.query(
      `SELECT ua.id,
              ua.usuario_id,
              ua.accion,
              ua.actor_id,
              ua.cambios,
              ua.created_at,
              actor.nombre AS actor_nombre,
              actor.apellido AS actor_apellido,
              actor.email AS actor_email
       FROM usuarios_auditoria ua
       LEFT JOIN usuarios actor ON actor.id = ua.actor_id
       WHERE ua.usuario_id = $1
       ORDER BY ua.created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    const sessionsResult = await pool.query(
      `SELECT id, usuario_id, jti, created_at, expires_at, revoked_at, last_seen_at, ip_address, user_agent
       FROM usuarios_sesiones
       WHERE usuario_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    return {
      usuario,
      logs: auditResult.rows,
      sesiones: sessionsResult.rows,
      activeSessions: sessionsResult.rows.filter(
        (session) => !session.revoked_at && new Date(session.expires_at).getTime() > Date.now()
      ).length,
    };
  },
  getDeletionImpact: async (id) => {
    const impact = await getUserDeletionImpact(id);
    return impact;
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, tipo_documento, documento, direccion, email, telefono, password_hash, rol_id, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [data.nombre, data.apellido, data.tipo_documento, data.documento, data.direccion, data.email, data.telefono, data.password_hash || '$2a$10$DEFAULT', data.rol_id, data.estado || 'Activo']
    );
    const createdUser = await Usuarios.getById(result.rows[0].id);
    await registerUserAudit({
      usuarioId: result.rows[0].id,
      accion: 'CREATE',
      actorId: data.actor_id ?? null,
      cambios: {
        before: null,
        after: toUserSnapshot(createdUser),
      },
    });
    return result.rows[0].id;
  },
  update: async (id, data) => {
    const currentUser = await Usuarios.getById(id);
    await pool.query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre),
           apellido = COALESCE($2, apellido),
           tipo_documento = COALESCE($3, tipo_documento),
           documento = COALESCE($4, documento),
           direccion = COALESCE($5, direccion),
           email = COALESCE($6, email),
           telefono = COALESCE($7, telefono),
           rol_id = COALESCE($8, rol_id),
           estado = COALESCE($9, estado),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $10`,
      [
        data.nombre,
        data.apellido,
        data.tipo_documento,
        data.documento,
        data.direccion,
        data.email,
        data.telefono,
        data.rol_id,
        data.estado,
        id,
      ]
    );

    const updatedUser = await Usuarios.getById(id);
    const changedFields = getUserChanges(toUserSnapshot(currentUser), toUserSnapshot(updatedUser));
    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'UPDATE',
      actorId: data.actor_id ?? null,
      cambios: {
        before: toUserSnapshot(currentUser),
        after: toUserSnapshot(updatedUser),
        changedFields,
        reason: typeof data.motivo === 'string' && data.motivo.trim() ? data.motivo.trim() : null,
      },
    });
    return true;
  },
  updatePasswordHash: async (id, passwordHash) => {
    await ensureUsuariosPasswordEmailExpiresColumn();
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, password_email_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );
    return true;
  },
  updatePasswordHashWithExpiry: async (id, passwordHash, expiresAtMs) => {
    await ensureUsuariosPasswordEmailExpiresColumn();
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, password_email_expires_at = to_timestamp($2 / 1000.0), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [passwordHash, expiresAtMs, id]
    );
    return true;
  },
  ensurePasswordEmailExpiryColumn: async () => {
    await ensureUsuariosPasswordEmailExpiresColumn();
  },
  getPasswordHistory: getPasswordHistory,
  storePasswordHistory: storePasswordHistory,
  createPasswordResetToken: createPasswordResetToken,
  consumePasswordResetToken: consumePasswordResetToken,
  registerLoginFailure: registerLoginFailure,
  clearLoginAttempts: clearLoginAttempts,
  isLoginBlocked: isLoginBlocked,
  getLoginBlockInfo: getLoginBlockInfo,
  MAX_LOGIN_ATTEMPTS: MAX_LOGIN_ATTEMPTS,
  LOGIN_BLOCK_DURATION_MS: LOGIN_BLOCK_DURATION_MS,
  registerSession: async ({ usuarioId, jti, expiresAt, ipAddress = null, userAgent = null }) => {
    await registerUserSession({ usuarioId, jti, expiresAt, ipAddress, userAgent });
    return true;
  },
  revokeSession: async (jti) => {
    await revokeUserSession(jti);
    return true;
  },
  revokeAllSessions: async (usuarioId) => revokeAllUserSessions(usuarioId),
  isSessionActive: async (usuarioId, jti) => isUserSessionActive(usuarioId, jti),
  touchSession: async (jti) => touchUserSession(jti),
  getActiveSessionCount: async (id) => {
    return getActiveUserSessionCount(id);
  },
  getLatestStatusReason: async (usuarioId, estado = null) => getLatestUserStatusReason(usuarioId, estado),
  getActivityById: async (id, limit = 80) => {
    await ensureUserAuditTable();
    await ensureUserSessionTable();

    const safeLimit = Number.isFinite(Number(limit))
      ? Math.max(10, Math.min(Number(limit), 200))
      : 80;

    const auditResult = await pool.query(
      `SELECT ua.id,
              ua.usuario_id,
              ua.accion,
              ua.actor_id,
              ua.cambios,
              ua.created_at,
              actor.nombre AS actor_nombre,
              actor.apellido AS actor_apellido,
              actor.email AS actor_email
       FROM usuarios_auditoria ua
       LEFT JOIN usuarios actor ON actor.id = ua.actor_id
       WHERE ua.usuario_id = $1
       ORDER BY ua.created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    const sessionsResult = await pool.query(
      `SELECT id, usuario_id, jti, created_at, expires_at, revoked_at, last_seen_at
       FROM usuarios_sesiones
       WHERE usuario_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    const sessionEvents = [];
    sessionsResult.rows.forEach((session) => {
      sessionEvents.push({
        id: `session-login-${session.id}`,
        usuario_id: session.usuario_id,
        accion: 'LOGIN',
        actor_id: session.usuario_id,
        actor_nombre: null,
        actor_apellido: null,
        actor_email: null,
        cambios: {
          session_id: session.id,
          jti: session.jti,
          expires_at: session.expires_at,
        },
        created_at: session.created_at,
      });

      if (session.revoked_at) {
        sessionEvents.push({
          id: `session-logout-${session.id}`,
          usuario_id: session.usuario_id,
          accion: 'LOGOUT',
          actor_id: session.usuario_id,
          actor_nombre: null,
          actor_apellido: null,
          actor_email: null,
          cambios: {
            session_id: session.id,
            jti: session.jti,
            revoked_at: session.revoked_at,
            last_seen_at: session.last_seen_at,
          },
          created_at: session.revoked_at,
        });
      }
    });

    return [...auditResult.rows, ...sessionEvents]
      .filter((item) => item.created_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, safeLimit);
  },
  updateStatus: async (id, data = {}) => {
    const currentUser = await Usuarios.getById(id);
    if (!currentUser) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const nextStatus = data.estado;
    if (!['Activo', 'Inactivo'].includes(nextStatus)) {
      const error = new Error('Estado invalido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    const forceRequested = data.force === true || data.force === 'true';
    let activeSessions = 0;
    let revokedSessions = 0;

    if (nextStatus === 'Inactivo') {
      ensureMotivoEstado(data?.motivo);
      activeSessions = await getActiveUserSessionCount(id);
      await checkInactivacionDependencias('usuario', id);
      if (activeSessions > 0) {
        revokedSessions = await revokeAllUserSessions(id);
      }
    } else {
      ensureMotivoEstado(data?.motivo);
    }

    await pool.query(
      'UPDATE usuarios SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextStatus, id]
    );

    const updatedUser = await Usuarios.getById(id);
    const changedFields = getUserChanges(toUserSnapshot(currentUser), toUserSnapshot(updatedUser));
    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'UPDATE',
      actorId: data.actor_id ?? null,
      cambios: {
        before: toUserSnapshot(currentUser),
        after: toUserSnapshot(updatedUser),
        changedFields,
        reason: typeof data.motivo === 'string' && data.motivo.trim() ? data.motivo.trim() : null,
        statusChange: true,
        forceRequested,
        activeSessions,
        revokedSessions,
      },
    });

    return updatedUser;
  },
  assignRole: async (id, rolId) => {
    await pool.query(
      'UPDATE usuarios SET rol_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [rolId, id]
    );
    return true;
  },
  delete: async (id, options = {}) => {
    const currentUser = await Usuarios.getById(id);
    if (!currentUser) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (!reason || reason.length < 10 || reason.length > 50) {
      const error = new Error('El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres');
      error.statusCode = 400;
      error.details = { reasonLength: reason.length };
      throw error;
    }

    const impact = await getUserDeletionImpact(id);

    if (!impact) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (impact.blockers.length > 0) {
      const error = new Error('No se puede eliminar el usuario porque tiene relaciones activas o transacciones recientes');
      error.statusCode = 409;
      error.details = { blockers: impact.blockers };
      throw error;
    }

    await ensureUserBackupTable();
    await ensureUserSessionTable();
    await ensureUserAuditTable();

    await pool.query(
      `INSERT INTO usuarios_backup (usuario_id, actor_id, reason, snapshot)
       VALUES ($1, $2, $3, $4)`,
      [id, options.actor_id ?? null, reason, JSON.stringify({ user: currentUser, impact })]
    );

    await pool.query('DELETE FROM usuarios_sesiones WHERE usuario_id = $1', [id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);

    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'DELETE',
      actorId: options.actor_id ?? null,
      cambios: {
        before: toUserSnapshot(currentUser),
        after: null,
        reason,
        physicalDelete: true,
        backupStored: true,
      },
    });
    return { mode: 'physical' };
  },
  forceResetPassword: async (id, options = {}) => {
    const user = await Usuarios.getById(id);
    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await Usuarios.updatePasswordHash(id, passwordHash);
    await Usuarios.storePasswordHistory(id, passwordHash);

    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'UPDATE',
      actorId: options.actor_id ?? null,
      cambios: {
        before: null,
        after: null,
        forcedPasswordReset: true,
        reason: typeof options.reason === 'string' ? options.reason.trim() : null,
      },
    });

    return {
      user,
      tempPassword,
    };
  },

  // Obtener expiración de contraseña temporal enviada por correo
  getPasswordEmailExpiry: async (usuarioId) => {
    const result = await pool.query(
      'SELECT password_email_expires_at FROM usuarios WHERE id = $1',
      [usuarioId]
    );
    return result.rows[0]?.password_email_expires_at || null;
  },

  // Limpiar expiración de contraseña temporal
  clearPasswordEmailExpiry: async (usuarioId) => {
    await pool.query(
      'UPDATE usuarios SET password_email_expires_at = NULL WHERE id = $1',
      [usuarioId]
    );
  },

  // Revocar todas las sesiones de un usuario
  revokeAllSessions: async (usuarioId) => {
    await pool.query(
      'UPDATE usuarios_sesiones SET revoked_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE usuario_id = $1',
      [usuarioId]
    );
  }
};


// API expuesta historicamente como propiedades del objeto Usuarios
Usuarios.MAX_LOGIN_ATTEMPTS = MAX_LOGIN_ATTEMPTS;
Usuarios.LOGIN_BLOCK_DURATION_MS = LOGIN_BLOCK_DURATION_MS;

module.exports = Usuarios;
