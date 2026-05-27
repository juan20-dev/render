/**
 * Modelo Compras (incluye helpers locales: ensureComprasSchema, getProveedorActivo, getProductoById)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const { parseMoneyCO } = require('../../controllers/normalizador-http');
const { groupRowsBy, reserveEntityIdAndCode } = require('../shared/auditoria');

const ensureComprasSchema = async () => {
  await pool.query(`
    ALTER TABLE compras
      ADD COLUMN IF NOT EXISTS observaciones TEXT,
      ADD COLUMN IF NOT EXISTS requiere_aprobacion BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS aprobacion_extraordinaria BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS motivo_aprobacion TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_estado_historial (
      id SERIAL PRIMARY KEY,
      compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
      estado_anterior VARCHAR(20),
      estado_nuevo VARCHAR(20) NOT NULL,
      motivo TEXT,
      usuario_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_compras_estado_historial_compra_fecha ON compras_estado_historial(compra_id, created_at DESC)'
  );

  await pool.query(`
    ALTER TABLE detalle_compras
      ADD COLUMN IF NOT EXISTS porcentaje_ganancia NUMERIC(12,2) DEFAULT 0
  `);

  /* Montos en COP pueden superar DECIMAL(10,2); ampliar para compras grandes */
  await pool.query(`
    ALTER TABLE compras
      ALTER COLUMN subtotal TYPE NUMERIC(18,2),
      ALTER COLUMN iva TYPE NUMERIC(18,2),
      ALTER COLUMN total TYPE NUMERIC(18,2)
  `);
  await pool.query(`
    ALTER TABLE detalle_compras
      ALTER COLUMN precio_unitario TYPE NUMERIC(18,2),
      ALTER COLUMN subtotal TYPE NUMERIC(18,2)
  `);
};

const getProveedorActivo = async (proveedorId) => {
  const result = await pool.query('SELECT id, estado FROM proveedores WHERE id = $1', [proveedorId]);
  return result.rows[0] || null;
};

const getProductoById = async (productoId) => {
  const result = await pool.query(
    `SELECT id, nombre, precio, stock, estado,
            COALESCE(tipo_producto, 'terminado') AS tipo_producto
     FROM productos WHERE id = $1`,
    [productoId]
  );
  return result.rows[0] || null;
};

const Compras = {
  getAll: async () => {
    await ensureComprasSchema();
    const result = await pool.query(`
      SELECT c.*, p.nombre_empresa, p.nombre as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.proveedor_id = p.id
      ORDER BY
        CASE WHEN LOWER(TRIM(COALESCE(c.estado, ''))) = 'pendiente' THEN 0 ELSE 1 END,
        c.id DESC
    `);

    const compraIds = result.rows.map((compra) => compra.id);
    if (compraIds.length > 0) {
      const detalles = await pool.query(
        `SELECT dc.*, p.nombre AS producto
         FROM detalle_compras dc
         JOIN productos p ON p.id = dc.producto_id
         WHERE dc.compra_id = ANY($1::int[])
         ORDER BY dc.compra_id ASC, dc.id ASC`,
        [compraIds]
      );

      const detallesPorCompra = groupRowsBy(detalles.rows, 'compra_id');
      for (const compra of result.rows) {
        compra.items = detallesPorCompra.get(compra.id) || [];
      }
    }

    return result.rows;
  },
  getById: async (id) => {
    await ensureComprasSchema();
    const result = await pool.query(`
      SELECT c.*, p.nombre_empresa, p.nombre as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.proveedor_id = p.id
      WHERE c.id = $1
    `, [id]);
    return result.rows[0];
  },
  getEstadoHistorial: async (compraId) => {
    await ensureComprasSchema();
    const result = await pool.query(
      `SELECT h.*, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.email AS usuario_email
       FROM compras_estado_historial h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.compra_id = $1
       ORDER BY h.created_at DESC, h.id DESC`,
      [compraId]
    );
    return result.rows;
  },
  getDetalles: async (compraId) => {
    await ensureComprasSchema();
    const result = await pool.query(`
      SELECT dc.*, pr.nombre as producto_nombre
      FROM detalle_compras dc
      JOIN productos pr ON dc.producto_id = pr.id
      WHERE dc.compra_id = $1
      ORDER BY dc.id ASC
    `, [compraId]);
    return result.rows;
  },
  create: async (data, options = {}) => {
    await ensureComprasSchema();
    const reserved = await reserveEntityIdAndCode(pool, 'public.compras', 'C');

    if (!data.proveedor_id) {
      const error = new Error('El proveedor es obligatorio para crear la compra');
      error.statusCode = 400;
      throw error;
    }

    const proveedor = await getProveedorActivo(data.proveedor_id);
    if (!proveedor) {
      const error = new Error('Proveedor no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (String(proveedor.estado).toLowerCase() !== 'activo') {
      const error = new Error('El proveedor debe estar activo para registrar una compra');
      error.statusCode = 409;
      throw error;
    }

    const total = Number(data.total || 0);
    const requiereAprobacion = total >= 10000;
    const aprobacionExtraordinaria = !requiereAprobacion;
    const motivoAprobacion = typeof data.motivo_aprobacion === 'string' ? data.motivo_aprobacion.trim() : '';

    const motivoAprobacionFinal = requiereAprobacion
      ? motivoAprobacion || 'Requiere aprobación manual por total mayor o igual a 10000'
      : 'Aprobación automática por total menor a 10000';

    const result = await pool.query(
      `INSERT INTO compras (
         id, numero_compra, proveedor_id, fecha, fecha_creacion, subtotal, iva, total, estado, observaciones, requiere_aprobacion, aprobacion_extraordinaria, motivo_aprobacion
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        reserved.id,
        reserved.code,
        data.proveedor_id,
        data.fecha,
        data.fecha_creacion || data.fecha || new Date().toISOString().split('T')[0],
        data.subtotal,
        data.iva,
        data.total,
        'Pendiente',
        data.observaciones ?? null,
        requiereAprobacion,
        aprobacionExtraordinaria,
        motivoAprobacionFinal,
      ]
    );

    await pool.query(
      `INSERT INTO compras_estado_historial (compra_id, estado_anterior, estado_nuevo, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        result.rows[0].id,
        null,
        'Pendiente',
        requiereAprobacion
          ? 'Compra creada. Requiere aprobación por total mayor o igual a 10000.'
          : 'Compra creada con aprobación automática por total menor a 10000.',
        options.usuarioId ?? null,
      ]
    );

    return result.rows[0].id;
  },
  addDetalle: async (compraId, productoId, cantidad, precioUnitario, options = {}) => {
    await ensureComprasSchema();

    const parsedCantidad = Number(cantidad);
    const parsedPrecioSolicitado = Number(precioUnitario);

    if (!Number.isFinite(parsedCantidad) || parsedCantidad <= 0) {
      const error = new Error('La cantidad debe ser mayor que 0');
      error.statusCode = 400;
      throw error;
    }

    if (!Number.isFinite(parsedPrecioSolicitado) || parsedPrecioSolicitado <= 0) {
      const error = new Error('El precio unitario debe ser válido y mayor que 0');
      error.statusCode = 400;
      throw error;
    }

    const productsInCompra = await pool.query(
      'SELECT COUNT(*)::int AS total FROM detalle_compras WHERE compra_id = $1',
      [compraId]
    );
    if (Number(productsInCompra.rows[0]?.total || 0) >= 50) {
      const error = new Error('No se pueden registrar mas de 50 productos por compra');
      error.statusCode = 409;
      throw error;
    }

    const producto = await getProductoById(productoId);
    if (!producto) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (String(producto.estado || '').toLowerCase() !== 'activo') {
      const error = new Error('No se puede comprar un producto inactivo');
      error.statusCode = 409;
      throw error;
    }

    const tipoProd = String(producto.tipo_producto || '').toLowerCase();
    if (tipoProd === 'preparacion' || tipoProd.includes('prepar')) {
      const error = new Error('No se pueden registrar compras de productos tipo preparación');
      error.statusCode = 400;
      throw error;
    }

    const pctRaw = options?.porcentajeGanancia;
    let parsedPct = pctRaw === undefined || pctRaw === null || pctRaw === '' ? 0 : Number(pctRaw);
    if (String(producto.tipo_producto || '').toLowerCase() === 'insumo') {
      parsedPct = 0;
    } else if (!Number.isFinite(parsedPct) || parsedPct < 0 || parsedPct > 1000) {
      const error = new Error('El porcentaje de ganancia debe ser un número entre 0 y 1000');
      error.statusCode = 400;
      throw error;
    }

    const subtotal = parsedCantidad * parsedPrecioSolicitado;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'INSERT INTO detalle_compras (compra_id, producto_id, cantidad, precio_unitario, subtotal, porcentaje_ganancia) VALUES ($1, $2, $3, $4, $5, $6)',
        [compraId, productoId, parsedCantidad, parsedPrecioSolicitado, subtotal, parsedPct]
      );

      await client.query(
        `UPDATE compras
         SET subtotal = COALESCE((SELECT SUM(subtotal) FROM detalle_compras WHERE compra_id = $1), 0),
             iva = COALESCE((SELECT SUM(subtotal) FROM detalle_compras WHERE compra_id = $1), 0) * 0.19,
             total = COALESCE((SELECT SUM(subtotal) FROM detalle_compras WHERE compra_id = $1), 0) * 1.19,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [compraId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return true;
  },
  update: async (id, data) => {
    await ensureComprasSchema();
    await pool.query(
      'UPDATE compras SET numero_compra = $1, proveedor_id = $2, fecha = $3, subtotal = $4, iva = $5, total = $6, estado = $7, observaciones = $8, aprobacion_extraordinaria = $9, motivo_aprobacion = $10 WHERE id = $11',
      [data.numero_compra, data.proveedor_id, data.fecha, data.subtotal, data.iva, data.total, data.estado, data.observaciones ?? null, data.aprobacion_extraordinaria ?? false, data.motivo_aprobacion ?? null, id]
    );
    return true;
  },
  updateStatus: async (id, data = {}, options = {}) => {
    await ensureComprasSchema();

    const client = await pool.connect();

    const normalizeStatus = (value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'pendiente') return 'Pendiente';
      if (normalized === 'recibida' || normalized === 'completada') return 'Recibida';
      if (normalized === 'cancelada' || normalized === 'cancelado' || normalized === 'anulada') return 'Cancelada';
      return null;
    };

    const applyReceiptStock = async (compraId) => {
      const detalleResult = await client.query(
        `SELECT dc.producto_id,
                dc.cantidad,
                dc.precio_unitario,
                COALESCE(dc.porcentaje_ganancia, 0)::numeric AS pct,
                COALESCE(p.tipo_producto, 'terminado') AS tipo_producto
         FROM detalle_compras dc
         JOIN productos p ON p.id = dc.producto_id
         WHERE dc.compra_id = $1
         ORDER BY dc.id ASC`,
        [compraId]
      );

      if (!detalleResult.rows.length) {
        const error = new Error('La compra no tiene productos para recibir');
        error.statusCode = 409;
        throw error;
      }

      for (const row of detalleResult.rows) {
        const costo = Number(row.precio_unitario);
        const pct = Number(row.pct);
        const precioVenta = Math.round(costo * (1 + (Number.isFinite(pct) ? pct : 0) / 100));
        const esPreparacion = String(row.tipo_producto || '').toLowerCase() === 'preparacion';
        await client.query(
          `UPDATE productos
             SET stock = CASE WHEN $4 THEN 0 ELSE COALESCE(stock, 0) + $1 END,
                 precio = $2,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [Number(row.cantidad || 0), precioVenta, row.producto_id, esPreparacion]
        );
      }
    };

    const revertReceiptStock = async (compraId) => {
      const detalleResult = await client.query(
        `SELECT dc.producto_id,
                dc.cantidad
         FROM detalle_compras dc
         WHERE dc.compra_id = $1
         ORDER BY dc.id ASC`,
        [compraId]
      );

      if (!detalleResult.rows.length) {
        return;
      }

      for (const row of detalleResult.rows) {
        await client.query(
          `UPDATE productos
             SET stock = GREATEST(0, COALESCE(stock, 0) - $1),
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [Number(row.cantidad || 0), row.producto_id]
        );
      }
    };

    try {
      await client.query('BEGIN');

      const compraResult = await client.query('SELECT * FROM compras WHERE id = $1 FOR UPDATE', [id]);
      const compra = compraResult.rows[0];
      if (!compra) {
        const error = new Error('Compra no encontrada');
        error.statusCode = 404;
        throw error;
      }

      const requestedStatus = normalizeStatus(data.estado);
      if (!requestedStatus) {
        const error = new Error('Estado invalido. Valores permitidos: Pendiente, Recibida, Cancelada');
        error.statusCode = 400;
        throw error;
      }

      const previousStatus = normalizeStatus(compra.estado);
      if (previousStatus === requestedStatus) {
        return compra;
      }

      const motivoCancelacion = typeof data.motivo_cancelacion === 'string'
        ? data.motivo_cancelacion.trim()
        : (typeof data.motivo === 'string' ? data.motivo.trim() : '');

      if (requestedStatus === 'Cancelada' && (!motivoCancelacion || motivoCancelacion.length < 10)) {
        const error = new Error('El motivo de cancelación es obligatorio y debe tener mínimo 10 caracteres');
        error.statusCode = 400;
        throw error;
      }

      const nextObservaciones = (() => {
        if (!motivoCancelacion || requestedStatus !== 'Cancelada') return compra.observaciones;
        const marker = 'Motivo cancelación';
        const previous = typeof compra.observaciones === 'string' ? compra.observaciones.trim() : '';
        const entry = `${marker}: ${motivoCancelacion}`;
        return previous ? `${previous}\n${entry}` : entry;
      })();

      if (previousStatus !== 'Recibida' && requestedStatus === 'Recibida') {
        await applyReceiptStock(id);
      }
      if (previousStatus === 'Recibida' && requestedStatus !== 'Recibida') {
        await revertReceiptStock(id);
      }

      await client.query(
        `UPDATE compras
         SET estado = $1,
             observaciones = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [requestedStatus, nextObservaciones ?? null, id]
      );

      const updated = await client.query('SELECT * FROM compras WHERE id = $1', [id]);

      await client.query(
        `INSERT INTO compras_estado_historial (compra_id, estado_anterior, estado_nuevo, motivo, usuario_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          previousStatus,
          requestedStatus,
          requestedStatus === 'Cancelada'
            ? motivoCancelacion || 'Cambio de estado a Cancelada'
            : requestedStatus === 'Recibida'
            ? 'Compra recibida completamente y stock actualizado.'
            : 'Cambio de estado manual.',
          options.usuarioId ?? null,
        ]
      );

      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  delete: async (id) => {
    await ensureComprasSchema();
    await pool.query('DELETE FROM detalle_compras WHERE compra_id = $1', [id]);
    await pool.query('DELETE FROM compras WHERE id = $1', [id]);
    return true;
  }
};

module.exports = Compras;
