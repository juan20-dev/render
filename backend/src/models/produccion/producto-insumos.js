/**
 * Modelo ProductoInsumos (relacion N:N)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const { ensureProductoInsumosTable } = require('../shared/auditoria');

const ProductoInsumos = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT pi.*, p.nombre as producto_nombre, i.nombre as insumo_nombre
      FROM producto_insumos pi
      JOIN productos p ON pi.producto_id = p.id
      JOIN insumos i ON pi.insumo_id = i.id
      ORDER BY p.nombre, i.nombre
    `);
    return result.rows;
  },
  getByProducto: async (productoId) => {
    const result = await pool.query(`
      SELECT pi.*, i.nombre as insumo_nombre, i.cantidad as stock_actual, i.stock_minimo
      FROM producto_insumos pi
      JOIN insumos i ON pi.insumo_id = i.id
      WHERE pi.producto_id = $1
      ORDER BY i.nombre
    `, [productoId]);
    return result.rows;
  },
  getByInsumo: async (insumoId) => {
    const result = await pool.query(`
      SELECT pi.*, p.nombre as producto_nombre
      FROM producto_insumos pi
      JOIN productos p ON pi.producto_id = p.id
      WHERE pi.insumo_id = $1
      ORDER BY p.nombre
    `, [insumoId]);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(
      `SELECT pi.*, p.nombre as producto_nombre, i.nombre as insumo_nombre
       FROM producto_insumos pi
       JOIN productos p ON pi.producto_id = p.id
       JOIN insumos i ON pi.insumo_id = i.id
       WHERE pi.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  create: async (data) => {
    if (!data.producto_id || data.producto_id <= 0) {
      const error = new Error('El ID del producto es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }
    if (!data.insumo_id || data.insumo_id <= 0) {
      const error = new Error('El ID del insumo es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }
    if (!data.cantidad_requerida || data.cantidad_requerida <= 0) {
      const error = new Error('La cantidad requerida debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    if (!data.unidad || !String(data.unidad).trim()) {
      const error = new Error('La unidad es obligatoria');
      error.statusCode = 400;
      throw error;
    }
    const result = await pool.query(
      'INSERT INTO producto_insumos (producto_id, insumo_id, cantidad_requerida, unidad, notas) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [data.producto_id, data.insumo_id, data.cantidad_requerida, data.unidad, data.notas || null]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    if (data.cantidad_requerida !== undefined && data.cantidad_requerida <= 0) {
      const error = new Error('La cantidad requerida debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    if (data.unidad && !String(data.unidad).trim()) {
      const error = new Error('La unidad no puede estar vacía');
      error.statusCode = 400;
      throw error;
    }
    await pool.query(
      'UPDATE producto_insumos SET cantidad_requerida = $1, unidad = $2, notas = $3 WHERE id = $4',
      [data.cantidad_requerida, data.unidad, data.notas || null, id]
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
    const r = await pool.query('DELETE FROM producto_insumos WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) {
      const error = new Error('Receta no encontrada');
      error.statusCode = 404;
      throw error;
    }
    return true;
  }
};

module.exports = ProductoInsumos;
