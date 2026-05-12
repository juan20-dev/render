/**
 * Modelo EntregasInsumos
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const { ensureMotivoEstado, ensureEntregasInsumoProductoCatalogo } = require('../shared/auditoria');
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
  getAll: async () => {
    await ensureEntregasInsumoProductoCatalogo();
    const result = await pool.query(`
      SELECT ei.*, COALESCE(i.nombre, pr.nombre) AS insumo_nombre,
             CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) AS operario_nombre
      FROM entregas_insumos ei
      LEFT JOIN insumos i ON ei.insumo_id = i.id
      LEFT JOIN productos pr ON pr.id = ei.producto_catalogo_id
      LEFT JOIN usuarios u ON ei.operario_id = u.id
      ORDER BY ei.fecha DESC
    `);
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
    if (!data.numero_entrega || !String(data.numero_entrega).trim()) {
      const error = new Error('El número de entrega es obligatorio');
      error.statusCode = 400;
      throw error;
    }
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

      if (target.kind === 'producto') {
        await assertProductoInsumoActivo(client, target.id);
        const result = await client.query(
          `INSERT INTO entregas_insumos (numero_entrega, insumo_id, producto_catalogo_id, cantidad, unidad, operario_id, fecha, hora)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            data.numero_entrega,
            target.id,
            cantidad,
            unidad,
            data.operario_id,
            data.fecha,
            data.hora || null,
          ]
        );
        const up = await client.query(
          `UPDATE productos SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 RETURNING id`,
          [delta, target.id]
        );
        if (up.rowCount === 0) {
          const err = new Error('No se pudo actualizar el stock del producto insumo');
          err.statusCode = 500;
          throw err;
        }
        await client.query('COMMIT');
        return result.rows[0].id;
      }

      const insumoId = target.id;
      const result = await client.query(
        'INSERT INTO entregas_insumos (numero_entrega, insumo_id, producto_catalogo_id, cantidad, unidad, operario_id, fecha, hora) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7) RETURNING id',
        [data.numero_entrega, insumoId, cantidad, unidad, data.operario_id, data.fecha, data.hora || null]
      );
      await client.query(
        'UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [cantidad, insumoId]
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
      await client.query('SELECT id FROM entregas_insumos WHERE id = $1 FOR UPDATE', [id]);

      if (targetsEqual(oldTarget, newTarget)) {
        if (oldTarget.kind === 'producto') {
          const d = deltaNew - deltaOld;
          if (d !== 0) {
            const up = await client.query(
              `UPDATE productos SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2 AND COALESCE(stock, 0) + $1 >= 0 RETURNING id`,
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
        } else {
          const d = Number(cantidad) - Number(current.cantidad);
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
            `UPDATE productos SET stock = COALESCE(stock, 0) - $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND COALESCE(stock, 0) >= $1 RETURNING id`,
            [deltaOld, oldTarget.id]
          );
          if (rev.rowCount === 0) {
            const err = new Error(
              'No se puede actualizar la entrega: el inventario del insumo original quedaría negativo'
            );
            err.statusCode = 409;
            throw err;
          }
        } else {
          const rev = await client.query(
            `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) - $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND COALESCE(cantidad, 0) >= $1 RETURNING id`,
            [deltaOld, oldTarget.id]
          );
          if (rev.rowCount === 0) {
            const err = new Error(
              'No se puede actualizar la entrega: el inventario del insumo original quedaría negativo'
            );
            err.statusCode = 409;
            throw err;
          }
        }

        if (newTarget.kind === 'producto') {
          await assertProductoInsumoActivo(client, newTarget.id);
          const add = await client.query(
            `UPDATE productos SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
            [deltaNew, newTarget.id]
          );
          if (add.rowCount === 0) {
            const err = new Error('Insumo destino no encontrado');
            err.statusCode = 404;
            throw err;
          }
        } else {
          const add = await client.query(
            `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
            [cantidad, newTarget.id]
          );
          if (add.rowCount === 0) {
            const err = new Error('Insumo destino no encontrado');
            err.statusCode = 404;
            throw err;
          }
        }
      }

      const insumoCol = newTarget.kind === 'insumo' ? newTarget.id : null;
      const productoCol = newTarget.kind === 'producto' ? newTarget.id : null;

      await client.query(
        'UPDATE entregas_insumos SET insumo_id = $1, producto_catalogo_id = $2, cantidad = $3, unidad = $4, operario_id = $5, fecha = $6, hora = $7 WHERE id = $8',
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
  delete: async (id) => {
    await ensureEntregasInsumoProductoCatalogo();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query('SELECT * FROM entregas_insumos WHERE id = $1 FOR UPDATE', [id]);
      if (!row.rows[0]) {
        await client.query('ROLLBACK');
        const error = new Error('Entrega no encontrada');
        error.statusCode = 404;
        throw error;
      }
      const e = row.rows[0];
      const qty = cantidadStockDelta(e.cantidad);
      const target = resolveEntregaTargetFromPayload({}, e);

      if (target.kind === 'producto') {
        const sub = await client.query(
          `UPDATE productos SET stock = COALESCE(stock, 0) - $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND COALESCE(stock, 0) >= $1 RETURNING id`,
          [qty, target.id]
        );
        if (sub.rowCount === 0) {
          await client.query('ROLLBACK');
          const err = new Error(
            'No se puede eliminar la entrega: el inventario del insumo quedaría negativo'
          );
          err.statusCode = 409;
          throw err;
        }
      } else {
        const sub = await client.query(
          `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) - $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND COALESCE(cantidad, 0) >= $1 RETURNING id`,
          [Number(e.cantidad), e.insumo_id]
        );
        if (sub.rowCount === 0) {
          await client.query('ROLLBACK');
          const err = new Error(
            'No se puede eliminar la entrega: el inventario del insumo quedaría negativo'
          );
          err.statusCode = 409;
          throw err;
        }
      }
      await client.query('DELETE FROM entregas_insumos WHERE id = $1', [id]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = EntregasInsumos;
