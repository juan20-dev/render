/**
 * Modelo Pedidos
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const { parseMoneyCO } = require('../../controllers/normalizador-http');
const { ensureMotivoEstado } = require('../shared/auditoria');
const Produccion = require('../produccion/produccion');

const Pedidos = {
  getAll: async (estado) => {
    try {
      await Produccion.repairPedidosConOrdenProduccionCompletada();
      if (estado && String(estado).trim()) {
        const result = await pool.query(`
          SELECT p.*, 
                 CONCAT(c.nombre, ' ', c.apellido) as cliente,
                 c.email,
                 COALESCE(COUNT(dp.id), 0) as productos
          FROM pedidos p
          JOIN clientes c ON p.cliente_id = c.id
          LEFT JOIN detalle_pedidos dp ON p.id = dp.pedido_id
          WHERE LOWER(TRIM(p.estado)) = LOWER(TRIM($1))
          GROUP BY p.id, c.nombre, c.apellido, c.email
          ORDER BY p.fecha DESC
        `, [String(estado).trim()]);
        return result.rows;
      }

      const result = await pool.query(`
        SELECT p.*, 
               CONCAT(c.nombre, ' ', c.apellido) as cliente,
               c.email,
               COALESCE(COUNT(dp.id), 0) as productos
        FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id
        LEFT JOIN detalle_pedidos dp ON p.id = dp.pedido_id
        GROUP BY p.id, c.nombre, c.apellido, c.email
        ORDER BY p.fecha DESC
      `);
      return result.rows;
    } catch (error) {
      error.statusCode = error.statusCode || 500;
      throw error;
    }
  },
  getById: async (id) => {
    const result = await pool.query(`
      SELECT p.*, 
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.email
      FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id
      WHERE p.id = $1
    `, [id]);
    return result.rows[0];
  },
  getByCliente: async (clienteId, estado) => {
    if (estado && String(estado).trim()) {
      const result = await pool.query(`
        SELECT p.*, 
               CONCAT(c.nombre, ' ', c.apellido) as cliente,
               c.email
        FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id
        WHERE p.cliente_id = $1
          AND LOWER(TRIM(p.estado)) = LOWER(TRIM($2))
        ORDER BY p.fecha DESC, p.id DESC
      `, [clienteId, String(estado).trim()]);
      return result.rows;
    }

    const result = await pool.query(`
      SELECT p.*, 
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.email
      FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id
      WHERE p.cliente_id = $1
      ORDER BY p.fecha DESC, p.id DESC
    `, [clienteId]);
    return result.rows;
  },
  getDetalles: async (pedidoId) => {
    const result = await pool.query(`
      SELECT dp.*, pr.nombre as producto_nombre
      FROM detalle_pedidos dp
      JOIN productos pr ON dp.producto_id = pr.id
      WHERE dp.pedido_id = $1
    `, [pedidoId]);
    return result.rows;
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO pedidos (numero_pedido, cliente_id, fecha, fecha_entrega, detalles, direccion, telefono, total, estado, metodo_pago, esquema_abono, monto_abonado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
      [
        data.numero_pedido,
        data.cliente_id,
        data.fecha,
        data.fecha_entrega,
        data.detalles,
        data.direccion || null,
        data.telefono || null,
        data.total || 0,
        data.estado || 'Pendiente',
        data.metodo_pago || 'Efectivo',
        data.esquema_abono || '100%',
        data.monto_abonado || 0,
      ]
    );
    return result.rows[0].id;
  },
  addDetalle: async (pedidoId, productoId, cantidad, precioUnitario) => {
    const subtotal = cantidad * precioUnitario;
    // Verificar stock y estado del producto antes de agregar
    const prod = await pool.query(
      `SELECT id, stock, estado, COALESCE(tipo_producto, 'terminado') AS tipo_producto
       FROM productos WHERE id = $1 LIMIT 1`,
      [productoId]
    );
    if (!prod.rows[0]) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }
    const p = prod.rows[0];
    if (String(p.estado || '').toLowerCase() !== 'activo') {
      const error = new Error('No se puede agregar al pedido un producto inactivo');
      error.statusCode = 409;
      throw error;
    }
    if (String(p.tipo_producto || '').toLowerCase() === 'insumo') {
      const error = new Error('Los productos tipo insumo no se pueden incluir en pedidos de cliente');
      error.statusCode = 400;
      throw error;
    }
    const tipoLower = String(p.tipo_producto || '').toLowerCase();
    const esPreparacion = tipoLower === 'preparacion' || tipoLower.includes('prepar');
    if (!esPreparacion) {
      const available = Number(p.stock || 0);
      if (!Number.isFinite(available) || available <= 0) {
        const error = new Error('No hay stock disponible para este producto');
        error.statusCode = 409;
        throw error;
      }
      if (available < Number(cantidad || 0)) {
        const error = new Error(`Stock insuficiente para el producto. Disponible: ${available}`);
        error.statusCode = 409;
        throw error;
      }
    }

    await pool.query(
      'INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ($1, $2, $3, $4, $5)',
      [pedidoId, productoId, cantidad, precioUnitario, subtotal]
    );
    return true;
  },
  update: async (id, data) => {
    try {
      const current = await Pedidos.getById(id);
      if (!current) {
        const error = new Error('Pedido no encontrado');
        error.statusCode = 404;
        throw error;
      }

      const estado = data?.estado ? String(data.estado).trim() : current.estado;
      const estadosPermitidos = ['Pendiente', 'En Proceso', 'Completado', 'Cancelado'];
      
      if (!estadosPermitidos.includes(estado)) {
        const error = new Error(`Estado inválido: ${estado}. Permitidos: ${estadosPermitidos.join(', ')}`);
        error.statusCode = 400;
        throw error;
      }

      await pool.query(
        `UPDATE pedidos 
         SET numero_pedido = COALESCE($2, numero_pedido),
             fecha = COALESCE($3, fecha),
             fecha_entrega = COALESCE($4, fecha_entrega),
             detalles = COALESCE($5, detalles),
             direccion = COALESCE($11, direccion),
             telefono = COALESCE($12, telefono),
             total = COALESCE($6, total),
             metodo_pago = COALESCE($8, metodo_pago),
             esquema_abono = COALESCE($9, esquema_abono),
             monto_abonado = COALESCE($10, monto_abonado),
             estado = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, data.numero_pedido || null, data.fecha || null, data.fecha_entrega || null, data.detalles || null, data.total || null, estado, data.metodo_pago || null, data.esquema_abono || null, data.monto_abonado || null, data.direccion || null, data.telefono || null]
      );

      // Verificación post-update
      const verificacion = await pool.query('SELECT estado FROM pedidos WHERE id = $1', [id]);
      if (verificacion.rows.length === 0) {
        const error = new Error('No se pudo actualizar el pedido');
        error.statusCode = 500;
        throw error;
      }

      if (verificacion.rows[0].estado !== estado) {
        console.warn(`Discrepancia en estado: esperado ${estado}, obtenido ${verificacion.rows[0].estado}`);
      }

      return true;
    } catch (error) {
      error.statusCode = error.statusCode || 500;
      throw error;
    }
  },
  delete: async (id) => {
    await pool.query('DELETE FROM detalle_pedidos WHERE pedido_id = $1', [id]);
    await pool.query('DELETE FROM pedidos WHERE id = $1', [id]);
    return true;
  }
};

module.exports = Pedidos;
