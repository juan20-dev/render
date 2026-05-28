/**
 * Modelo Ventas (incluye helper local: aplicarDescuentoStockYLineaDetalleVenta)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const { parseMoneyCO } = require('../../controllers/normalizador-http');
const {
  ensureVentasMoneyColumns,
  ensureProductoTipoColumn,
  normalizeProductoTipoValue,
  reserveEntityIdAndCode,
  groupRowsBy,
} = require('../shared/auditoria');
const Clientes = require('./clientes');

const ALLOWED_PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Contraentrega', 'Nequi', 'Daviplata'];

/**
 * Quita inventario del producto y registra línea en detalle_ventas (uso dentro de transacción).
 */
const aplicarDescuentoStockYLíneaDetalleVenta = async (
  client,
  ventaId,
  productoId,
  cantidadRaw,
  precioUnitarioRaw,
  options = {},
) => {
  const qty = Number(cantidadRaw);
  const price = parseMoneyCO(precioUnitarioRaw);

  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    const error = new Error('La cantidad debe ser un número entero mayor a cero.');
    error.statusCode = 400;
    throw error;
  }

  if (price === undefined || !Number.isFinite(price) || price < 0) {
    const error = new Error('El precio unitario debe ser un número mayor o igual a cero.');
    error.statusCode = 400;
    throw error;
  }

  if (!productoId) {
    const error = new Error('producto_id inválido');
    error.statusCode = 400;
    throw error;
  }

  const pRes = await client.query(
    `SELECT id, nombre, COALESCE(stock, 0)::bigint AS stock, estado,
            COALESCE(tipo_producto, 'terminado') AS tipo_producto
     FROM productos WHERE id = $1 FOR UPDATE`,
    [productoId],
  );

  if (!pRes.rows[0]) {
    const error = new Error('Producto no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const row = pRes.rows[0];
  const nombre = String(row.nombre || '').trim() || `#${productoId}`;

  if (String(row.estado || '').toLowerCase() !== 'activo') {
    const error = new Error(`No se puede vender "${nombre}": el producto no está activo.`);
    error.statusCode = 409;
    throw error;
  }

  if (String(row.tipo_producto || '').toLowerCase() === 'insumo') {
    const error = new Error(`No se puede vender "${nombre}": es un producto tipo insumo (solo compras a proveedor).`);
    error.statusCode = 400;
    throw error;
  }

  const tipoNorm = normalizeProductoTipoValue(row.tipo_producto);
  const esPreparacion =
    tipoNorm === 'preparacion' ||
    (options.pedidoId != null && options.preparacionIds?.has(Number(productoId)));

  if (!esPreparacion) {
    const available = Number(row.stock || 0);
    if (!Number.isFinite(available)) {
      const error = new Error(`No hay stock disponible para "${nombre}".`);
      error.statusCode = 409;
      throw error;
    }

    if (available < qty) {
      const mensaje =
        available <= 0
          ? `No hay stock disponible para "${nombre}".`
          : `Stock insuficiente para "${nombre}". Disponible: ${available}, solicitado: ${qty}.`;
      const error = new Error(mensaje);
      error.statusCode = 409;
      throw error;
    }

    await client.query(
      `UPDATE productos SET stock = COALESCE(stock, 0) - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [qty, productoId],
    );
  }

  const subtotal = qty * price;
  await client.query(
    `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
     VALUES ($1, $2, $3, $4, $5)`,
    [ventaId, productoId, qty, price, subtotal],
  );

  return true;
};


const Ventas = {
  validateClienteActivo: async (clienteId) => {
    if (clienteId === null || clienteId === undefined) {
      return null;
    }

    const cliente = await Clientes.getById(clienteId);
    if (!cliente) {
      const error = new Error('Cliente no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (String(cliente.estado || '').toLowerCase() !== 'activo') {
      const error = new Error('No se puede crear o actualizar una venta con un cliente inactivo');
      error.statusCode = 400;
      throw error;
    }

    return cliente;
  },
  getAll: async () => {
    await ensureVentasMoneyColumns();
    const result = await pool.query(`
      SELECT v.*, 
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.nombre as cliente_nombre,
             c.apellido as cliente_apellido
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      ORDER BY v.fecha DESC
    `);

    const ventaIds = result.rows.map((venta) => venta.id);
    if (ventaIds.length > 0) {
      const detalles = await pool.query(
        `SELECT dv.*, p.nombre as producto
         FROM detalle_ventas dv
         JOIN productos p ON dv.producto_id = p.id
         WHERE dv.venta_id = ANY($1::int[])
         ORDER BY dv.venta_id ASC, dv.id ASC`,
        [ventaIds]
      );

      const detallesPorVenta = groupRowsBy(detalles.rows, 'venta_id');
      for (const venta of result.rows) {
        venta.items = detallesPorVenta.get(venta.id) || [];
      }
    }

    return result.rows;
  },
  getByCliente: async (clienteId, filters = {}) => {
    const numero = typeof filters.numero_venta === 'string' ? filters.numero_venta.trim() : '';
    const fechaDesde = typeof filters.fecha_desde === 'string' ? filters.fecha_desde.trim() : '';
    const fechaHasta = typeof filters.fecha_hasta === 'string' ? filters.fecha_hasta.trim() : '';

    const result = await pool.query(
      `
      SELECT v.*,
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.nombre as cliente_nombre,
             c.apellido as cliente_apellido
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      WHERE v.cliente_id = $1
        AND ($2 = '' OR v.numero_venta ILIKE ('%' || $2 || '%'))
        AND (NULLIF($3, '') IS NULL OR v.fecha >= NULLIF($3, '')::date)
        AND (NULLIF($4, '') IS NULL OR v.fecha <= NULLIF($4, '')::date)
      ORDER BY v.fecha DESC, v.id DESC
    `,
      [clienteId, numero, fechaDesde, fechaHasta]
    );

    return result.rows;
  },
  getByPedido: async (pedidoId) => {
    const result = await pool.query(
      `
      SELECT v.*,
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.nombre as cliente_nombre,
             c.apellido as cliente_apellido
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      WHERE v.pedido_id = $1
      ORDER BY v.id DESC
      LIMIT 1
    `,
      [pedidoId]
    );
    return result.rows[0];
  },
  getById: async (id) => {
    const result = await pool.query(`
      SELECT v.*, 
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.nombre as cliente_nombre,
             c.apellido as cliente_apellido
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      WHERE v.id = $1
    `, [id]);
    
    if (result.rows[0]) {
      const detalles = await pool.query(`
        SELECT dv.*, p.nombre as producto
        FROM detalle_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        WHERE dv.venta_id = $1
      `, [id]);
      result.rows[0].items = detalles.rows;
    }
    
    return result.rows[0];
  },
  getDetalles: async (ventaId) => {
    const result = await pool.query(`
      SELECT dv.*, pr.nombre as producto_nombre
      FROM detalle_ventas dv
      JOIN productos pr ON dv.producto_id = pr.id
      WHERE dv.venta_id = $1
    `, [ventaId]);
    return result.rows;
  },
  create: async (data) => {
    try {
      await ensureVentasMoneyColumns();
      await Ventas.validateClienteActivo(data.cliente_id);

      const estado = String(data?.estado || 'Pendiente').trim();
      if (!['Pendiente', 'Completada', 'Cancelada'].includes(estado)) {
        const error = new Error(`Estado inválido: ${estado}. Valores permitidos: Pendiente, Completada, Cancelada`);
        error.statusCode = 400;
        throw error;
      }

      const reserved = await reserveEntityIdAndCode(pool, 'public.ventas', 'V');

      const totalGuardado = parseMoneyCO(data.total);
      if (totalGuardado === undefined || !Number.isFinite(totalGuardado) || totalGuardado < 0) {
        const error = new Error('Total de venta invalido');
        error.statusCode = 400;
        throw error;
      }

      // Validar método de pago con el mismo catálogo aceptado por el normalizador HTTP.
      const metodo_pago = String(data?.metodo_pago || data?.metodopago || 'Efectivo').trim();
      if (!ALLOWED_PAYMENT_METHODS.includes(metodo_pago)) {
        const error = new Error(`Método de pago inválido: ${metodo_pago}`);
        error.statusCode = 400;
        throw error;
      }

      const metodopagoCol = data.metodopago ?? metodo_pago;

      const fechaRaw = data.fecha != null && String(data.fecha).trim() !== '' ? String(data.fecha).trim() : '';
      const fechaVenta = fechaRaw ? fechaRaw.split('T')[0] : new Date().toISOString().split('T')[0];

      const result = await pool.query(
        'INSERT INTO ventas (id, numero_venta, tipo, cliente_id, pedido_id, fecha, metodopago, total, estado, metodo_pago, abono_recibido) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
        [
          reserved.id,
          reserved.code,
          data.tipo,
          data.cliente_id,
          data.pedido_id || null,
          fechaVenta,
          metodopagoCol,
          totalGuardado,
          estado,
          metodo_pago,
          data.abono_recibido || 0,
        ]
      );
      return result.rows[0].id;
    } catch (error) {
      error.statusCode = error.statusCode || 500;
      throw error;
    }
  },
  /**
   * Crea venta y todos sus ítems en una sola transacción (descuenta stock por línea).
   */
  createCompleta: async (data, detailLines) => {
    await ensureVentasMoneyColumns();
    await ensureProductoTipoColumn();
    await Ventas.validateClienteActivo(data.cliente_id);

    if (!Array.isArray(detailLines) || detailLines.length === 0) {
      const error = new Error('La venta debe incluir al menos un producto.');
      error.statusCode = 400;
      throw error;
    }

    const estado = String(data?.estado || 'Pendiente').trim();
    if (!['Pendiente', 'Completada', 'Cancelada'].includes(estado)) {
      const error = new Error(`Estado inválido: ${estado}. Valores permitidos: Pendiente, Completada, Cancelada`);
      error.statusCode = 400;
      throw error;
    }

    const fechaRaw = data.fecha != null && String(data.fecha).trim() !== '' ? String(data.fecha).trim() : '';
    const fechaVenta = fechaRaw ? fechaRaw.split('T')[0] : new Date().toISOString().split('T')[0];

    const metodopagoCol = String(data.metodopago ?? data.metodo_pago ?? 'Efectivo').trim();
    const metodo_pago = String(data?.metodo_pago || data?.metodopago || metodopagoCol || 'Efectivo').trim();
    if (!metodo_pago) {
      const error = new Error('Método de pago obligatorio');
      error.statusCode = 400;
      throw error;
    }
    if (!ALLOWED_PAYMENT_METHODS.includes(metodo_pago)) {
      const error = new Error(`Método de pago inválido: ${metodo_pago}`);
      error.statusCode = 400;
      throw error;
    }

    let abonoGuardado = 0;
    const rawAbono = data?.abono_recibido;
    if (rawAbono !== undefined && rawAbono !== null && rawAbono !== '') {
      const parsed = parseMoneyCO(rawAbono);
      const n = parsed !== undefined ? parsed : Number(rawAbono);
      if (Number.isFinite(n) && n >= 0) abonoGuardado = n;
    }

    const lines = [];
    for (let index = 0; index < detailLines.length; index += 1) {
      const raw = detailLines[index] || {};
      const productoId = Number(raw.productoId ?? raw.producto_id);
      const qtyRaw = Number(raw.cantidad);
      const cantidad = Math.trunc(qtyRaw);
      const precioUnitario = parseMoneyCO(raw.precioUnitario ?? raw.precio_unitario ?? raw.precio);

      if (!Number.isFinite(productoId) || productoId <= 0) {
        const error = new Error(`Ítem ${index + 1}: producto inválido.`);
        error.statusCode = 400;
        throw error;
      }

      if (
        !Number.isFinite(qtyRaw) ||
        qtyRaw <= 0 ||
        !Number.isFinite(cantidad) ||
        cantidad <= 0 ||
        Math.abs(qtyRaw - cantidad) > 1e-9
      ) {
        const error = new Error(`Ítem ${index + 1}: la cantidad debe ser un número entero mayor a cero.`);
        error.statusCode = 400;
        throw error;
      }

      if (precioUnitario === undefined || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
        const error = new Error(`Ítem ${index + 1}: precio unitario inválido.`);
        error.statusCode = 400;
        throw error;
      }

      lines.push({ productoId, cantidad, precioUnitario });
    }

    let totalCalculado = 0;
    for (const line of lines) {
      totalCalculado += line.cantidad * line.precioUnitario;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reserved = await reserveEntityIdAndCode(client, 'public.ventas', 'V');

      const inserted = await client.query(
        `INSERT INTO ventas (id, numero_venta, tipo, cliente_id, pedido_id, fecha, metodopago, total, estado, metodo_pago, abono_recibido)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          reserved.id,
          reserved.code,
          data.tipo,
          data.cliente_id,
          data.pedido_id ?? null,
          fechaVenta,
          data.metodopago ?? metodo_pago,
          totalCalculado,
          estado,
          metodo_pago,
          abonoGuardado,
        ],
      );

      const ventaId = inserted.rows[0].id;

      const pedidoId = data.pedido_id ?? data.pedidoId ?? null;
      let preparacionIds = null;
      if (pedidoId != null) {
        const prepRes = await client.query(
          `SELECT DISTINCT pr.id
           FROM detalle_pedidos dp
           INNER JOIN productos pr ON pr.id = dp.producto_id
           WHERE dp.pedido_id = $1
             AND COALESCE(pr.tipo_producto, 'terminado') = 'preparacion'`,
          [pedidoId],
        );
        preparacionIds = new Set(prepRes.rows.map((r) => Number(r.id)));
      }

      for (const line of lines) {
        await aplicarDescuentoStockYLíneaDetalleVenta(
          client,
          ventaId,
          line.productoId,
          line.cantidad,
          line.precioUnitario,
          { pedidoId, preparacionIds },
        );
      }

      await client.query('COMMIT');
      return ventaId;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore rollback errors
      }
      throw error;
    } finally {
      client.release();
    }
  },
  addDetalle: async (ventaId, productoId, cantidad, precioUnitario) => {
    await ensureVentasMoneyColumns();
    await ensureProductoTipoColumn();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await aplicarDescuentoStockYLíneaDetalleVenta(client, ventaId, Number(productoId), cantidad, precioUnitario);
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore
      }
      throw error;
    } finally {
      client.release();
    }
    return true;
  },
  update: async (id, data) => {
    const current = await Ventas.getById(id);
    if (!current) {
      const error = new Error('Venta no encontrada');
      error.statusCode = 404;
      throw error;
    }

    if (['Completada', 'Cancelada'].includes(String(current.estado || ''))) {
      const error = new Error('La venta ya está en estado final y no puede modificarse');
      error.statusCode = 409;
      throw error;
    }

    if (data.cliente_id !== undefined) {
      await Ventas.validateClienteActivo(data.cliente_id);
    }

    const mergedData = {
      ...current,
      ...data,
      numero_venta: current.numero_venta,
    };

    await pool.query(
      'UPDATE ventas SET tipo = $1, cliente_id = $2, pedido_id = $3, fecha = $4, metodopago = $5, total = $6, estado = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8',
      [mergedData.tipo, mergedData.cliente_id, mergedData.pedido_id, mergedData.fecha, mergedData.metodopago, mergedData.total, mergedData.estado, id]
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
    await pool.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [id]);
    await pool.query('DELETE FROM ventas WHERE id = $1', [id]);
    return true;
  }
};

module.exports = Ventas;
