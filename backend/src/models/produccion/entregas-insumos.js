/**
 * Modelo EntregasInsumos
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const {
  ensureMotivoEstado,
  ensureEntregasInsumoProductoCatalogo,
  reserveEntityIdAndCode,
} = require('../shared/auditoria');
const InsumosModel = require('./insumos');

const BASE = Number(InsumosModel.INSUMO_VISTA_DESDE_PRODUCTO_ID_BASE) || 900000000;

const cantidadStockDelta = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
};

/** Resuelve destino de stock desde body: producto (inventario catálogo) o fila legacy insumos. */
function resolveEntregaTargetFromPayload(data, fallbackRow = null) {
  const rawPc = data.producto_catalogo_id ?? data.productoCatalogoId;
  let pid = Number(rawPc);
  if (Number.isFinite(pid) && pid > 0) {
    return { kind: 'producto', id: pid };
  }
  const rawI = data.insumo_id ?? data.insumoId;
  let insId = Number(rawI);
  if (Number.isFinite(insId) && insId >= BASE) {
    return { kind: 'producto', id: insId - BASE };
  }
  if (Number.isFinite(insId) && insId > 0) {
    return { kind: 'insumo', id: insId };
  }
  if (fallbackRow) {
    if (fallbackRow.producto_catalogo_id != null && fallbackRow.producto_catalogo_id !== '') {
      const p2 = Number(fallbackRow.producto_catalogo_id);
      if (Number.isFinite(p2) && p2 > 0) return { kind: 'producto', id: p2 };
    }
    const i2 = Number(fallbackRow.insumo_id);
    if (Number.isFinite(i2) && i2 > 0) return { kind: 'insumo', id: i2 };
  }
  return { kind: null };
}

const targetsEqual = (a, b) => a && b && a.kind === b.kind && a.id === b.id;

async function assertProductoInsumoActivo(client, productoId) {
  const r = await client.query(
    `SELECT id, nombre FROM productos
     WHERE id = $1
       AND COALESCE(tipo_producto, 'terminado') = 'insumo'
       AND LOWER(TRIM(COALESCE(estado, ''))) = 'activo'`,
    [productoId]
  );
  if (!r.rows[0]) {
    const err = new Error('El producto insumo no existe, no es tipo insumo o no está activo');
    err.statusCode = 400;
    throw err;
  }
  return r.rows[0];
}

const EntregasInsumos = {
  getAll: async (options = {}) => {
    await ensureEntregasInsumoProductoCatalogo();
    const operarioId = Number(options.operarioId);
    const filterProductor = Number.isFinite(operarioId) && operarioId > 0;
    const params = filterProductor ? [operarioId] : [];
    const result = await pool.query(
      `
      SELECT ei.*, COALESCE(i.nombre, pr.nombre) AS insumo_nombre,
             CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS operario_nombre
      FROM entregas_insumos ei
      LEFT JOIN insumos i ON ei.insumo_id = i.id
      LEFT JOIN productos pr ON pr.id = ei.producto_catalogo_id
      LEFT JOIN usuarios u ON ei.operario_id = u.id
      ${filterProductor ? 'WHERE ei.operario_id = $1' : ''}
      ORDER BY ei.fecha DESC, ei.id DESC
    `,
      params
    );
    return result.rows;
  },
  getById: async (id) => {
    await ensureEntregasInsumoProductoCatalogo();
    const result = await pool.query(
      `
      SELECT ei.*, COALESCE(i.nombre, pr.nombre) AS insumo_nombre,
             CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS operario_nombre
      FROM entregas_insumos ei
      LEFT JOIN insumos i ON ei.insumo_id = i.id
      LEFT JOIN productos pr ON pr.id = ei.producto_catalogo_id
      LEFT JOIN usuarios u ON ei.operario_id = u.id
      WHERE ei.id = $1
    `,
      [id]
    );
    return result.rows[0];
  },
  create: async (data) => {
    const cantidad = Number(data?.cantidad) || 0;
    if (cantidad <= 0) {
      const error = new Error('La cantidad debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    const delta = cantidadStockDelta(cantidad);
    if (delta <= 0) {
      const error = new Error('La cantidad debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    const unidad = String(data?.unidad || '').trim();
    const unidadesValidas = ['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros'];
    if (!unidad || !unidadesValidas.includes(unidad)) {
      const error = new Error(`Unidad inválida. Valores permitidos: ${unidadesValidas.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
    if (!data.operario_id || data.operario_id <= 0) {
      const error = new Error('El productor es obligatorio');
      error.statusCode = 400;
      throw error;
    }
    if (!data.fecha) {
      const error = new Error('La fecha es obligatoria');
      error.statusCode = 400;
      throw error;
    }

    await ensureEntregasInsumoProductoCatalogo();
    const target = resolveEntregaTargetFromPayload(data);
    if (!target.kind) {
      const error = new Error('Debe indicar un insumo del catálogo (producto tipo insumo) o un insumo legacy válido');
      error.statusCode = 400;
      throw error;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reserved = await reserveEntityIdAndCode(client, 'public.entregas_insumos', 'E');

      if (target.kind === 'producto') {
        await assertProductoInsumoActivo(client, target.id);
        const st = await client.query(`SELECT stock FROM productos WHERE id = $1 FOR UPDATE`, [target.id]);
        const have = Number(st.rows[0]?.stock ?? 0);
        if (have < delta) {
          const err = new Error(
            `Stock insuficiente en almacén para esta entrega (disponible ${have}, solicitado ${delta})`
          );
          err.statusCode = 409;
          throw err;
        }
        const result = await client.query(
          `INSERT INTO entregas_insumos (id, numero_entrega, insumo_id, producto_catalogo_id, cantidad, unidad, operario_id, fecha, hora)
           VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            reserved.id,
            reserved.code,
            target.id,
            cantidad,
            unidad,
            data.operario_id,
            data.fecha,
            data.hora || null,
          ]
        );
        const up = await client.query(
          `UPDATE productos SET stock = COALESCE(stock, 0) - $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND COALESCE(stock, 0) >= $1 RETURNING id`,
          [delta, target.id]
        );
        if (up.rowCount === 0) {
          const err = new Error('Stock insuficiente para registrar la entrega');
          err.statusCode = 409;
          throw err;
        }
        await client.query('COMMIT');
        return result.rows[0].id;
      }

      const insumoId = target.id;
      const sti = await client.query(`SELECT cantidad FROM insumos WHERE id = $1 FOR UPDATE`, [insumoId]);
      const haveI = Number(sti.rows[0]?.cantidad ?? 0);
      if (haveI < delta) {
        const err = new Error(
          `Stock insuficiente en almacén para esta entrega (disponible ${haveI}, solicitado ${delta})`
        );
        err.statusCode = 409;
        throw err;
      }
      const result = await client.query(
        'INSERT INTO entregas_insumos (id, numero_entrega, insumo_id, producto_catalogo_id, cantidad, unidad, operario_id, fecha, hora) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8) RETURNING id',
        [reserved.id, reserved.code, insumoId, cantidad, unidad, data.operario_id, data.fecha, data.hora || null]
      );
      await client.query(
        'UPDATE insumos SET cantidad = COALESCE(cantidad, 0) - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND COALESCE(cantidad, 0) >= $1',
        [delta, insumoId]
      );
      await client.query('COMMIT');
      return result.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  update: async (id, data) => {
    const current = await EntregasInsumos.getById(id);
    if (!current) {
      const error = new Error('Entrega no encontrada');
      error.statusCode = 404;
      throw error;
    }
    if (current.anulada === true || current.anulada === 't') {
      const error = new Error('La entrega está anulada y no puede modificarse');
      error.statusCode = 409;
      throw error;
    }
    const cantidad = data.cantidad !== undefined ? Number(data.cantidad) : current.cantidad;
    if (cantidad <= 0) {
      const error = new Error('La cantidad debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    const deltaNew = cantidadStockDelta(cantidad);
    const deltaOld = cantidadStockDelta(current.cantidad);
    if (deltaNew <= 0) {
      const error = new Error('La cantidad debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    const unidad = data.unidad !== undefined ? String(data.unidad).trim() : current.unidad;
    const unidadesValidas = ['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros'];
    if (!unidadesValidas.includes(unidad)) {
      const error = new Error(`Unidad inválida. Valores permitidos: ${unidadesValidas.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
    const operarioId = data.operario_id !== undefined ? data.operario_id : current.operario_id;
    if (!operarioId || operarioId <= 0) {
      const error = new Error('El productor es obligatorio');
      error.statusCode = 400;
      throw error;
    }

    await ensureEntregasInsumoProductoCatalogo();
    const oldTarget = resolveEntregaTargetFromPayload({}, current);
    const newTarget = resolveEntregaTargetFromPayload(data, current);
    if (!newTarget.kind) {
      const error = new Error('El insumo es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query(
        `SELECT id FROM entregas_insumos WHERE id = $1 AND COALESCE(anulada, FALSE) = FALSE FOR UPDATE`,
        [id]
      );
      if (lock.rowCount === 0) {
        await client.query('ROLLBACK');
        const err = new Error('Entrega no encontrada o anulada');
        err.statusCode = 404;
        throw err;
      }

      if (targetsEqual(oldTarget, newTarget)) {
        if (oldTarget.kind === 'producto') {
          const adj = deltaOld - deltaNew;
          if (adj !== 0) {
            const up = await client.query(
              `UPDATE productos SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2 AND COALESCE(stock, 0) + $1 >= 0 RETURNING id`,
              [adj, oldTarget.id]
            );
            if (up.rowCount === 0) {
              const err = new Error(
                'No se puede actualizar la entrega: el inventario del insumo quedaría negativo'
              );
              err.statusCode = 409;
              throw err;
            }
          }
        } else {
          const d = deltaOld - deltaNew;
          if (d !== 0) {
            const up = await client.query(
              `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2 AND COALESCE(cantidad, 0) + $1 >= 0 RETURNING id`,
              [d, oldTarget.id]
            );
            if (up.rowCount === 0) {
              const err = new Error(
                'No se puede actualizar la entrega: el inventario del insumo quedaría negativo'
              );
              err.statusCode = 409;
              throw err;
            }
          }
        }
      } else {
        if (oldTarget.kind === 'producto') {
          const rev = await client.query(
            `UPDATE productos SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 RETURNING id`,
            [deltaOld, oldTarget.id]
          );
          if (rev.rowCount === 0) {
            const err = new Error('No se puede actualizar la entrega: producto insumo no encontrado');
            err.statusCode = 404;
            throw err;
          }
        } else {
          const rev = await client.query(
            `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 RETURNING id`,
            [deltaOld, oldTarget.id]
          );
          if (rev.rowCount === 0) {
            const err = new Error('No se puede actualizar la entrega: insumo original no encontrado');
            err.statusCode = 404;
            throw err;
          }
        }

        if (newTarget.kind === 'producto') {
          await assertProductoInsumoActivo(client, newTarget.id);
          const add = await client.query(
            `UPDATE productos SET stock = COALESCE(stock, 0) - $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND COALESCE(stock, 0) >= $1 RETURNING id`,
            [deltaNew, newTarget.id]
          );
          if (add.rowCount === 0) {
            const err = new Error('Stock insuficiente para el insumo destino');
            err.statusCode = 409;
            throw err;
          }
        } else {
          const add = await client.query(
            `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) - $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND COALESCE(cantidad, 0) >= $1 RETURNING id`,
            [deltaNew, newTarget.id]
          );
          if (add.rowCount === 0) {
            const err = new Error('Stock insuficiente para el insumo destino');
            err.statusCode = 409;
            throw err;
          }
        }
      }

      const insumoCol = newTarget.kind === 'insumo' ? newTarget.id : null;
      const productoCol = newTarget.kind === 'producto' ? newTarget.id : null;

      await client.query(
        'UPDATE entregas_insumos SET insumo_id = $1, producto_catalogo_id = $2, cantidad = $3, unidad = $4, operario_id = $5, fecha = $6, hora = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8',
        [
          insumoCol,
          productoCol,
          cantidad,
          unidad,
          operarioId,
          data.fecha || current.fecha,
          data.hora || current.hora,
          id,
        ]
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  /** Marca la entrega como anulada (no borra el registro) y restaura stock en almacén. */
  anular: async (id, motivoRaw) => {
    const motivo = ensureMotivoEstado(motivoRaw, 10, 50);
    await ensureEntregasInsumoProductoCatalogo();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query(`SELECT * FROM entregas_insumos WHERE id = $1 FOR UPDATE`, [id]);
      if (!row.rows[0]) {
        await client.query('ROLLBACK');
        const error = new Error('Entrega no encontrada');
        error.statusCode = 404;
        throw error;
      }
      const e = row.rows[0];
      const wasAnulada = e.anulada === true || e.anulada === 't';
      if (wasAnulada) {
        await client.query('ROLLBACK');
        const error = new Error('La entrega ya está anulada');
        error.statusCode = 409;
        throw error;
      }
      const deltaEntrega = cantidadStockDelta(e.cantidad);
      const target = resolveEntregaTargetFromPayload({}, e);

      if (target.kind === 'producto') {
        const sub = await client.query(
          `UPDATE productos SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 RETURNING id`,
          [deltaEntrega, target.id]
        );
        if (sub.rowCount === 0) {
          await client.query('ROLLBACK');
          const err = new Error('No se puede anular la entrega: producto insumo no encontrado');
          err.statusCode = 404;
          throw err;
        }
      } else if (target.kind === 'insumo') {
        const sub = await client.query(
          `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 RETURNING id`,
          [deltaEntrega, target.id]
        );
        if (sub.rowCount === 0) {
          await client.query('ROLLBACK');
          const err = new Error('No se puede anular la entrega: insumo no encontrado');
          err.statusCode = 404;
          throw err;
        }
      }

      await client.query(
        `UPDATE entregas_insumos
         SET anulada = TRUE, motivo_anulacion = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [motivo, id]
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  /** @deprecated Usar anular; conservado por compatibilidad con DELETE antiguo. */
  delete: async (id, motivoRaw) => EntregasInsumos.anular(id, motivoRaw),
};

module.exports = EntregasInsumos;
