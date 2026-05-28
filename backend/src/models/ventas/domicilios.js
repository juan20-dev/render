/**
 * Modelo Domicilios (incluye helper local: ensureDomiciliosSchema)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const { reserveEntityIdAndCode } = require('../shared/auditoria');

let domiciliosSchemaEnsured = false;
let domiciliosSchemaPromise = null;
/** Alinea domicilios con db.pgsql (repartidor_id, motivo_cancelacion) si la BD es anterior. */
const ensureDomiciliosSchema = async () => {
  if (domiciliosSchemaEnsured) return;
  if (!domiciliosSchemaPromise) {
    domiciliosSchemaPromise = (async () => {
      try {
        await pool.query(`
          ALTER TABLE domicilios
            ADD COLUMN IF NOT EXISTS repartidor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
        `);
      } catch (_e) {
        await pool.query(`ALTER TABLE domicilios ADD COLUMN IF NOT EXISTS repartidor_id INTEGER`);
      }
      await pool.query(`
        ALTER TABLE domicilios
          ADD COLUMN IF NOT EXISTS motivo_cancelacion VARCHAR(100)
      `);
    })();
  }
  try {
    await domiciliosSchemaPromise;
    domiciliosSchemaEnsured = true;
  } catch (error) {
    domiciliosSchemaPromise = null;
    throw error;
  }
};

const Domicilios = {
  getAll: async (options = {}) => {
    await ensureDomiciliosSchema();
    const repId = Number(options.repartidorUserId);
    const filterRepartidor = Number.isFinite(repId) && repId > 0;
    const params = filterRepartidor ? [repId] : [];
    const whereRep = filterRepartidor ? ' WHERE d.repartidor_id = $1 ' : '';
    const result = await pool.query(
      `
      SELECT d.*,
             p.numero_pedido as pedido,
             p.total as total_pedido,
             p.esquema_abono as esquema_abono_pedido,
             p.fecha as fecha_pedido,
             p.fecha_entrega as fecha_entrega_pedido,
             p.direccion as direccion_pedido,
             p.telefono as telefono_pedido,
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.direccion as cliente_direccion,
             c.telefono as cliente_telefono,
             COALESCE((
               SELECT json_agg(
                 json_build_object(
                   'producto_id', dp.producto_id,
                   'producto_nombre', pr.nombre,
                   'cantidad', dp.cantidad,
                   'precio_unitario', dp.precio_unitario,
                   'subtotal', dp.subtotal
                 )
                 ORDER BY dp.id
               )
               FROM detalle_pedidos dp
               LEFT JOIN productos pr ON dp.producto_id = pr.id
               WHERE dp.pedido_id = p.id
             ), '[]'::json) as productos
      FROM domicilios d
      JOIN pedidos p ON d.pedido_id = p.id
      JOIN clientes c ON d.cliente_id = c.id
      ${whereRep}
      ORDER BY d.fecha DESC, d.hora DESC
    `,
      params
    );
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(`
      SELECT d.*,
             p.numero_pedido as pedido,
             p.total as total_pedido,
             p.esquema_abono as esquema_abono_pedido,
             p.fecha as fecha_pedido,
             p.fecha_entrega as fecha_entrega_pedido,
             p.direccion as direccion_pedido,
             p.telefono as telefono_pedido,
             p.metodo_pago as metodo_pago_pedido,
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.direccion as cliente_direccion,
             c.telefono as cliente_telefono,
             c.email as cliente_email,
             COALESCE((
               SELECT json_agg(
                 json_build_object(
                   'producto_id', dp.producto_id,
                   'producto_nombre', pr.nombre,
                   'cantidad', dp.cantidad,
                   'precio_unitario', dp.precio_unitario,
                   'subtotal', dp.subtotal
                 )
                 ORDER BY dp.id
               )
               FROM detalle_pedidos dp
               LEFT JOIN productos pr ON dp.producto_id = pr.id
               WHERE dp.pedido_id = p.id
             ), '[]'::json) as productos
      FROM domicilios d
      LEFT JOIN pedidos p ON d.pedido_id = p.id
      LEFT JOIN clientes c ON d.cliente_id = c.id
      WHERE d.id = $1
    `, [id]);
    return result.rows[0];
  },
  getByPedido: async (pedidoId) => {
    const result = await pool.query(
      `
      SELECT d.*,
             p.numero_pedido as pedido,
             p.total as total_pedido,
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             json_agg(
               json_build_object(
                 'producto_id', pr.id,
                 'producto_nombre', pr.nombre,
                 'cantidad', dp.cantidad,
                 'precio_unitario', dp.precio_unitario,
                 'subtotal', dp.subtotal
               )
             ) as productos
      FROM domicilios d
      LEFT JOIN pedidos p ON d.pedido_id = p.id
      LEFT JOIN clientes c ON d.cliente_id = c.id
      LEFT JOIN detalle_pedidos dp ON p.id = dp.pedido_id
      LEFT JOIN productos pr ON dp.producto_id = pr.id
      WHERE d.pedido_id = $1
      GROUP BY d.id, p.numero_pedido, p.total, c.nombre, c.apellido
      `,
      [pedidoId]
    );
    return result.rows[0];
  },
  getByCliente: async (clienteId) => {
    const result = await pool.query(
      `
      SELECT d.*,
             p.numero_pedido as pedido,
             CONCAT(c.nombre, ' ', c.apellido) as cliente
      FROM domicilios d
      JOIN pedidos p ON d.pedido_id = p.id
      JOIN clientes c ON d.cliente_id = c.id
      WHERE d.cliente_id = $1
      ORDER BY
        CASE d.estado
          WHEN 'Pendiente' THEN 1
          WHEN 'En Camino' THEN 2
          WHEN 'Entregado' THEN 3
          WHEN 'Cancelado' THEN 4
          ELSE 5
        END ASC,
        d.fecha DESC NULLS LAST,
        d.hora DESC NULLS LAST,
        d.id DESC
    `,
      [clienteId]
    );
    return result.rows;
  },
  create: async (data) => {
    await ensureDomiciliosSchema();
    const reserved = await reserveEntityIdAndCode(pool, 'public.domicilios', 'D');
    const blocking = await pool.query(
      `SELECT id FROM domicilios
       WHERE pedido_id = $1
         AND (
           TRIM(COALESCE(estado, '')) ILIKE 'pendiente'
           OR TRIM(COALESCE(estado, '')) ILIKE '%camino%'
         )
       LIMIT 1`,
      [data.pedido_id]
    );
    if (blocking.rows[0]?.id) {
      const error = new Error(
        'El pedido ya tiene un domicilio activo. Cancele el domicilio actual o use otro pedido.'
      );
      error.statusCode = 409;
      throw error;
    }

    try {
      const result = await pool.query(
        `INSERT INTO domicilios (
         id, numero_domicilio, pedido_id, cliente_id, direccion, repartidor, repartidor_id, fecha, hora, estado, detalle
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          reserved.id,
          reserved.code,
          data.pedido_id,
          data.cliente_id,
          data.direccion,
          data.repartidor ?? null,
          data.repartidor_id ?? null,
          data.fecha,
          data.hora ?? null,
          data.estado || 'Pendiente',
          data.detalle ?? null,
        ]
      );
      return result.rows[0].id;
    } catch (err) {
      const code = err && err.code;
      if (code === '23505') {
        const e = new Error(
          'No se pudo crear el domicilio: número duplicado o restricción única en base de datos.'
        );
        e.statusCode = 409;
        throw e;
      }
      if (code === '23503') {
        const e = new Error(
          'Datos inconsistentes: verifique que el pedido, el cliente y el repartidor existan en el sistema.'
        );
        e.statusCode = 400;
        throw e;
      }
      throw err;
    }
  },
  update: async (id, data) => {
    await ensureDomiciliosSchema();
    const current = await Domicilios.getById(id);
    if (!current) {
      const error = new Error('Domicilio no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (String(current.estado || '') === 'Entregado') {
      const error = new Error('El domicilio ya está entregado y no puede modificarse');
      error.statusCode = 409;
      throw error;
    }

    const nextEstado = String(data.estado !== undefined ? data.estado : current.estado)
      .trim()
      .toLowerCase();
    const requierePedidoCompletado = nextEstado === 'en camino' || nextEstado === 'entregado';
    if (requierePedidoCompletado) {
      const pedidoEstadoRes = await pool.query('SELECT estado FROM pedidos WHERE id = $1 LIMIT 1', [
        current.pedido_id,
      ]);
      const pedidoEstado = String(pedidoEstadoRes.rows?.[0]?.estado || '')
        .trim()
        .toLowerCase();
      if (!pedidoEstadoRes.rows?.[0] || pedidoEstado !== 'completado') {
        const estadoActual = pedidoEstadoRes.rows?.[0]?.estado
          ? String(pedidoEstadoRes.rows[0].estado).trim()
          : 'No disponible';
        const error = new Error(
          `No se puede cambiar el domicilio a ${nextEstado === 'en camino' ? 'En Ruta' : 'Completado'} porque el pedido asociado está en estado "${estadoActual}". El pedido debe estar en estado "Completado". Comuníquese con el asesor para actualizar el pedido.`
        );
        error.statusCode = 409;
        throw error;
      }
    }

    await pool.query(
      `UPDATE domicilios SET
         repartidor = COALESCE($1, repartidor),
         repartidor_id = COALESCE($2, repartidor_id),
         fecha = COALESCE($3, fecha),
         hora = COALESCE($4, hora),
         estado = COALESCE($5, estado),
         detalle = COALESCE($6, detalle),
         motivo_cancelacion = COALESCE($7, motivo_cancelacion),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [
        data.repartidor !== undefined ? data.repartidor : current.repartidor,
        data.repartidor_id !== undefined ? data.repartidor_id : current.repartidor_id,
        data.fecha !== undefined ? data.fecha : current.fecha,
        data.hora !== undefined ? data.hora : current.hora,
        data.estado !== undefined ? data.estado : current.estado,
        data.detalle !== undefined ? data.detalle : current.detalle,
        data.motivo_cancelacion !== undefined ? data.motivo_cancelacion : current.motivo_cancelacion,
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
    await pool.query('DELETE FROM domicilios WHERE id = $1', [id]);
    return true;
  }
};

module.exports = Domicilios;
