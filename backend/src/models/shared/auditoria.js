/**
 * Helpers globales y auditoria centralizada (compartidos por todos los modulos)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');

// ------- Bloque inicial: helpers globales (ensure*, sync*, normalize*, etc.) -------
let ventasMoneyColumnsReady = null;
const ensureVentasMoneyColumns = async () => {
  if (!ventasMoneyColumnsReady) {
    ventasMoneyColumnsReady = (async () => {
      await pool.query(`
        ALTER TABLE ventas
          ALTER COLUMN total TYPE NUMERIC(18,2),
          ALTER COLUMN abono_recibido TYPE NUMERIC(18,2)
      `);
      await pool.query(`
        ALTER TABLE detalle_ventas
          ALTER COLUMN precio_unitario TYPE NUMERIC(18,2),
          ALTER COLUMN subtotal TYPE NUMERIC(18,2)
      `);
    })();
  }
  try {
    await ventasMoneyColumnsReady;
  } catch (_e) {
    ventasMoneyColumnsReady = null;
  }
};

const nextNumeroVenta = () => `VTA-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

let productoImageColumnReady = null;
let categoriaProductCountColumnReady = null;

const ensureProductoImageColumn = async () => {
  if (!productoImageColumnReady) {
    productoImageColumnReady = pool.query('ALTER TABLE productos ALTER COLUMN imagen_url TYPE TEXT');
  }

  try {
    await productoImageColumnReady;
  } catch (error) {
    
  }
};

let productoTipoCheckAllowsInsumoReady = null;
const ensureProductoTipoCheckAllowsInsumo = async () => {
  if (!productoTipoCheckAllowsInsumoReady) {
    productoTipoCheckAllowsInsumoReady = (async () => {
      await pool.query(`
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'productos' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tipo_producto%'
  ) LOOP
    EXECUTE format('ALTER TABLE productos DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;
`);
      await pool.query(`
ALTER TABLE productos
ADD CONSTRAINT productos_tipo_producto_check
CHECK (tipo_producto IN ('terminado','preparacion','insumo'))
`);
    })();
  }
  try {
    await productoTipoCheckAllowsInsumoReady;
  } catch (_e) {
    productoTipoCheckAllowsInsumoReady = null;
  }
};

let productoTipoColumnReady = null;
const ensureProductoTipoColumn = async () => {
  if (!productoTipoColumnReady) {
    productoTipoColumnReady = pool.query(
      `ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_producto VARCHAR(30) NOT NULL DEFAULT 'terminado'`
    );
  }
  try {
    await productoTipoColumnReady;
  } catch (_error) {
    // ignore
  }
  try {
    await pool.query(`ALTER TABLE productos ALTER COLUMN precio TYPE NUMERIC(18,2)`);
  } catch (_e) {
    /* ya ampliado o permisos */
  }
  await ensureProductoTipoCheckAllowsInsumo();
};

let productoInsumoMedidaColumnsReady = null;
/** Presentación física del producto tipo insumo (unidad + cantidad); NULL en otros tipos. */
const ensureProductoInsumoMedidaColumns = async () => {
  if (!productoInsumoMedidaColumnsReady) {
    productoInsumoMedidaColumnsReady = (async () => {
      await pool.query(`
        ALTER TABLE productos
          ADD COLUMN IF NOT EXISTS insumo_unidad_medida VARCHAR(30),
          ADD COLUMN IF NOT EXISTS insumo_cantidad_medida NUMERIC(12,4)
      `);
    })();
  }
  try {
    await productoInsumoMedidaColumnsReady;
  } catch (_e) {
    productoInsumoMedidaColumnsReady = null;
  }
};

let productoInsumosTableReady = null;
const ensureProductoInsumosTable = async () => {
  if (!productoInsumosTableReady) {
    productoInsumosTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS producto_insumos (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
        cantidad_requerida DECIMAL(12, 4) NOT NULL CHECK (cantidad_requerida > 0),
        unidad VARCHAR(20) NOT NULL,
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (producto_id, insumo_id)
      )
    `);
  }
  try {
    await productoInsumosTableReady;
  } catch (_error) {
    // ignore
  }
};

let entregasInsumoProductoCatalogoReady = null;
/** Entregas pueden referir inventario tipo insumo vía productos (producto_catalogo_id) o la tabla legacy insumos (insumo_id). */
const ensureEntregasInsumoProductoCatalogo = async () => {
  if (!entregasInsumoProductoCatalogoReady) {
    entregasInsumoProductoCatalogoReady = (async () => {
      await pool.query(`
        ALTER TABLE entregas_insumos
          ADD COLUMN IF NOT EXISTS producto_catalogo_id INTEGER REFERENCES productos(id) ON DELETE RESTRICT
      `);
      await pool.query('ALTER TABLE entregas_insumos ALTER COLUMN insumo_id DROP NOT NULL');
      const chk = await pool.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'entregas_insumos_catalogo_xor_chk'`
      );
      if (!chk.rows[0]) {
        await pool.query(`
          ALTER TABLE entregas_insumos
            ADD CONSTRAINT entregas_insumos_catalogo_xor_chk CHECK (
              (insumo_id IS NOT NULL AND producto_catalogo_id IS NULL)
              OR (insumo_id IS NULL AND producto_catalogo_id IS NOT NULL)
            )
        `);
      }
      await pool.query(`
        ALTER TABLE entregas_insumos
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      await pool.query(`
        ALTER TABLE entregas_insumos
          ADD COLUMN IF NOT EXISTS anulada BOOLEAN NOT NULL DEFAULT FALSE
      `);
    })();
  }
  try {
    await entregasInsumoProductoCatalogoReady;
  } catch (_e) {
    entregasInsumoProductoCatalogoReady = null;
  }
};

const normalizeProductoTipoValue = (raw) => {
  const compact = String(raw ?? 'terminado')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (compact === 'preparacion' || compact === 'de_preparacion') return 'preparacion';
  if (compact === 'insumo' || compact === 'insumos') return 'insumo';
  return 'terminado';
};

const syncCategoriaProductCount = async (categoriaId = null) => {
  if (categoriaId === null || categoriaId === undefined) {
    await pool.query(`
      UPDATE categorias c
      SET cantidad_productos = (
        SELECT COUNT(*)
        FROM productos p
        WHERE p.categoria_id = c.id
      )
    `);
    return;
  }

  await pool.query(
    `UPDATE categorias c
     SET cantidad_productos = (
       SELECT COUNT(*)
       FROM productos p
       WHERE p.categoria_id = c.id
     )
     WHERE c.id = $1`,
    [categoriaId]
  );
};

const ensureCategoriaProductCountColumn = async () => {
  if (!categoriaProductCountColumnReady) {
    categoriaProductCountColumnReady = (async () => {
      await pool.query(`
        ALTER TABLE categorias
        ADD COLUMN IF NOT EXISTS cantidad_productos INTEGER NOT NULL DEFAULT 0
      `);
      await syncCategoriaProductCount();
    })();
  }

  await categoriaProductCountColumnReady;
};

const groupRowsBy = (rows, key) => {
  const grouped = new Map();

  for (const row of rows) {
    const groupKey = row[key];
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey).push(row);
  }

  return grouped;
};

const ensureMotivoEstado = (motivoRaw, min = 10, max = 50) => {
  const motivo = typeof motivoRaw === 'string' ? motivoRaw.trim() : '';
  if (!motivo || motivo.length < min || motivo.length > max) {
    const error = new Error(`El motivo es obligatorio y debe tener entre ${min} y ${max} caracteres`);
    error.statusCode = 400;
    throw error;
  }
  return motivo;
};

const checkInactivacionDependencias = async (tipo, id) => {
  try {
    const result = await pool.query('SELECT check_inactivacion($1, $2)::jsonb AS resultado', [tipo, id]);
    const payload = result.rows[0]?.resultado || {};
    const permitido = Boolean(payload.permitido);
    if (!permitido) {
      const error = new Error(payload.motivo || 'No se puede inactivar por dependencias activas');
      error.statusCode = 409;
      error.details = payload;
      throw error;
    }
    return true;
  } catch (error) {
    // Si la función aún no existe en BD, no romper runtime.
    if (error?.code === '42883' || /check_inactivacion/.test(String(error?.message || ''))) {
      return true;
    }
    throw error;
  }
};

// ------- Auditoria Productos / Categorias / Clientes -------
let productoAuditTableReady = null;
let categoriaAuditTableReady = null;
let clienteAuditTableReady = null;

const ensureProductoAuditTable = async () => {
  if (!productoAuditTableReady) {
    productoAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS productos_auditoria (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  await productoAuditTableReady;
};

const registerProductoAudit = async ({ productoId, accion, usuarioId = null, cambios }) => {
  try {
    await ensureProductoAuditTable();
    await pool.query(
      'INSERT INTO productos_auditoria (producto_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
      [productoId, accion, usuarioId, JSON.stringify(cambios || {})]
    );
  } catch (err) {
    // La auditoría nunca debe romper la operación principal
    console.warn('⚠️  No se pudo registrar auditoría de producto:', err.message);
  }
};

const ensureCategoriaAuditTable = async () => {
  if (!categoriaAuditTableReady) {
    categoriaAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS categorias_auditoria (
        id SERIAL PRIMARY KEY,
        categoria_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  await categoriaAuditTableReady;
};

const registerCategoriaAudit = async ({ categoriaId, accion, usuarioId = null, cambios }) => {
  try {
    await ensureCategoriaAuditTable();
    await pool.query(
      'INSERT INTO categorias_auditoria (categoria_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
      [categoriaId, accion, usuarioId, JSON.stringify(cambios || {})]
    );
  } catch (err) {
    console.warn('⚠️  No se pudo registrar auditoría de categoría:', err.message);
  }
};

const ensureClienteAuditTable = async () => {
  if (!clienteAuditTableReady) {
    clienteAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS clientes_auditoria (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  await clienteAuditTableReady;
};

const registerClienteAudit = async ({ clienteId, accion, usuarioId = null, cambios }) => {
  try {
    await ensureClienteAuditTable();
    await pool.query(
      'INSERT INTO clientes_auditoria (cliente_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
      [clienteId, accion, usuarioId, JSON.stringify(cambios || {})]
    );
  } catch (err) {
    console.warn('⚠️  No se pudo registrar auditoría de cliente:', err.message);
  }
};

// ------- Auditoria Roles + ensure tables Usuarios -------
let roleAuditTableReady = null;
let userAuditTableReady = null;
let userSessionTableReady = null;
let userBackupTableReady = null;
let userPasswordHistoryTableReady = null;
let userPasswordResetTableReady = null;
let userLoginAttemptsTableReady = null;

const ensureRoleAuditTable = async () => {
  if (!roleAuditTableReady) {
    roleAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS roles_auditoria (
        id SERIAL PRIMARY KEY,
        rol_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await roleAuditTableReady;
};

const registerRoleAudit = async ({ rolId, accion, usuarioId = null, cambios }) => {
  await ensureRoleAuditTable();
  await pool.query(
    'INSERT INTO roles_auditoria (rol_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
    [rolId, accion, usuarioId, JSON.stringify(cambios || {})]
  );
};

const ensureUserAuditTable = async () => {
  if (!userAuditTableReady) {
    userAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_auditoria (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        actor_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userAuditTableReady;
};

const ensureUserSessionTable = async () => {
  if (!userSessionTableReady) {
    userSessionTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios_sesiones (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          jti VARCHAR(120) NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          revoked_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query('ALTER TABLE usuarios_sesiones ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64)');
      await pool.query('ALTER TABLE usuarios_sesiones ADD COLUMN IF NOT EXISTS user_agent TEXT');
    })();
  }

  await userSessionTableReady;
};

const ensureUserBackupTable = async () => {
  if (!userBackupTableReady) {
    userBackupTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_backup (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        actor_id INTEGER,
        reason TEXT,
        snapshot JSONB NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userBackupTableReady;
};

const ensureUserPasswordHistoryTable = async () => {
  if (!userPasswordHistoryTableReady) {
    userPasswordHistoryTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_password_historial (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userPasswordHistoryTableReady;
};

const ensureUserPasswordResetTable = async () => {
  if (!userPasswordResetTableReady) {
    userPasswordResetTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_password_resets (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userPasswordResetTableReady;
};

const ensureUserLoginAttemptsTable = async () => {
  if (!userLoginAttemptsTableReady) {
    userLoginAttemptsTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_login_intentos (
        email VARCHAR(255) PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        blocked_until TIMESTAMP NULL,
        last_attempt_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userLoginAttemptsTableReady;
};

let usuariosPasswordEmailExpiresReady = null;
/** Caducidad opcional para credenciales comunicadas solo por correo (p. ej. alta desde gestión de clientes). */
const ensureUsuariosPasswordEmailExpiresColumn = async () => {
  if (!usuariosPasswordEmailExpiresReady) {
    usuariosPasswordEmailExpiresReady = pool.query(
      `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_email_expires_at TIMESTAMP NULL`
    );
  }
  try {
    await usuariosPasswordEmailExpiresReady;
  } catch (_e) {
    usuariosPasswordEmailExpiresReady = null;
  }
};

// ------- Helpers Usuarios (sesiones, password history, reset, login attempts) -------
const registerUserSession = async ({ usuarioId, jti, expiresAt, ipAddress = null, userAgent = null }) => {
  await ensureUserSessionTable();
  await pool.query(
    `INSERT INTO usuarios_sesiones (usuario_id, jti, expires_at, last_seen_at, ip_address, user_agent)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), CURRENT_TIMESTAMP, $4, $5)`,
    [usuarioId, jti, expiresAt, ipAddress, userAgent]
  );
};

const getPasswordHistory = async (usuarioId, limit = 3) => {
  await ensureUserPasswordHistoryTable();
  const result = await pool.query(
    `SELECT password_hash
     FROM usuarios_password_historial
     WHERE usuario_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [usuarioId, limit]
  );
  return result.rows.map((row) => row.password_hash);
};

const storePasswordHistory = async (usuarioId, passwordHash) => {
  await ensureUserPasswordHistoryTable();
  await pool.query(
    'INSERT INTO usuarios_password_historial (usuario_id, password_hash) VALUES ($1, $2)',
    [usuarioId, passwordHash]
  );
};

const createPasswordResetToken = async ({ usuarioId, tokenHash, expiresAt }) => {
  await ensureUserPasswordResetTable();
  await pool.query(
    'INSERT INTO usuarios_password_resets (usuario_id, token_hash, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))',
    [usuarioId, tokenHash, expiresAt]
  );
};

const consumePasswordResetToken = async ({ email, tokenHash }) => {
  await ensureUserPasswordResetTable();
  const result = await pool.query(
    `SELECT pr.*, u.id AS usuario_id
     FROM usuarios_password_resets pr
     JOIN usuarios u ON u.id = pr.usuario_id
     WHERE LOWER(u.email) = LOWER($1)
       AND pr.token_hash = $2
       AND pr.used_at IS NULL
       AND pr.expires_at > CURRENT_TIMESTAMP
     ORDER BY pr.created_at DESC
     LIMIT 1`,
    [email, tokenHash]
  );

  const tokenRow = result.rows[0];
  if (!tokenRow) return null;

  await pool.query('UPDATE usuarios_password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [tokenRow.id]);
  return tokenRow;
};

const getLoginAttemptRecord = async (email) => {
  await ensureUserLoginAttemptsTable();
  const result = await pool.query('SELECT * FROM usuarios_login_intentos WHERE email = LOWER($1) LIMIT 1', [email]);
  return result.rows[0] || null;
};

// Politica de intentos de inicio de sesion: 6 intentos fallidos => bloqueo de 5 minutos.
const MAX_LOGIN_ATTEMPTS = 6;
const LOGIN_BLOCK_DURATION_MS = 5 * 60 * 1000;

const registerLoginFailure = async (email) => {
  await ensureUserLoginAttemptsTable();
  const current = await getLoginAttemptRecord(email);
  const attempts = Number(current?.attempts || 0) + 1;
  const blockedUntil =
    attempts >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOGIN_BLOCK_DURATION_MS)
      : current?.blocked_until || null;

  await pool.query(
    `INSERT INTO usuarios_login_intentos (email, attempts, blocked_until, last_attempt_at, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO UPDATE
     SET attempts = EXCLUDED.attempts,
         blocked_until = EXCLUDED.blocked_until,
         last_attempt_at = EXCLUDED.last_attempt_at,
         updated_at = CURRENT_TIMESTAMP`,
    [String(email).trim().toLowerCase(), attempts, blockedUntil]
  );

  return { attempts, blockedUntil };
};

const clearLoginAttempts = async (email) => {
  await ensureUserLoginAttemptsTable();
  await pool.query('DELETE FROM usuarios_login_intentos WHERE LOWER(email) = LOWER($1)', [email]);
};

const isLoginBlocked = async (email) => {
  const record = await getLoginAttemptRecord(email);
  if (!record?.blocked_until) return false;
  return new Date(record.blocked_until).getTime() > Date.now();
};

/**
 * Devuelve información detallada del bloqueo: si está bloqueado y cuánto
 * tiempo (ms) le queda para volver a intentar. Útil para construir mensajes
 * claros ("Inténtalo en X minutos") sin hardcodear la cifra en el controller.
 */
const getLoginBlockInfo = async (email) => {
  const record = await getLoginAttemptRecord(email);
  if (!record?.blocked_until) return { blocked: false, remainingMs: 0, attempts: Number(record?.attempts || 0) };
  const blockedUntilMs = new Date(record.blocked_until).getTime();
  const remainingMs = blockedUntilMs - Date.now();
  return {
    blocked: remainingMs > 0,
    remainingMs: Math.max(0, remainingMs),
    attempts: Number(record.attempts || 0),
  };
};

const revokeUserSession = async (jti) => {
  if (!jti) return;
  await ensureUserSessionTable();
  await pool.query(
    'UPDATE usuarios_sesiones SET revoked_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE jti = $1',
    [jti]
  );
};

const isUserSessionActive = async (usuarioId, jti) => {
  if (!jti || !Number.isFinite(Number(usuarioId))) return false;
  await ensureUserSessionTable();
  const result = await pool.query(
    `SELECT 1
     FROM usuarios_sesiones
     WHERE usuario_id = $1
       AND jti = $2
       AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [Number(usuarioId), jti]
  );
  return result.rows.length > 0;
};

const touchUserSession = async (jti) => {
  if (!jti) return;
  await ensureUserSessionTable();
  await pool.query(
    `UPDATE usuarios_sesiones
     SET last_seen_at = CURRENT_TIMESTAMP
     WHERE jti = $1
       AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP`,
    [jti]
  );
};

const getActiveUserSessionCount = async (usuarioId) => {
  await ensureUserSessionTable();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM usuarios_sesiones
     WHERE usuario_id = $1
       AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP`,
    [usuarioId]
  );
  return Number(result.rows[0]?.total || 0);
};

const getLinkedClienteForUsuario = async (usuario) => {
  const linkedByUserId = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuario.id]);
  if (linkedByUserId.rows[0]) return linkedByUserId.rows[0];

  if (!usuario?.email) return null;

  const linkedByEmail = await pool.query(
    'SELECT * FROM clientes WHERE email IS NOT NULL AND LOWER(email) = LOWER($1) LIMIT 1',
    [usuario.email]
  );

  return linkedByEmail.rows[0] || null;
};

const getUserDeletionBlockers = async (usuario) => {
  const blockers = [];
  const linkedCliente = await getLinkedClienteForUsuario(usuario);

  if (!linkedCliente) {
    return blockers;
  }

  const thresholdQuery = "CURRENT_TIMESTAMP - INTERVAL '30 days'";
  const counts = [
    {
      key: 'pedidos_activos',
      label: 'pedidos activos',
      query: `SELECT COUNT(*)::int AS total FROM pedidos WHERE cliente_id = $1 AND estado NOT IN ('Completado', 'Cancelado')`,
    },
    {
      key: 'domicilios_activos',
      label: 'domicilios activos',
      query: `SELECT COUNT(*)::int AS total FROM domicilios WHERE cliente_id = $1 AND estado NOT IN ('Entregado', 'Cancelado')`,
    },
    {
      key: 'pedidos_recientes',
      label: 'pedidos de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM pedidos WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
    {
      key: 'ventas_recientes',
      label: 'ventas de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM ventas WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
    {
      key: 'abonos_recientes',
      label: 'abonos de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM abonos WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
    {
      key: 'domicilios_recientes',
      label: 'domicilios de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM domicilios WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
  ];

  const results = await Promise.all(counts.map(async (item) => {
    const result = await pool.query(item.query, [linkedCliente.id]);
    const total = Number(result.rows[0]?.total || 0);
    return total > 0 ? { key: item.key, label: item.label, total } : null;
  }));

  for (const blocker of results) {
    if (blocker) blockers.push(blocker);
  }

  return blockers;
};

const buildUserFilterQuery = (filters = {}) => {
  const where = [];
  const values = [];

  const pushValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (!filters.includeDeleted) {
    where.push("(u.estado IS NULL OR u.estado <> 'Eliminado')");
  }

  // Excluir explícitamente usuarios con rol 'Cliente' del módulo de Gestión de Usuarios.
  // Los clientes se administran únicamente desde el módulo de Clientes.
  if (filters.excludeClientes) {
    where.push("(r.nombre IS NULL OR LOWER(r.nombre) <> 'cliente')");
  }

  if (Array.isArray(filters.estados) && filters.estados.length > 0) {
    const placeholders = filters.estados.map((estado) => pushValue(estado));
    where.push(`u.estado IN (${placeholders.join(', ')})`);
  }

  if (filters.rolId) {
    where.push(`u.rol_id = ${pushValue(filters.rolId)}`);
  }

  if (Array.isArray(filters.tiposDocumento) && filters.tiposDocumento.length > 0) {
    const placeholders = filters.tiposDocumento.map((tipo) => pushValue(tipo));
    where.push(`u.tipo_documento IN (${placeholders.join(', ')})`);
  }

  if (filters.fechaDesde) {
    where.push(`u.created_at >= ${pushValue(filters.fechaDesde)}`);
  }

  if (filters.fechaHasta) {
    where.push(`u.created_at <= ${pushValue(filters.fechaHasta)}`);
  }

  if (typeof filters.globalQuery === 'string' && filters.globalQuery.trim()) {
    const term = `%${filters.globalQuery.trim().toLowerCase()}%`;
    const placeholder = pushValue(term);
    where.push(`(
      LOWER(COALESCE(u.nombre, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.apellido, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.email, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.documento, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.telefono, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.direccion, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.tipo_documento, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.estado, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(r.nombre, '')) LIKE ${placeholder}
      OR CAST(u.id AS TEXT) LIKE ${placeholder}
    )`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return { whereClause, values };
};

const getUserDeletionImpact = async (usuarioId) => {
  // Lazy require: este helper vive en shared/ pero necesita el modelo Usuarios
  // del modulo usuarios/. Si lo importaramos arriba habria ciclo de require
  // (usuarios/usuarios.js ya importa shared/auditoria). El require diferido se
  // resuelve la primera vez que se invoca la funcion, cuando ambos modulos ya
  // estan cargados.
  const Usuarios = require('../usuarios/usuarios');
  const usuario = await Usuarios.getById(usuarioId);
  if (!usuario) {
    return null;
  }

  const blockers = await getUserDeletionBlockers(usuario);
  const activeSessions = await getActiveUserSessionCount(usuarioId);
  const isInactiveState = ['inactivo', 'eliminado'].includes(String(usuario.estado || '').toLowerCase());
  const referenceDate = isInactiveState ? new Date(usuario.updated_at || usuario.created_at || Date.now()) : null;
  const daysInactive = referenceDate
    ? Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const canPhysicalDelete = Boolean(isInactiveState && daysInactive >= 90);

  return {
    usuario,
    blockers,
    activeSessions,
    daysInactive,
    canPhysicalDelete,
    hasImpact: blockers.length > 0 || activeSessions > 0,
  };
};

// ------- registerUserAudit + snapshots + helpers de roles -------
const registerUserAudit = async ({ usuarioId, accion, actorId, cambios }) => {
  try {
    await pool.query(
      `INSERT INTO usuarios_auditoria (usuario_id, accion, actor_id, cambios, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [usuarioId, accion, actorId, JSON.stringify(cambios)]
    );
  } catch (error) {
    console.error('Error registering user audit:', error.message);
    // No throw - audit failure shouldn't block the main operation
  }
};

const toUserSnapshot = (user) => ({
  id: user?.id ?? null,
  nombre: user?.nombre ?? null,
  apellido: user?.apellido ?? null,
  tipo_documento: user?.tipo_documento ?? null,
  documento: user?.documento ?? null,
  direccion: user?.direccion ?? null,
  email: user?.email ?? null,
  telefono: user?.telefono ?? null,
  rol_id: user?.rol_id ?? null,
  estado: user?.estado ?? null,
  updated_at: user?.updated_at ?? null,
});

const getUserChanges = (before, after) => {
  const changed = {};
  const fields = ['nombre', 'apellido', 'tipo_documento', 'documento', 'direccion', 'email', 'telefono', 'rol_id', 'estado'];

  fields.forEach((field) => {
    const previous = before?.[field];
    const next = after?.[field];
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changed[field] = { before: previous, after: next };
    }
  });

  return changed;
};

const toRoleSnapshot = (role) => ({
  id: role?.id ?? null,
  nombre: role?.nombre ?? null,
  descripcion: role?.descripcion ?? null,
  permisos: Array.isArray(role?.permisos) ? role.permisos : [],
  estado: role?.estado ?? null,
  updated_at: role?.updated_at ?? null,
});

const getRoleChanges = (before, after) => {
  const changed = {};
  const fields = ['nombre', 'descripcion', 'permisos', 'estado'];

  fields.forEach((field) => {
    const previous = before?.[field];
    const next = after?.[field];
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changed[field] = { before: previous, after: next };
    }
  });

  return changed;
};

const CLIENT_ROLE_NAME = 'cliente';
const CLIENT_ALLOWED_PERMISSIONS = [
  'Cliente',
  'Ver Dashboard',
  'Ver Tienda',
  'Ver Mis Pedidos',
];

const normalizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];

  const normalized = permissions
    .filter((permission) => typeof permission === 'string')
    .map((permission) => permission.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
};

const isClientRoleName = (roleName) =>
  typeof roleName === 'string' && roleName.trim().toLowerCase() === CLIENT_ROLE_NAME;

// Validación intuitiva del nombre de un rol (3-50 caracteres, sin caracteres extraños).
// Devuelve un Error con statusCode 400 cuando algo no es válido, o null cuando el nombre es correcto.
const validateRoleName = (rawName) => {
  const nombre = typeof rawName === 'string' ? rawName.trim() : '';

  if (!nombre) {
    const error = new Error('El nombre del rol es obligatorio.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'required' };
    return error;
  }

  if (nombre.length < 3) {
    const error = new Error('El nombre del rol debe tener al menos 3 caracteres.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'min_length', min: 3, length: nombre.length };
    return error;
  }

  if (nombre.length > 50) {
    const error = new Error('El nombre del rol no puede superar los 50 caracteres.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'max_length', max: 50, length: nombre.length };
    return error;
  }

  // Solo letras (con tildes/ñ), números, espacios, guiones y guion bajo
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s_\-]+$/.test(nombre)) {
    const error = new Error('El nombre del rol solo puede contener letras, números, espacios, guiones o guion bajo.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'invalid_characters' };
    return error;
  }

  return null;
};

const buildDuplicateRoleNameError = (nombre) => {
  const error = new Error(`Ya existe un rol con el nombre "${String(nombre || '').trim()}". Elija un nombre diferente.`);
  error.statusCode = 409;
  error.details = { field: 'nombre', reason: 'duplicate' };
  return error;
};

const validatePermissionsPayload = ({ nextPermissions, roleName }) => {
  if (!Array.isArray(nextPermissions)) return null;

  if (isClientRoleName(roleName)) {
    const invalid = nextPermissions.filter((permission) => !CLIENT_ALLOWED_PERMISSIONS.includes(permission));
    if (invalid.length > 0 || nextPermissions.length === 0) {
      const error = new Error(
        `El rol Cliente solo puede incluir permisos permitidos: ${CLIENT_ALLOWED_PERMISSIONS.join(', ')}`
      );
      error.statusCode = 400;
      error.details = {
        reason: 'cliente_permissions_only',
        allowed: CLIENT_ALLOWED_PERMISSIONS,
        invalid,
      };
      return error;
    }

    return null;
  }

  if (nextPermissions.length === 0) {
    const error = new Error('Cada rol debe mantener al menos un permiso asignado');
    error.statusCode = 400;
    error.details = { reason: 'missing_permissions' };
    return error;
  }

  return null;
};

module.exports = {
  // schema/column ensure
  ensureVentasMoneyColumns,
  ensureProductoImageColumn,
  ensureProductoTipoColumn,
  ensureProductoInsumoMedidaColumns,
  ensureProductoInsumosTable,
  ensureEntregasInsumoProductoCatalogo,
  ensureCategoriaProductCountColumn,
  syncCategoriaProductCount,
  // helpers genericos
  nextNumeroVenta,
  normalizeProductoTipoValue,
  groupRowsBy,
  ensureMotivoEstado,
  checkInactivacionDependencias,
  // auditoria entidades
  ensureProductoAuditTable,
  registerProductoAudit,
  ensureCategoriaAuditTable,
  registerCategoriaAudit,
  ensureClienteAuditTable,
  registerClienteAudit,
  ensureRoleAuditTable,
  registerRoleAudit,
  // tablas usuarios
  ensureUserAuditTable,
  ensureUserSessionTable,
  ensureUserBackupTable,
  ensureUserPasswordHistoryTable,
  ensureUserPasswordResetTable,
  ensureUserLoginAttemptsTable,
  ensureUsuariosPasswordEmailExpiresColumn,
  // helpers usuarios
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
  isUserSessionActive,
  touchUserSession,
  getActiveUserSessionCount,
  getLinkedClienteForUsuario,
  getUserDeletionBlockers,
  buildUserFilterQuery,
  getUserDeletionImpact,
  registerUserAudit,
  toUserSnapshot,
  getUserChanges,
  toRoleSnapshot,
  getRoleChanges,
  CLIENT_ROLE_NAME,
  CLIENT_ALLOWED_PERMISSIONS,
  normalizePermissions,
  isClientRoleName,
  validateRoleName,
  buildDuplicateRoleNameError,
  validatePermissionsPayload,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_BLOCK_DURATION_MS,
  // re-export tradicional usado por entities.models.js
  Auditoria: {
    registerProductoAudit,
    registerCategoriaAudit,
    registerClienteAudit,
  },
};
