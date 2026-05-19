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

const EPS = 1e-6;

/** ml por unidad de presentación (ej. botella 500 ml → 500). */
const mlPorUnidadFromCatalogHit = (hit) => {
  if (!hit) return null;
  const pu = String(hit.presentacion_unidad || '').trim();
  const q = Number(hit.presentacion_cantidad);
  if (/mililitro/i.test(pu) && Number.isFinite(q) && q > 0) return q;
  return null;
};

const isConsumoEnMililitros = (item) => /mililitro/i.test(String(item?.unidad || ''));

/** Convierte cantidad de consumo a unidades de entrega (FIFO en entregas_insumos). */
const consumoCantidadAUnidadesAlmacen = (item, catalogo) => {
  const cantidad = Number(item.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return cantidad;
  const clave = String(item.clave || '').trim();
  const hit = catalogo.find((c) => c.clave === clave);
  const ml = mlPorUnidadFromCatalogHit(hit);
  if (ml && isConsumoEnMililitros(item)) return cantidad / ml;
  return cantidad;
};

const parseConsumoClave = (clave) => {
  const s = String(clave || '').trim();
  const mC = s.match(/^c:(\d+)$/i);
  if (mC) return { tipo: 'catalogo', producto_catalogo_id: Number(mC[1]) };
  const mL = s.match(/^l:(\d+)$/i);
  if (mL) return { tipo: 'legacy', insumo_id: Number(mL[1]) };
  return null;
};

const aggregateEntregasByInsumo = (entregasRows) => {
  const map = new Map();
  for (const row of entregasRows) {
    const clave = entregaRecetaKey(row);
    if (!clave) {
      continue;
    }
    const qty = Number(row.cantidad ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const prev = map.get(clave);
    if (prev) {
      prev.disponible += qty;
    } else {
      map.set(clave, {
        clave,
        insumo_nombre: row.insumo_nombre,
        unidad: row.unidad,
        disponible: qty,
        producto_catalogo_id: row.producto_catalogo_id ?? null,
        insumo_id: row.insumo_id ?? null,
      });
    }
  }
  const result = [...map.values()].sort((a, b) =>
    String(a.insumo_nombre || '').localeCompare(String(b.insumo_nombre || ''), 'es')
  );
  return result;
};

const getInsumosAgregadosByProductor = async (productorId) => {
  const rows = await getInsumosEntregadosByProductor(productorId);
  const aggregated = aggregateEntregasByInsumo(rows);
  const catalogo = await buildCatalogoInsumosContext();
  return aggregated.map((a) => {
    const hit = catalogo.find((c) => c.clave === a.clave);
    const ml = mlPorUnidadFromCatalogHit(hit);
    if (ml) {
      const unidades = Number(a.disponible ?? 0);
      return {
        ...a,
        unidad: 'Mililitros',
        disponible_unidades: unidades,
        ml_por_unidad: ml,
        disponible: Number((unidades * ml).toFixed(4)),
      };
    }
    return {
      ...a,
      unidad: String(a.unidad || 'Unidades').trim() || 'Unidades',
    };
  });
};

const fetchDetallePreparacionPedido = async (clientOrPool, pedidoId) => {
  const q = clientOrPool.query ? clientOrPool : pool;
  const prepLinesRes = await q.query(
    `SELECT dp.producto_id,
            dp.cantidad,
            pr.nombre AS producto_nombre,
            COALESCE(pr.tipo_producto, 'terminado') AS tipo_producto
     FROM detalle_pedidos dp
     INNER JOIN productos pr ON pr.id = dp.producto_id
     WHERE dp.pedido_id = $1
       AND COALESCE(pr.tipo_producto, 'terminado') = 'preparacion'
     ORDER BY dp.id ASC`,
    [pedidoId]
  );
  const mergedByProducto = new Map();
  for (const r of prepLinesRes.rows) {
    const pid = Number(r.producto_id);
    const qtyRaw = Number(r.cantidad);
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;
    const prev = mergedByProducto.get(pid);
    if (prev) prev.cantidad += qty;
    else {
      mergedByProducto.set(pid, {
        producto_id: pid,
        cantidad: qty,
        producto_nombre: r.producto_nombre,
      });
    }
  }
  return [...mergedByProducto.values()];
};

const buildCatalogoInsumosContext = async () => {
  const rows = await InsumosModel.getResumenGestion();
  return rows.map((r) => ({
    clave: `c:${Number(r.producto_catalogo_id)}`,
    producto_catalogo_id: Number(r.producto_catalogo_id),
    nombre: String(r.nombre || '').trim(),
    unidad: (() => {
      const pu = String(r.presentacion_unidad || '').trim();
      if (/mililitro/i.test(pu)) return 'Mililitros';
      return String(r.unidad || 'Unidades').trim() || 'Unidades';
    })(),
    presentacion_cantidad: r.presentacion_cantidad != null ? Number(r.presentacion_cantidad) : null,
    presentacion_unidad: r.presentacion_unidad != null ? String(r.presentacion_unidad) : null,
  }));
};

const resolveClaveFromAiItem = (item, catalogo) => {
  const parsed = parseConsumoClave(item?.clave);
  if (parsed?.tipo === 'catalogo') {
    const hit = catalogo.find((c) => c.producto_catalogo_id === parsed.producto_catalogo_id);
    if (hit) return { clave: hit.clave, insumo_nombre: hit.nombre, unidad: item.unidad || hit.unidad };
  }
  const nombreAi = String(item?.insumo_nombre || item?.nombre || '').trim().toLowerCase();
  if (nombreAi) {
    const hit = catalogo.find((c) => c.nombre.toLowerCase() === nombreAi);
    if (hit) return { clave: hit.clave, insumo_nombre: hit.nombre, unidad: item.unidad || hit.unidad };
    const partial = catalogo.find(
      (c) => c.nombre.toLowerCase().includes(nombreAi) || nombreAi.includes(c.nombre.toLowerCase())
    );
    if (partial) return { clave: partial.clave, insumo_nombre: partial.nombre, unidad: item.unidad || partial.unidad };
  }
  return null;
};

const mergeConsumoList = (items) => {
  const map = new Map();
  for (const raw of items) {
    const cantidad = Number(raw.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
    const clave = String(raw.clave || '').trim();
    if (!clave) continue;
    const prev = map.get(clave);
    if (prev) {
      prev.cantidad += cantidad;
    } else {
      map.set(clave, {
        clave,
        insumo_nombre: raw.insumo_nombre,
        cantidad,
        unidad: raw.unidad || 'Unidades',
      });
    }
  }
  return [...map.values()];
};

const computeFaltantes = (sugerido, disponibleAgregado, catalogo = []) => {
  const dispMap = new Map(disponibleAgregado.map((d) => [d.clave, Number(d.disponible ?? 0)]));
  const faltantes = [];
  for (const s of sugerido) {
    const req = Number(s.cantidad);
    const have = dispMap.get(s.clave) ?? 0;
    if (req > have + EPS) {
      faltantes.push({
        clave: s.clave,
        insumo_nombre: s.insumo_nombre,
        requerido: req,
        disponible: have,
        falta: Number((req - have).toFixed(4)),
        unidad: s.unidad || 'Unidades',
      });
    }
  }
  return faltantes;
};

/**
 * Descuenta consumo del saldo en entregas_insumos (FIFO). No modifica productos.stock.
 */
const applyConsumoFIFO = async (client, productorId, consumoList) => {
  const productorIdNum = Number(productorId);
  const entregasRes = await client.query(
    `SELECT ei.id, ei.insumo_id, ei.producto_catalogo_id, ei.cantidad, ei.unidad, ei.operario_id,
            ei.numero_entrega, ei.fecha, ei.hora,
            COALESCE(i.nombre, pr.nombre) AS insumo_nombre
     FROM entregas_insumos ei
     LEFT JOIN insumos i ON i.id = ei.insumo_id
     LEFT JOIN productos pr ON pr.id = ei.producto_catalogo_id
     WHERE ei.operario_id = $1
       AND COALESCE(ei.cantidad, 0) > 0
       AND COALESCE(ei.anulada, FALSE) = FALSE
     ORDER BY ei.fecha ASC, ei.hora ASC NULLS LAST, ei.id ASC
     FOR UPDATE OF ei`,
    [productorIdNum]
  );

  const byClave = new Map();
  for (const e of entregasRes.rows) {
    const k = entregaRecetaKey(e);
    if (!k) continue;
    if (!byClave.has(k)) byClave.set(k, []);
    byClave.get(k).push(e);
  }

  const insumosGastados = [];

  for (const item of consumoList) {
    const clave = String(item.clave || '').trim();
    const need = Number(item.cantidad);
    if (!clave || !Number.isFinite(need) || need <= 0) continue;

    let remaining = need;
    const entregas = byClave.get(clave) || [];
    for (const e of entregas) {
      if (remaining <= EPS) break;
      const disponible = Number(e.cantidad ?? 0);
      if (!Number.isFinite(disponible) || disponible <= 0) continue;
      const take = Math.min(disponible, remaining);
      if (take <= 0) continue;

      await client.query(
        `UPDATE entregas_insumos
         SET cantidad = GREATEST(0, COALESCE(cantidad, 0) - $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [take, e.id]
      );
      e.cantidad = disponible - take;
      remaining -= take;

      insumosGastados.push({
        entrega_id: Number(e.id),
        clave,
        insumo_id: Number(
          e.insumo_id != null && e.insumo_id !== ''
            ? e.insumo_id
            : e.producto_catalogo_id != null && e.producto_catalogo_id !== ''
              ? e.producto_catalogo_id
              : 0
        ),
        insumo_nombre: e.insumo_nombre || item.insumo_nombre,
        cantidad: take,
        cantidad_descontada: take,
        unidad: e.unidad || item.unidad,
        numero_entrega: e.numero_entrega,
      });
    }

    if (remaining > EPS) {
      const err = new Error(
        `Stock insuficiente del productor para «${item.insumo_nombre || clave}»: faltan ${Number(
          remaining.toFixed(4)
        )} ${item.unidad || 'unidades'}. Registre una nueva entrega de insumos al productor.`
      );
      err.statusCode = 409;
      err.details = { clave, faltante: remaining };
      throw err;
    }
  }

  return insumosGastados;
};

const normalizeConsumoInput = (rawList, catalogo) => {
  if (!Array.isArray(rawList) || !rawList.length) return [];
  const items = [];
  for (const row of rawList) {
    const cantidadUi = Number(row.cantidad);
    if (!Number.isFinite(cantidadUi) || cantidadUi <= 0) continue;
    let clave = String(row.clave || '').trim();
    let insumo_nombre = row.insumo_nombre || row.nombre;
    let unidad = row.unidad;
    if (!clave) {
      const pid = Number(row.producto_catalogo_id);
      if (Number.isFinite(pid) && pid > 0) clave = `c:${pid}`;
    }
    if (!clave) {
      const resolved = resolveClaveFromAiItem(row, catalogo);
      if (resolved) {
        clave = resolved.clave;
        insumo_nombre = insumo_nombre || resolved.insumo_nombre;
        unidad = unidad || resolved.unidad;
      }
    }
    if (!clave) continue;
    const itemUi = { clave, insumo_nombre, cantidad: cantidadUi, unidad: unidad || 'Unidades' };
    const cantidadAlmacen = consumoCantidadAUnidadesAlmacen(itemUi, catalogo);
    items.push({
      clave,
      insumo_nombre,
      cantidad: cantidadAlmacen,
      unidad: itemUi.unidad,
    });
  }
  return mergeConsumoList(items);
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

/** Convierte necesidad de receta (unidades almacén) a lista de consumo para la UI. */
const needMapToSugeridoList = (need, catalogo) => {
  const items = [];
  for (const [clave, cantidadAlmacen] of need.entries()) {
    const qty = Number(cantidadAlmacen);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const hit = catalogo.find((c) => c.clave === clave);
    if (!hit) {
      items.push({
        clave,
        insumo_nombre: clave,
        cantidad: qty,
        unidad: 'Unidades',
      });
      continue;
    }
    const ml = mlPorUnidadFromCatalogHit(hit);
    items.push({
      clave,
      insumo_nombre: hit.nombre,
      cantidad: ml ? Number((qty * ml).toFixed(4)) : qty,
      unidad: ml ? 'Mililitros' : hit.unidad || 'Unidades',
    });
  }
  return mergeConsumoList(items);
};

const sugerirConsumoInsumos = async (pedidoId, productorId) => {
  const pid = Number(pedidoId);
  const prodId = Number(productorId);
  if (!Number.isInteger(pid) || pid <= 0) {
    const err = new Error('pedido_id inválido');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(prodId) || prodId <= 0) {
    const err = new Error('productor_id inválido');
    err.statusCode = 400;
    throw err;
  }

  const preparaciones = await fetchDetallePreparacionPedido(pool, pid);
  if (!preparaciones.length) {
    const err = new Error('El pedido no tiene productos de tipo preparación');
    err.statusCode = 409;
    throw err;
  }

  const catalogo = await buildCatalogoInsumosContext();
  if (!catalogo.length) {
    const err = new Error('No hay insumos activos en el catálogo para calcular la receta');
    err.statusCode = 409;
    throw err;
  }

  const need = await buildPedidoInsumoNeedMap(pool, preparaciones);
  if (!need.size) {
    const err = new Error(
      'No hay recetas de insumos configuradas para los productos de preparación del pedido. Configure producto-insumos en el catálogo.'
    );
    err.statusCode = 409;
    throw err;
  }

  const disponible = await getInsumosAgregadosByProductor(prodId);
  const sugerido = needMapToSugeridoList(need, catalogo);
  const faltantes = computeFaltantes(sugerido, disponible, catalogo);

  return {
    preparaciones,
    disponible,
    sugerido,
    faltantes,
    receta_origen: 'recetas_catalogo',
  };
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

/** Al completar la orden de producción, el pedido vinculado pasa a Completado (regla de negocio). */
const syncPedidoCompletadoDesdeOrden = async (executor, pedidoId) => {
  const pid = Number(pedidoId);
  if (!Number.isInteger(pid) || pid <= 0) return;
  await executor.query(
    `UPDATE pedidos
     SET estado = 'Completado', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND LOWER(TRIM(COALESCE(estado, ''))) NOT IN ('completado', 'cancelado')`,
    [pid]
  );
};

/** Repara pedidos que quedaron desincronizados tras órdenes ya en Orden Lista. */
const repairPedidosConOrdenProduccionCompletada = async (executor = pool) => {
  await executor.query(
    `UPDATE pedidos pe
     SET estado = 'Completado', updated_at = CURRENT_TIMESTAMP
     FROM produccion pr
     WHERE pr.pedido_id = pe.id
       AND TRIM(pr.estado) = 'Orden Lista'
       AND LOWER(TRIM(COALESCE(pe.estado, ''))) NOT IN ('completado', 'cancelado')`
  );
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
  const productorId = Number(data.productor_id);
  if (!Number.isInteger(productorId) || productorId <= 0) {
    const error = new Error('productor_id es obligatorio para crear la orden');
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
  const consumo = data.consumo_insumos;
  if (!Array.isArray(consumo) || consumo.length === 0) {
    const error = new Error(
      'Debe definir el consumo de insumos (use «Seleccionar insumos rápidos» antes de crear la orden)'
    );
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
  getInsumosAgregadosByProductor,
  sugerirConsumoInsumos,
  getAll: async (options = {}) => {
    await ensureProduccionDetallePreparacion();
    await repairPedidosConOrdenProduccionCompletada();
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

    const estadoInicial = normalizeProduccionStatus(data.estado) || 'Orden Recibida';
    const numeroProduccion =
      data.numero_produccion && String(data.numero_produccion).trim()
        ? String(data.numero_produccion).trim()
        : `ORD-${Date.now()}`;

    const pedidoId = Number(data.pedido_id);
    const productorIdNum = Number(data.productor_id);
    const tiempoPrep = Math.max(1, Math.floor(Number(data.tiempo_preparacion_minutos ?? 0)));

    const dupPedido = await pool.query('SELECT id FROM produccion WHERE pedido_id = $1 LIMIT 1', [pedidoId]);
    if (dupPedido.rows[0]) {
      const err = new Error('Este pedido ya tiene una orden de producción registrada');
      err.statusCode = 409;
      throw err;
    }

    const detallePreparacion = await fetchDetallePreparacionPedido(pool, pedidoId);
    if (!detallePreparacion.length) {
      const err = new Error('El pedido no tiene productos de tipo preparación en el detalle');
      err.statusCode = 409;
      throw err;
    }

    const productoIds = [...new Set(detallePreparacion.map((d) => d.producto_id))];
    const prodsRes = await pool.query(
      `SELECT id, nombre, estado, COALESCE(tipo_producto, 'terminado') AS tipo_producto
       FROM productos WHERE id = ANY($1::int[])`,
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

    const catalogo = await buildCatalogoInsumosContext();
    const consumoList = normalizeConsumoInput(data.consumo_insumos, catalogo);
    if (!consumoList.length) {
      const err = new Error(
        'El consumo de insumos no es válido. Seleccione insumos con cantidad mayor a cero antes de crear la orden.'
      );
      err.statusCode = 400;
      throw err;
    }

    const disponibleAgregado = await getInsumosAgregadosByProductor(productorIdNum);
    const consumoUi = mergeConsumoList(
      (Array.isArray(data.consumo_insumos) ? data.consumo_insumos : [])
        .map((row) => {
          let clave = String(row.clave || '').trim();
          if (!clave) {
            const pidCat = Number(row.producto_catalogo_id);
            if (Number.isFinite(pidCat) && pidCat > 0) clave = `c:${pidCat}`;
          }
          return {
            clave,
            insumo_nombre: row.insumo_nombre || row.nombre,
            cantidad: Number(row.cantidad),
            unidad: row.unidad,
          };
        })
        .filter((r) => r.clave && Number.isFinite(r.cantidad) && r.cantidad > 0)
    );
    const faltantes = computeFaltantes(consumoUi, disponibleAgregado, catalogo);
    if (faltantes.length > 0) {
      const detalle = faltantes
        .map(
          (f) =>
            `${f.insumo_nombre}: faltan ${f.falta} ${f.unidad} (requiere ${f.requerido}, tiene ${f.disponible})`
        )
        .join('; ');
      const err = new Error(
        `El productor no tiene insumos suficientes. ${detalle}. Registre una nueva entrega de insumos al productor.`
      );
      err.statusCode = 409;
      err.details = { faltantes };
      throw err;
    }

    let responsable = data.responsable != null ? String(data.responsable).trim() : '';
    if (!responsable && productorIdNum > 0) {
      const uRes = await pool.query(
        `SELECT nombre, apellido FROM usuarios WHERE id = $1 LIMIT 1`,
        [productorIdNum]
      );
      responsable = `${uRes.rows[0]?.nombre || ''} ${uRes.rows[0]?.apellido || ''}`.trim();
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL lock_timeout = '8s'`);

      const dupTx = await client.query('SELECT id FROM produccion WHERE pedido_id = $1 LIMIT 1 FOR UPDATE', [
        pedidoId,
      ]);
      if (dupTx.rows[0]) {
        const err = new Error('Este pedido ya tiene una orden de producción registrada');
        err.statusCode = 409;
        throw err;
      }

      const insumosEntregadosUsados = await applyConsumoFIFO(client, productorIdNum, consumoList);
      const detalleJson = JSON.stringify(detallePreparacion);

      const insResult = await client.query(
        `INSERT INTO produccion (
          numero_produccion, producto_id, pedido_id, cantidad, fecha, responsable,
          productor_id, tiempo_preparacion_minutos, estado, notes, insumos_gastados, detalle_preparacion
        ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb) RETURNING id`,
        [
          numeroProduccion,
          productoIdPrincipal,
          pedidoId,
          cantidadTotal,
          data.fecha,
          responsable || null,
          productorIdNum,
          tiempoPrep,
          estadoInicial,
          data.notes ?? null,
          JSON.stringify(insumosEntregadosUsados),
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
    const prev = await pool.query('SELECT pedido_id, estado FROM produccion WHERE id = $1', [id]);
    const row = prev.rows[0];
    if (!row) {
      const error = new Error('Registro de produccion no encontrado');
      error.statusCode = 404;
      throw error;
    }
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
    if (
      estadoActualizado === 'Orden Lista' &&
      normalizeProduccionStatus(row.estado) !== 'Orden Lista'
    ) {
      const pedidoId = data.pedido_id ?? row.pedido_id;
      await syncPedidoCompletadoDesdeOrden(pool, pedidoId);
    }
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
      await repairPedidosConOrdenProduccionCompletada(client);

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
        if (current.pedido_id) {
          await syncPedidoCompletadoDesdeOrden(client, current.pedido_id);
        }
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

      if (nextStatus === 'Orden Lista' && current.pedido_id) {
        await syncPedidoCompletadoDesdeOrden(client, current.pedido_id);
      }

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

Produccion.repairPedidosConOrdenProduccionCompletada = repairPedidosConOrdenProduccionCompletada;

module.exports = Produccion;
