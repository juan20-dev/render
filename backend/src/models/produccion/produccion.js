/**
 * Modelo Produccion (incluye helpers locales: normalizeProduccionStatus, validateProduccionPayload)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const {
  ensureMotivoEstado,
  ensureProductoTipoColumn,
  ensureProductoInsumosTable,
} = require('../shared/auditoria');

const normalizeProduccionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'orden recibida' || normalized === 'pendiente') return 'Orden Recibida';
  if (normalized === 'orden en preparacion' || normalized === 'en proceso' || normalized === 'en preparación') {
    return 'Orden en preparacion';
  }
  if (normalized === 'orden lista' || normalized === 'completada' || normalized === 'lista' || normalized === 'completa') {
    return 'Orden Lista';
  }
  if (normalized === 'cancelada' || normalized === 'cancelado') return 'Cancelada';
  return null;
};

const validateProduccionPayload = (data = {}) => {
  const productoId = Number(data.producto_id);
  const cantidad = Number(data.cantidad);
  const tiempoPreparacion = Number(data.tiempo_preparacion_minutos ?? 0);

  if (!Number.isInteger(productoId) || productoId <= 0) {
    const error = new Error('producto_id debe ser un entero positivo');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    const error = new Error('cantidad debe ser un entero positivo');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(tiempoPreparacion) || tiempoPreparacion <= 0) {
    const error = new Error('tiempo_preparacion_minutos debe ser mayor a 0');
    error.statusCode = 400;
    throw error;
  }

  if (!data.fecha) {
    const error = new Error('fecha es obligatoria');
    error.statusCode = 400;
    throw error;
  }
};


/**
 * Lista las entregas de insumos hechas a un productor (operario_id) que aun
 * tienen saldo disponible para asignarse a una nueva orden de produccion.
 *
 * Una entrega "esta disponible" cuando su id no aparece todavia en
 * `produccion.insumos_gastados[].entrega_id` de ninguna orden activa
 * (estados distintos a 'Cancelada').
 */
const getInsumosEntregadosByProductor = async (productorId) => {
  const id = Number(productorId);
  if (!Number.isFinite(id) || id <= 0) return [];

  const result = await pool.query(
    `SELECT ei.id,
            ei.numero_entrega,
            ei.insumo_id,
            ei.producto_catalogo_id,
            ei.cantidad,
            ei.unidad,
            ei.operario_id,
            ei.fecha,
            ei.hora,
            COALESCE(i.nombre, pr.nombre) AS insumo_nombre
     FROM entregas_insumos ei
     LEFT JOIN insumos i ON i.id = ei.insumo_id
     LEFT JOIN productos pr ON pr.id = ei.producto_catalogo_id
     WHERE ei.operario_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM produccion p,
              jsonb_array_elements(COALESCE(p.insumos_gastados, '[]'::jsonb)) AS g
         WHERE LOWER(TRIM(COALESCE(p.estado, ''))) <> 'cancelada'
           AND (g ->> 'entrega_id')::int = ei.id
       )
     ORDER BY ei.fecha DESC, ei.hora DESC NULLS LAST, ei.id DESC`,
    [id]
  );
  return result.rows;
};

const Produccion = {
  getInsumosEntregadosByProductor,
  getAll: async () => {
    const result = await pool.query(`
      SELECT p.*, pr.nombre as producto_nombre
      FROM produccion p
      JOIN productos pr ON p.producto_id = pr.id
      ORDER BY p.fecha DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    await ensureProductoInsumosTable();
    const result = await pool.query(
      `SELECT p.*, pr.nombre as producto_nombre
       FROM produccion p
       JOIN productos pr ON p.producto_id = pr.id
       WHERE p.id = $1`,
      [id]
    );

    const produccion = result.rows[0];
    if (!produccion) return null;

    if (produccion.pedido_id) {
      const pedidoResult = await pool.query(
        `SELECT pe.*, CONCAT(COALESCE(c.nombre, ''), ' ', COALESCE(c.apellido, '')) AS cliente_nombre
         FROM pedidos pe
         LEFT JOIN clientes c ON c.id = pe.cliente_id
         WHERE pe.id = $1`,
        [produccion.pedido_id]
      );

      const pedido = pedidoResult.rows[0] || null;
      if (pedido) {
        const detallesResult = await pool.query(
          `SELECT dp.*, pr.nombre AS producto_nombre
           FROM detalle_pedidos dp
           JOIN productos pr ON pr.id = dp.producto_id
           WHERE dp.pedido_id = $1
           ORDER BY dp.id ASC`,
          [produccion.pedido_id]
        );
        produccion.pedido = {
          ...pedido,
          detalles: detallesResult.rows,
        };
        produccion.pedido_numero = pedido.numero_pedido;
        produccion.pedido_cliente = pedido.cliente_nombre?.trim() || null;
      }
    }

    const insumosResult = await pool.query(
      `SELECT ei.*, COALESCE(i.nombre, pr.nombre) AS insumo_nombre
       FROM entregas_insumos ei
       LEFT JOIN insumos i ON i.id = ei.insumo_id
       LEFT JOIN productos pr ON pr.id = ei.producto_catalogo_id
       WHERE ei.insumo_id IN (
         SELECT insumo_id FROM producto_insumos WHERE producto_id = $1
       )
       ORDER BY ei.fecha DESC, ei.hora DESC NULLS LAST, ei.id DESC
       LIMIT 10`,
      [produccion.producto_id]
    );

    produccion.insumos_gastados = insumosResult.rows;
    produccion.entregas_insumos_relacionadas = insumosResult.rows;

    return produccion;
  },
  create: async (data) => {
    validateProduccionPayload(data);
    await ensureProductoTipoColumn();
    await ensureProductoInsumosTable();

    const estadoInicial = normalizeProduccionStatus(data.estado) || 'Orden Recibida';
    const numeroProduccion =
      data.numero_produccion && String(data.numero_produccion).trim()
        ? String(data.numero_produccion).trim()
        : `ORD-${Date.now()}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const prodRow = await client.query(
        `SELECT id, nombre, estado, COALESCE(tipo_producto, 'terminado') AS tipo_producto
         FROM productos WHERE id = $1 FOR UPDATE`,
        [data.producto_id]
      );
      const prod = prodRow.rows[0];
      if (!prod) {
        const err = new Error('Producto no encontrado');
        err.statusCode = 404;
        throw err;
      }
      if (String(prod.estado) !== 'Activo') {
        const err = new Error('El producto debe estar activo');
        err.statusCode = 409;
        throw err;
      }
      if (String(prod.tipo_producto) !== 'preparacion') {
        const err = new Error('Solo se programan órdenes para productos de tipo preparación');
        err.statusCode = 400;
        throw err;
      }

      // Validar insumos entregados (nuevo flujo): array opcional de ids de
      // entregas_insumos. Si viene, deben pertenecer al productor (operario_id =
      // data.productor_id) y no haberse usado previamente en otra orden activa.
      let insumosEntregadosUsados = [];
      const insumosInput = Array.isArray(data.insumos) ? data.insumos : [];
      const idsEntregas = insumosInput
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0);

      if (idsEntregas.length > 0) {
        const productorIdNum = Number(data.productor_id);
        if (!Number.isFinite(productorIdNum) || productorIdNum <= 0) {
          const err = new Error('productor_id es obligatorio cuando se asignan insumos entregados');
          err.statusCode = 400;
          throw err;
        }
        const entregasRes = await client.query(
          `SELECT ei.id, ei.insumo_id, ei.producto_catalogo_id, ei.cantidad, ei.unidad, ei.operario_id,
                  ei.numero_entrega, COALESCE(i.nombre, pr.nombre) AS insumo_nombre
           FROM entregas_insumos ei
           LEFT JOIN insumos i ON i.id = ei.insumo_id
           LEFT JOIN productos pr ON pr.id = ei.producto_catalogo_id
           WHERE ei.id = ANY($1::int[])
           FOR UPDATE OF ei`,
          [idsEntregas]
        );
        if (entregasRes.rows.length !== idsEntregas.length) {
          const err = new Error('Una o mas entregas de insumos no existen');
          err.statusCode = 400;
          throw err;
        }
        for (const e of entregasRes.rows) {
          if (Number(e.operario_id) !== productorIdNum) {
            const err = new Error(
              `La entrega #${e.numero_entrega || e.id} no pertenece al productor seleccionado`
            );
            err.statusCode = 403;
            throw err;
          }
        }
        const usadasRes = await client.query(
          `SELECT (g ->> 'entrega_id')::int AS entrega_id
           FROM produccion p,
                jsonb_array_elements(COALESCE(p.insumos_gastados, '[]'::jsonb)) AS g
           WHERE LOWER(TRIM(COALESCE(p.estado, ''))) <> 'cancelada'
             AND (g ->> 'entrega_id')::int = ANY($1::int[])`,
          [idsEntregas]
        );
        if (usadasRes.rows.length > 0) {
          const yaUsadas = usadasRes.rows.map((r) => r.entrega_id).join(', ');
          const err = new Error(
            `Las siguientes entregas ya fueron asignadas a otra orden activa: ${yaUsadas}`
          );
          err.statusCode = 409;
          throw err;
        }
        insumosEntregadosUsados = entregasRes.rows.map((e) => ({
          entrega_id: Number(e.id),
          insumo_id: Number(
            e.insumo_id != null && e.insumo_id !== ''
              ? e.insumo_id
              : e.producto_catalogo_id != null && e.producto_catalogo_id !== ''
                ? e.producto_catalogo_id
                : 0
          ),
          insumo_nombre: e.insumo_nombre,
          cantidad: Number(e.cantidad),
          unidad: e.unidad,
          numero_entrega: e.numero_entrega,
        }));
      }

      const recetas = await client.query(
        `SELECT insumo_id, cantidad_requerida FROM producto_insumos WHERE producto_id = $1`,
        [data.producto_id]
      );
      const ordenQty = Number(data.cantidad);

      for (const r of recetas.rows) {
        const need = Number(r.cantidad_requerida) * ordenQty;
        if (!Number.isFinite(need) || need <= 0) continue;
        const insRes = await client.query(
          `SELECT id, nombre, cantidad FROM insumos WHERE id = $1 FOR UPDATE`,
          [r.insumo_id]
        );
        const ins = insRes.rows[0];
        if (!ins) {
          const err = new Error(`Insumo de receta no encontrado (id ${r.insumo_id})`);
          err.statusCode = 400;
          throw err;
        }
        const have = Number(ins.cantidad ?? 0);
        if (have < need) {
          const err = new Error(`Stock insuficiente de «${ins.nombre}»: disponible ${have}, requerido ${need}`);
          err.statusCode = 409;
          throw err;
        }
        await client.query(
          `UPDATE insumos SET cantidad = cantidad - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [need, r.insumo_id]
        );
      }

      const insResult = await client.query(
        'INSERT INTO produccion (numero_produccion, producto_id, pedido_id, cantidad, fecha, responsable, tiempo_preparacion_minutos, estado, notes, insumos_gastados) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [
          numeroProduccion,
          data.producto_id,
          data.pedido_id ?? null,
          data.cantidad,
          data.fecha,
          data.responsable,
          data.tiempo_preparacion_minutos ?? 0,
          estadoInicial,
          data.notes,
          insumosEntregadosUsados.length > 0
            ? JSON.stringify(insumosEntregadosUsados)
            : Array.isArray(data.insumos_gastados)
              ? JSON.stringify(data.insumos_gastados)
              : '[]',
        ]
      );

      await client.query('COMMIT');
      return insResult.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  update: async (id, data) => {
    validateProduccionPayload(data);
    const estadoActualizado = normalizeProduccionStatus(data.estado) || 'Orden Recibida';
    await pool.query(
      'UPDATE produccion SET producto_id = $1, pedido_id = $2, cantidad = $3, fecha = $4, responsable = $5, tiempo_preparacion_minutos = $6, estado = $7, notes = $8, insumos_gastados = $9, updated_at = CURRENT_TIMESTAMP WHERE id = $10',
      [
        data.producto_id,
        data.pedido_id ?? null,
        data.cantidad,
        data.fecha,
        data.responsable,
        data.tiempo_preparacion_minutos ?? 0,
        estadoActualizado,
        data.notes,
        Array.isArray(data.insumos_gastados) ? JSON.stringify(data.insumos_gastados) : '[]',
        id
      ]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM produccion WHERE id = $1', [id]);
    return true;
  },
  updateStatus: async (id, data = {}) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentResult = await client.query('SELECT * FROM produccion WHERE id = $1 FOR UPDATE', [id]);
      const current = currentResult.rows[0];

      if (!current) {
        const error = new Error('Registro de produccion no encontrado');
        error.statusCode = 404;
        throw error;
      }

      const currentStatus = normalizeProduccionStatus(current.estado);
      const nextStatus = normalizeProduccionStatus(data.estado);

      if (!nextStatus) {
        const error = new Error(
          'Estado invalido. Valores permitidos: Orden Recibida, Orden en preparacion, Orden Lista, Cancelada'
        );
        error.statusCode = 400;
        throw error;
      }

      if (currentStatus === 'Orden Lista') {
        const error = new Error('La orden ya esta en estado Orden Lista y no puede modificarse');
        error.statusCode = 409;
        throw error;
      }

      if (currentStatus === 'Cancelada') {
        const error = new Error('La orden cancelada no puede modificarse');
        error.statusCode = 409;
        throw error;
      }

      if (currentStatus === nextStatus) {
        await client.query('COMMIT');
        return current;
      }

      const allowedTransitions = {
        'Orden Recibida': ['Orden en preparacion', 'Cancelada'],
        'Orden en preparacion': ['Orden Lista', 'Cancelada'],
      };

      if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
        const error = new Error('Transicion de estado no permitida para la orden de produccion');
        error.statusCode = 400;
        throw error;
      }

      const cancelReason = typeof data.motivo_cancelacion === 'string' ? data.motivo_cancelacion.trim() : '';
      if (nextStatus === 'Cancelada' && cancelReason.length < 10) {
        const error = new Error('El motivo de cancelacion es obligatorio y debe tener al menos 10 caracteres');
        error.statusCode = 400;
        throw error;
      }

      const nextNotes = (() => {
        if (nextStatus !== 'Cancelada') return current.notes;
        const marker = 'Motivo cancelacion';
        const previous = typeof current.notes === 'string' ? current.notes.trim() : '';
        const entry = `${marker}: ${cancelReason}`;
        return previous ? `${previous}\n${entry}` : entry;
      })();

      if (nextStatus === 'Orden Lista') {
        const addStock = await client.query(
          `UPDATE productos
           SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING id`,
          [Number(current.cantidad), current.producto_id]
        );
        if (addStock.rowCount === 0) {
          const error = new Error('Producto de la orden de producción no encontrado');
          error.statusCode = 404;
          throw error;
        }
      }

      if (nextStatus === 'Cancelada') {
        await ensureProductoInsumosTable();
        const recetas = await client.query(
          `SELECT insumo_id, cantidad_requerida FROM producto_insumos WHERE producto_id = $1`,
          [current.producto_id]
        );
        const ordenQty = Number(current.cantidad);
        for (const r of recetas.rows) {
          const need = Number(r.cantidad_requerida) * ordenQty;
          if (!Number.isFinite(need) || need <= 0) continue;
          await client.query(
            `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [need, r.insumo_id]
          );
        }
      }

      await client.query(
        'UPDATE produccion SET estado = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [nextStatus, nextNotes ?? null, id]
      );

      const updatedResult = await client.query('SELECT * FROM produccion WHERE id = $1', [id]);
      await client.query('COMMIT');
      return updatedResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

module.exports = Produccion;
