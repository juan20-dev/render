/**
 * Modelo Produccion (incluye helpers locales: normalizeProduccionStatus, validateProduccionPayload)
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const InsumosModel = require('./insumos');
const {
  ensureMotivoEstado,
  ensureProductoTipoColumn,
  ensureProductoInsumosTable,
  ensureEntregasInsumoProductoCatalogo,
} = require('../shared/auditoria');

const INSUMO_ID_VIRTUAL_BASE = Number(InsumosModel.INSUMO_VISTA_DESDE_PRODUCTO_ID_BASE) || 900000000;

/** Clave unificada receta / entrega: catálogo `c:{producto_id}` o legacy `l:{insumo_id}`. */
const entregaRecetaKey = (row) => {
  if (row.producto_catalogo_id != null && row.producto_catalogo_id !== '') {
    const p = Number(row.producto_catalogo_id);
    if (Number.isFinite(p) && p > 0) return `c:${p}`;
  }
  const ins = row.insumo_id != null && row.insumo_id !== '' ? Number(row.insumo_id) : NaN;
  if (Number.isFinite(ins) && ins > 0) return `l:${ins}`;
  return null;
};

/**
 * Necesidad total por insumo según recetas (producto_insumos) y cantidades de preparación del pedido.
 * Unifica catálogo (id virtual BASE + producto) y legacy; si hay producto catálogo con el mismo nombre que el insumo legacy, agrupa en `c:`.
 */
const buildPedidoInsumoNeedMap = async (client, detallePreparacion) => {
  const need = new Map();
  for (const line of detallePreparacion) {
    const pid = Number(line.producto_id);
    const prepQty = Number(line.cantidad);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(prepQty) || prepQty <= 0) continue;
    const rec = await client.query(
      `SELECT insumo_id, cantidad_requerida FROM producto_insumos WHERE producto_id = $1`,
      [pid]
    );
    for (const r of rec.rows) {
      const rawId = Number(r.insumo_id);
      const req = Number(r.cantidad_requerida);
      if (!Number.isFinite(rawId) || rawId <= 0 || !Number.isFinite(req) || req <= 0) continue;
      const key =
        rawId >= INSUMO_ID_VIRTUAL_BASE ? `c:${rawId - INSUMO_ID_VIRTUAL_BASE}` : `l:${rawId}`;
      const add = req * prepQty;
      need.set(key, (need.get(key) || 0) + add);
    }
  }
  for (const [k, v] of [...need.entries()]) {
    if (!k.startsWith('l:') || v <= 0) continue;
    const lid = Number(k.slice(2));
    const cidRow = await client.query(
      `SELECT p.id FROM productos p
       INNER JOIN insumos i ON LOWER(TRIM(i.nombre)) = LOWER(TRIM(p.nombre))
       WHERE i.id = $1 AND COALESCE(p.tipo_producto, 'terminado') = 'insumo'
       LIMIT 1`,
      [lid]
    );
    if (cidRow.rows[0]?.id != null) {
      const cid = Number(cidRow.rows[0].id);
      const ckey = `c:${cid}`;
      need.set(ckey, (need.get(ckey) || 0) + v);
      need.delete(k);
    }
  }
  return need;
};

let detallePreparacionColReady = null;
const ensureProduccionDetallePreparacion = async () => {
  if (!detallePreparacionColReady) {
    detallePreparacionColReady = pool.query(
      `ALTER TABLE produccion ADD COLUMN IF NOT EXISTS detalle_preparacion JSONB DEFAULT '[]'::jsonb`
    );
  }
  try {
    await detallePreparacionColReady;
  } catch (_e) {
    detallePreparacionColReady = null;
  }
};

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

const validateProduccionCreateFromPedido = (data = {}) => {
  const pedidoId = Number(data.pedido_id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    const error = new Error('pedido_id es obligatorio para crear la orden');
    error.statusCode = 400;
    throw error;
  }
  const tiempoPreparacion = Number(data.tiempo_preparacion_minutos ?? 0);
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
 * tienen saldo (cantidad mayor que cero) en la fila de entrega.
 */
const getInsumosEntregadosByProductor = async (productorId) => {
  const id = Number(productorId);
  if (!Number.isFinite(id) || id <= 0) return [];

  await ensureEntregasInsumoProductoCatalogo();
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
       AND COALESCE(ei.cantidad, 0) > 0
       AND COALESCE(ei.anulada, FALSE) = FALSE
     ORDER BY ei.fecha DESC, ei.hora DESC NULLS LAST, ei.id DESC`,
    [id]
  );
  return result.rows;
};

const Produccion = {
  getInsumosEntregadosByProductor,
  getAll: async (options = {}) => {
    await ensureProduccionDetallePreparacion();
    const prodId = Number(options.productorUserId);
    const filterProductor = Number.isFinite(prodId) && prodId > 0;
    const params = filterProductor ? [prodId] : [];
    const whereProductor = filterProductor ? ' WHERE p.productor_id = $1 ' : '';
    
    const result = await pool.query(`
      SELECT p.*, pr.nombre as producto_nombre, p.responsable as productor_nombre,
             pe.numero_pedido as pedido_numero
      FROM produccion p
      JOIN productos pr ON p.producto_id = pr.id
      LEFT JOIN pedidos pe ON pe.id = p.pedido_id
      ${whereProductor}
      ORDER BY p.fecha DESC
    `, params);
    return result.rows;
  },
  getById: async (id) => {
    await ensureProductoInsumosTable();
    await ensureProduccionDetallePreparacion();
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

    return produccion;
  },
  create: async (data) => {
    validateProduccionCreateFromPedido(data);
    await ensureProductoTipoColumn();
    await ensureProductoInsumosTable();
    await ensureProduccionDetallePreparacion();
    await ensureEntregasInsumoProductoCatalogo();

    const estadoInicial = normalizeProduccionStatus(data.estado) || 'Orden Recibida';
    const numeroProduccion =
      data.numero_produccion && String(data.numero_produccion).trim()
        ? String(data.numero_produccion).trim()
        : `ORD-${Date.now()}`;

    const pedidoId = Number(data.pedido_id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const dupPedido = await client.query('SELECT id FROM produccion WHERE pedido_id = $1 LIMIT 1', [pedidoId]);
      if (dupPedido.rows[0]) {
        const err = new Error('Este pedido ya tiene una orden de producción registrada');
        err.statusCode = 409;
        throw err;
      }

      const prepLinesRes = await client.query(
        `SELECT dp.producto_id,
                dp.cantidad,
                pr.nombre AS producto_nombre,
                COALESCE(pr.tipo_producto, 'terminado') AS tipo_producto,
                pr.estado
         FROM detalle_pedidos dp
         INNER JOIN productos pr ON pr.id = dp.producto_id
         WHERE dp.pedido_id = $1
           AND COALESCE(pr.tipo_producto, 'terminado') = 'preparacion'
         ORDER BY dp.id ASC`,
        [pedidoId]
      );
      if (!prepLinesRes.rows.length) {
        const err = new Error('El pedido no tiene productos de tipo preparación en el detalle');
        err.statusCode = 409;
        throw err;
      }

      const mergedByProducto = new Map();
      for (const r of prepLinesRes.rows) {
        const pid = Number(r.producto_id);
        const qtyRaw = Number(r.cantidad);
        const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;
        const prev = mergedByProducto.get(pid);
        if (prev) {
          prev.cantidad += qty;
        } else {
          mergedByProducto.set(pid, {
            producto_id: pid,
            cantidad: qty,
            producto_nombre: r.producto_nombre,
          });
        }
      }

      const detallePreparacion = [...mergedByProducto.values()];

      const productoIds = [...new Set(detallePreparacion.map((d) => d.producto_id))];
      const prodsRes = await client.query(
        `SELECT id, nombre, estado, COALESCE(tipo_producto, 'terminado') AS tipo_producto
         FROM productos WHERE id = ANY($1::int[]) FOR UPDATE`,
        [productoIds]
      );
      const byId = new Map(prodsRes.rows.map((row) => [Number(row.id), row]));
      for (const pid of productoIds) {
        const prod = byId.get(pid);
        if (!prod) {
          const err = new Error(`Producto no encontrado (id ${pid})`);
          err.statusCode = 404;
          throw err;
        }
        if (String(prod.estado) !== 'Activo') {
          const err = new Error(`El producto «${prod.nombre}» debe estar activo`);
          err.statusCode = 409;
          throw err;
        }
        if (String(prod.tipo_producto) !== 'preparacion') {
          const err = new Error('Solo se programan órdenes para productos de tipo preparación');
          err.statusCode = 400;
          throw err;
        }
      }

      const productoIdPrincipal = detallePreparacion[0].producto_id;
      const cantidadTotal = detallePreparacion.reduce((sum, line) => sum + line.cantidad, 0);

      let insumosEntregadosUsados = [];
      const insumosInput = Array.isArray(data.insumos) ? data.insumos : [];
      const idsEntregas = [...new Set(insumosInput.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];

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
             AND COALESCE(ei.anulada, FALSE) = FALSE
           FOR UPDATE OF ei`,
          [idsEntregas]
        );
        if (entregasRes.rows.length !== idsEntregas.length) {
          const err = new Error('Una o mas entregas de insumos no existen');
          err.statusCode = 400;
          throw err;
        }
        const rowsById = new Map(entregasRes.rows.map((r) => [Number(r.id), r]));
        const needWorking = await buildPedidoInsumoNeedMap(client, detallePreparacion);

        for (const entId of idsEntregas) {
          const e = rowsById.get(entId);
          if (!e) {
            const err = new Error('Una o mas entregas de insumos no existen');
            err.statusCode = 400;
            throw err;
          }
          if (Number(e.operario_id) !== productorIdNum) {
            const err = new Error(
              `La entrega #${e.numero_entrega || e.id} no pertenece al productor seleccionado`
            );
            err.statusCode = 403;
            throw err;
          }
          const kEnt = entregaRecetaKey(e);
          if (!kEnt) {
            const err = new Error(
              `La entrega #${e.numero_entrega || e.id} no tiene un insumo de catálogo o legacy asociado`
            );
            err.statusCode = 400;
            throw err;
          }
          const pendiente = needWorking.get(kEnt) || 0;
          const disponible = Number(e.cantidad ?? 0);
          if (pendiente > 0 && (!Number.isFinite(disponible) || disponible <= 0)) {
            const err = new Error(
              `La entrega #${e.numero_entrega || e.id} no tiene saldo suficiente para cubrir la receta (falta asignar ${pendiente} unidades de receta para ${kEnt})`
            );
            err.statusCode = 409;
            throw err;
          }
          if (pendiente <= 0 || !Number.isFinite(disponible) || disponible <= 0) {
            continue;
          }

          const take = Math.min(disponible, pendiente);
          if (take <= 0) continue;

          await client.query(
            `UPDATE entregas_insumos
             SET cantidad = GREATEST(0, COALESCE(cantidad, 0) - $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [take, e.id]
          );
          needWorking.set(kEnt, pendiente - take);
          insumosEntregadosUsados.push({
            entrega_id: Number(e.id),
            insumo_id: Number(
              e.insumo_id != null && e.insumo_id !== ''
                ? e.insumo_id
                : e.producto_catalogo_id != null && e.producto_catalogo_id !== ''
                  ? e.producto_catalogo_id
                  : 0
            ),
            insumo_nombre: e.insumo_nombre,
            cantidad: take,
            cantidad_descontada: take,
            unidad: e.unidad,
            numero_entrega: e.numero_entrega,
          });
        }

        const EPS = 1e-6;
        const faltas = [...needWorking.entries()].filter(([, v]) => v > EPS);
        if (faltas.length > 0) {
          const err = new Error(
            `Las entregas al productor no cubren la receta del pedido. Pendiente (cantidad × receta): ${faltas
              .map(([k, v]) => `${k}=${Number(v.toFixed(4))}`)
              .join(', ')}`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      const detalleJson = JSON.stringify(detallePreparacion);

      const insResult = await client.query(
        `INSERT INTO produccion (
          numero_produccion, producto_id, pedido_id, cantidad, fecha, responsable,
          tiempo_preparacion_minutos, estado, notes, insumos_gastados, detalle_preparacion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING id`,
        [
          numeroProduccion,
          productoIdPrincipal,
          pedidoId,
          cantidadTotal,
          data.fecha,
          data.responsable,
          data.tiempo_preparacion_minutos ?? 0,
          estadoInicial,
          data.notes ?? null,
          insumosEntregadosUsados.length > 0
            ? JSON.stringify(insumosEntregadosUsados)
            : Array.isArray(data.insumos_gastados)
              ? JSON.stringify(data.insumos_gastados)
              : '[]',
          detalleJson,
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
      await ensureEntregasInsumoProductoCatalogo();

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
        const tipoRes = await client.query(
          `SELECT COALESCE(tipo_producto, 'terminado') AS tipo_producto FROM productos WHERE id = $1`,
          [current.producto_id]
        );
        const tipoProd = String(tipoRes.rows[0]?.tipo_producto || 'terminado');
        if (tipoProd !== 'preparacion') {
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
      }

      if (nextStatus === 'Cancelada') {
        let gastados = [];
        try {
          const raw = current.insumos_gastados;
          if (Array.isArray(raw)) gastados = raw;
          else if (typeof raw === 'string' && raw.trim()) gastados = JSON.parse(raw);
          else if (raw && typeof raw === 'object') gastados = raw;
        } catch (_e) {
          gastados = [];
        }
        for (const g of gastados) {
          const entregaId = Number(g.entrega_id);
          const restore = Number(g.cantidad_descontada ?? 0);
          if (!Number.isInteger(entregaId) || entregaId <= 0 || !Number.isFinite(restore) || restore <= 0) continue;
          await client.query(
            `UPDATE entregas_insumos
             SET cantidad = COALESCE(cantidad, 0) + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [restore, entregaId]
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
