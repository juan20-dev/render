/**
 * Modelo Insumos
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const {
  ensureMotivoEstado,
  checkInactivacionDependencias,
  ensureProductoTipoColumn,
  ensureProductoInsumoMedidaColumns,
  ensureEntregasInsumoProductoCatalogo,
} = require('../shared/auditoria');

const Insumos = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT *
      FROM insumos
      ORDER BY
        CASE WHEN LOWER(TRIM(COALESCE(estado, ''))) = 'activo' THEN 0 ELSE 1 END,
        id DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query('SELECT * FROM insumos WHERE id = $1', [id]);
    return result.rows[0];
  },
  create: async (data) => {
    // Validaciones
    const nombre = String(data?.nombre || '').trim();
    if (!nombre) {
      const error = new Error('El nombre del insumo es obligatorio');
      error.statusCode = 400;
      throw error;
    }
    
    // Verificar nombre no duplicado
    const duplicate = await pool.query(
      'SELECT id FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1',
      [nombre]
    );
    if (duplicate.rows[0]) {
      const error = new Error('Ya existe un insumo con ese nombre');
      error.statusCode = 409;
      throw error;
    }
    
    const unidad = String(data?.unidad || '').trim();
    const unidadesValidas = ['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros'];
    if (!unidad || !unidadesValidas.includes(unidad)) {
      const error = new Error(`Unidad inválida. Valores permitidos: ${unidadesValidas.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const cantidad = Number(data?.cantidad) || 0;
    if (cantidad < 0) {
      const error = new Error('La cantidad no puede ser negativa');
      error.statusCode = 400;
      throw error;
    }

    const stockMinimo = Number(data?.stock_minimo) || 10;
    if (stockMinimo < 0) {
      const error = new Error('El stock mínimo no puede ser negativo');
      error.statusCode = 400;
      throw error;
    }

    const estado = String(data?.estado || 'Activo').trim();
    if (!['Activo', 'Inactivo'].includes(estado)) {
      const error = new Error('Estado inválido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    const descripcion = String(data?.descripcion || '').trim() || null;

    const result = await pool.query(
      'INSERT INTO insumos (nombre, descripcion, cantidad, unidad, stock_minimo, estado) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [nombre, descripcion, cantidad, unidad, stockMinimo, estado]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    const current = await Insumos.getById(id);
    if (!current) {
      const error = new Error('Insumo no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const nombre = data.nombre !== undefined ? String(data.nombre).trim() : current.nombre;
    if (!nombre) {
      const error = new Error('El nombre del insumo no puede estar vacío');
      error.statusCode = 400;
      throw error;
    }

    if (data.nombre !== undefined) {
      const duplicate = await pool.query(
        'SELECT id FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) AND id != $2 LIMIT 1',
        [nombre, id]
      );
      if (duplicate.rows[0]) {
        const error = new Error('Ya existe otro insumo con ese nombre');
        error.statusCode = 409;
        throw error;
      }
    }

    const unidad = data.unidad !== undefined ? String(data.unidad).trim() : current.unidad;
    const unidadesValidas2 = ['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros'];
    if (!unidadesValidas2.includes(unidad)) {
      const error = new Error(`Unidad inválida. Valores permitidos: ${unidadesValidas2.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const cantidad = data.cantidad !== undefined ? Number(data.cantidad) : current.cantidad;
    if (cantidad < 0) {
      const error = new Error('La cantidad no puede ser negativa');
      error.statusCode = 400;
      throw error;
    }

    const stockMinimo = data.stock_minimo !== undefined ? Number(data.stock_minimo) : current.stock_minimo;
    if (stockMinimo < 0) {
      const error = new Error('El stock mínimo no puede ser negativo');
      error.statusCode = 400;
      throw error;
    }

    const estado = data.estado !== undefined ? String(data.estado).trim() : current.estado;
    if (!['Activo', 'Inactivo'].includes(estado)) {
      const error = new Error('Estado inválido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    if (estado === 'Inactivo' && current.estado === 'Activo') {
      const entregas = await pool.query('SELECT COUNT(*) FROM entregas_insumos WHERE insumo_id = $1', [id]);
      if (Number(entregas.rows[0].count) > 0) {
        const error = new Error('No se puede desactivar un insumo con entregas registradas');
        error.statusCode = 409;
        throw error;
      }
    }

    const descripcion = data.descripcion !== undefined ? String(data.descripcion).trim() : current.descripcion;

    await pool.query(
      'UPDATE insumos SET nombre = $1, descripcion = $2, cantidad = $3, unidad = $4, stock_minimo = $5, estado = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7',
      [nombre, descripcion || null, cantidad, unidad, stockMinimo, estado, id]
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
    const current = await Insumos.getById(id);
    if (!current) {
      const error = new Error('Insumo no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const entregas = await pool.query('SELECT COUNT(*) FROM entregas_insumos WHERE insumo_id = $1', [id]);
    if (Number(entregas.rows[0].count) > 0) {
      const error = new Error('No se puede eliminar un insumo con entregas registradas. Desactívalo en su lugar.');
      error.statusCode = 409;
      throw error;
    }

    const productos = await pool.query('SELECT COUNT(*) FROM producto_insumos WHERE insumo_id = $1', [id]);
    if (Number(productos.rows[0].count) > 0) {
      const error = new Error('No se puede eliminar un insumo que está asignado a productos');
      error.statusCode = 409;
      throw error;
    }

    await pool.query('DELETE FROM insumos WHERE id = $1', [id]);
    return true;
  },
  getResumenGestion: async () => {
    await ensureProductoTipoColumn();
    await ensureProductoInsumoMedidaColumns();
    await ensureEntregasInsumoProductoCatalogo();
    const result = await pool.query(
      `
        SELECT p.id AS id,
               p.nombre,
               p.stock::numeric AS cantidad,
               'Unidades'::varchar AS unidad,
               p.stock_minimo::numeric AS stock_minimo,
               (
                 SELECT NULLIF(TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, ''))), '')
                 FROM entregas_insumos ei
                 LEFT JOIN usuarios u ON u.id = ei.operario_id
                 WHERE ei.producto_catalogo_id = p.id
                 ORDER BY ei.fecha DESC, ei.hora DESC NULLS LAST, ei.id DESC
                 LIMIT 1
               ) AS operario,
               COALESCE(rc.fecha_ultima::date, p.updated_at::date, p.created_at::date) AS fecha,
               p.id AS producto_catalogo_id,
               c.nombre AS categoria_nombre,
               p.insumo_cantidad_medida AS presentacion_cantidad,
               p.insumo_unidad_medida AS presentacion_unidad,
               'producto_insumo'::varchar AS origen_inventario
        FROM productos p
        LEFT JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN (
          SELECT dc.producto_id,
                 MAX(COALESCE(cp.updated_at, cp.created_at, CURRENT_TIMESTAMP)) AS fecha_ultima
          FROM detalle_compras dc
          INNER JOIN compras cp ON cp.id = dc.compra_id
          WHERE LOWER(TRIM(COALESCE(cp.estado, ''))) = 'recibida'
          GROUP BY dc.producto_id
        ) rc ON rc.producto_id = p.id
        WHERE COALESCE(p.tipo_producto, 'terminado') = 'insumo'
          AND LOWER(TRIM(COALESCE(p.estado, ''))) = 'activo'
        ORDER BY p.nombre
      `
    );
    return result.rows;
  }
};

module.exports = Insumos;
