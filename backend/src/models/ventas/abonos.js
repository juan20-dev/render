/**
 * Modelo Abonos (incluye helper local: ensureAbonosSchema)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const { reserveEntityIdAndCode } = require('../shared/auditoria');

let abonosSchemaEnsured = false;
let abonosSchemaPromise = null;
/** Alinea abonos con db.pgsql: agrega columna `detalle` (TEXT) si la BD es anterior. */
const ensureAbonosSchema = async () => {
  if (abonosSchemaEnsured) return;
  if (!abonosSchemaPromise) {
    abonosSchemaPromise = (async () => {
      await pool.query(`ALTER TABLE abonos ADD COLUMN IF NOT EXISTS detalle TEXT`);
      await pool.query(`ALTER TABLE abonos ADD COLUMN IF NOT EXISTS comprobante_url TEXT`);
      await pool.query(`ALTER TABLE abonos ADD COLUMN IF NOT EXISTS porcentaje_abonado INTEGER`);
    })();
  }
  try {
    await abonosSchemaPromise;
    abonosSchemaEnsured = true;
  } catch (error) {
    abonosSchemaPromise = null;
    throw error;
  }
};

const Abonos = {
  getAll: async () => {
    await ensureAbonosSchema();
    const result = await pool.query(`
      SELECT a.*,
             c.nombre AS cliente_nombre,
             p.total AS total_pedido
      FROM abonos a
      JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN pedidos p ON p.id = a.pedido_id
      ORDER BY a.fecha DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    await ensureAbonosSchema();
    const result = await pool.query(
      `SELECT a.*, p.total AS total_pedido
       FROM abonos a
       LEFT JOIN pedidos p ON p.id = a.pedido_id
       WHERE a.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  getByPedido: async (pedidoId) => {
    await ensureAbonosSchema();
    const result = await pool.query(
      `SELECT a.*, p.total AS total_pedido
       FROM abonos a
       LEFT JOIN pedidos p ON p.id = a.pedido_id
       WHERE a.pedido_id = $1
       ORDER BY a.id ASC`,
      [pedidoId]
    );
    return result.rows;
  },
  create: async (data) => {
    await ensureAbonosSchema();
    const reserved = await reserveEntityIdAndCode(pool, 'public.abonos', 'A');
    const result = await pool.query(
      'INSERT INTO abonos (id, numero_abono, pedido_id, cliente_id, monto, fecha, metodo_pago, estado, detalle, comprobante_url, porcentaje_abonado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
      [
        reserved.id,
        reserved.code,
        data.pedido_id,
        data.cliente_id,
        data.monto,
        data.fecha,
        data.metodo_pago,
        data.estado || 'Registrado',
        data.detalle ?? null,
        data.comprobante_url ?? null,
        data.porcentaje_abonado != null ? Number(data.porcentaje_abonado) : null,
      ]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await ensureAbonosSchema();
    await pool.query(
      `UPDATE abonos SET
         monto = COALESCE($1, monto),
         fecha = COALESCE($2, fecha),
         metodo_pago = COALESCE($3, metodo_pago),
         estado = COALESCE($4, estado),
         detalle = COALESCE($5, detalle),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        data.monto !== undefined ? data.monto : null,
        data.fecha !== undefined ? data.fecha : null,
        data.metodo_pago !== undefined ? data.metodo_pago : null,
        data.estado !== undefined ? data.estado : null,
        data.detalle !== undefined ? data.detalle : null,
        id,
      ]
    );
    return true;
  },
  updateEstado: async (id, estado) => {
    await ensureAbonosSchema();
    await pool.query('UPDATE abonos SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [estado, id]);
    return true;
  },
  /**
   * Liquidacion final del abono cuando el domicilio se entrega: combina la
   * informacion de los abonos previos en `detalle`, eleva el monto a `monto`
   * y mueve el estado a 'Finalizado' para dar cierre.
   */
  updateLiquidacion: async (id, { monto, detalle, estado, porcentaje_abonado }) => {
    await ensureAbonosSchema();
    await pool.query(
      `UPDATE abonos SET
         monto = COALESCE($1, monto),
         detalle = COALESCE($2, detalle),
         estado = COALESCE($3, estado),
         porcentaje_abonado = COALESCE($4, porcentaje_abonado),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        monto !== undefined ? monto : null,
        detalle !== undefined ? detalle : null,
        estado !== undefined ? estado : null,
        porcentaje_abonado !== undefined ? porcentaje_abonado : null,
        id,
      ]
    );
    return true;
  },
  delete: async (id, options = {}) => {
    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (!reason || reason.length < 10 || reason.length > 50) {
      const error = new Error('El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres');
      error.statusCode = 400;
      throw error;
    }
    const result = await pool.query('DELETE FROM abonos WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      const error = new Error('Abono no encontrado');
      error.statusCode = 404;
      throw error;
    }
    return true;
  }
};

module.exports = Abonos;
