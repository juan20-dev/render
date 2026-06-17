/**
 * Modelo Productos
 *
 * Codigo distribuido desde entities.models.js. Tras la migracion,
 * entities.models.js permanece intacto pero desconectado: ningun consumidor
 * lo importa. La fuente activa es este archivo modular.
 */
const pool = require('../../../db');
const {
  ensureProductoImageColumn,
  ensureProductoTipoColumn,
  ensureProductoInsumoMedidaColumns,
  ensureProductoInsumosTable,
  normalizeProductoTipoValue,
  syncCategoriaProductCount,
  ensureCategoriaProductCountColumn,
  ensureMotivoEstado,
  checkInactivacionDependencias,
  ensureEntregasInsumoProductoCatalogo,
  registerProductoAudit,
} = require('../shared/auditoria');

/** Mensaje legible cuando PostgreSQL bloquea DELETE por FK en entregas_insumos. */
const productoDeleteBlockedByFk = (err, producto) => {
  if (err?.code !== '23503') return null;
  const constraint = String(err.constraint || '').toLowerCase();
  const detail = String(err.detail || '').toLowerCase();
  const esEntregasInsumo =
    constraint.includes('entregas_insumos') ||
    constraint.includes('producto_catalogo') ||
    detail.includes('entregas_insumos');
  if (!esEntregasInsumo) return null;

  const nombre = producto?.nombre ? `«${producto.nombre}»` : 'este producto';
  const esInsumo = String(producto?.tipo_producto || '').toLowerCase() === 'insumo';
  const msg = esInsumo
    ? `No se puede eliminar el insumo ${nombre} porque tiene entregas registradas a productores en «Entrega de Insumos». Anule esas entregas o deje el insumo como Inactivo.`
    : `No se puede eliminar ${nombre} porque tiene entregas de insumos vinculadas en «Entrega de Insumos». Revise ese módulo o inactiva el producto.`;

  const error = new Error(msg);
  error.statusCode = 409;
  return error;
};

const assertProductoEliminable = async (id, producto) => {
  await ensureEntregasInsumoProductoCatalogo();
  const entregas = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM entregas_insumos
     WHERE producto_catalogo_id = $1`,
    [id]
  );
  const total = Number(entregas.rows[0]?.total ?? 0);
  if (total <= 0) return;

  const nombre = producto?.nombre ? `«${producto.nombre}»` : 'este producto';
  const esInsumo = String(producto?.tipo_producto || '').toLowerCase() === 'insumo';
  const detalleEntregas =
    total === 1 ? '1 entrega registrada' : `${total} entregas registradas`;

  const msg = esInsumo
    ? `No se puede eliminar el insumo ${nombre} porque tiene ${detalleEntregas} a productores en «Entrega de Insumos». Anule esas entregas o deje el insumo como Inactivo.`
    : `No se puede eliminar ${nombre} porque tiene ${detalleEntregas} vinculadas en «Entrega de Insumos». Revise ese módulo o inactiva el producto.`;

  const error = new Error(msg);
  error.statusCode = 409;
  throw error;
};

const INSUMO_UNIDADES_VALIDAS = ['Unidades', 'Mililitros'];

const parseInsumoMedidasForProduct = (tipoProducto, data) => {
  if (tipoProducto !== 'insumo') return { u: null, q: null };
  const u = String(data?.insumo_unidad_medida ?? data?.insumoUnidadMedida ?? '').trim();
  if (!INSUMO_UNIDADES_VALIDAS.includes(u)) {
    const error = new Error(`Unidad de presentación inválida. Valores: ${INSUMO_UNIDADES_VALIDAS.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  const qRaw = Number(data?.insumo_cantidad_medida ?? data?.insumoCantidadMedida);
  if (!Number.isFinite(qRaw) || qRaw < 1 || !Number.isInteger(qRaw)) {
    const error = new Error(
      'El volumen / unidad debe ser un entero mayor o igual a 1: se usa en producción (recetas) para escalar el consumo; las entregas al productor descuentan el stock en la misma unidad que la cantidad entregada.'
    );
    error.statusCode = 400;
    throw error;
  }
  return { u, q: qRaw };
};

/** Última compra recibida por producto: precio de compra y % de ganancia para el detalle en catálogo. */
const ULTIMA_COMPRA_PRODUCTO_JOIN = `
  LEFT JOIN LATERAL (
    SELECT dc.precio_unitario, dc.porcentaje_ganancia
    FROM detalle_compras dc
    INNER JOIN compras co ON co.id = dc.compra_id
    WHERE dc.producto_id = p.id
      AND LOWER(TRIM(COALESCE(co.estado, ''))) IN ('recibida', 'completada')
    ORDER BY COALESCE(co.fecha, co.created_at::date) DESC, co.id DESC
    LIMIT 1
  ) ultima_compra ON TRUE
`;

const Productos = {
  getAll: async () => {
    await ensureProductoTipoColumn();
    await ensureProductoInsumoMedidaColumns();
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria,
             ultima_compra.precio_unitario AS precio_compra,
             ultima_compra.porcentaje_ganancia AS ganancia
      FROM productos p 
      JOIN categorias c ON p.categoria_id = c.id 
      ${ULTIMA_COMPRA_PRODUCTO_JOIN}
      ORDER BY
        CASE WHEN LOWER(TRIM(COALESCE(p.estado, ''))) = 'activo' THEN 0 ELSE 1 END,
        p.id DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    await ensureProductoInsumoMedidaColumns();
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria,
             ultima_compra.precio_unitario AS precio_compra,
             ultima_compra.porcentaje_ganancia AS ganancia
      FROM productos p 
      JOIN categorias c ON p.categoria_id = c.id 
      ${ULTIMA_COMPRA_PRODUCTO_JOIN}
      WHERE p.id = $1
    `, [id]);
    return result.rows[0];
  },
  getByCategory: async (categoryId) => {
    const result = await pool.query(
      'SELECT * FROM productos WHERE categoria_id = $1 ORDER BY nombre',
      [categoryId]
    );
    return result.rows;
  },
  create: async (data) => {
    await ensureCategoriaProductCountColumn();
    await ensureProductoTipoColumn();
    await ensureProductoInsumoMedidaColumns();
    const nombre = String(data?.nombre || '').trim();
    if (!nombre) {
      const error = new Error('El nombre del producto es obligatorio');
      error.statusCode = 400;
      throw error;
    }
    const tipoProducto = normalizeProductoTipoValue(data?.tipo_producto ?? data?.tipo);

    const duplicate = await pool.query(
      `SELECT id, estado
       FROM productos
       WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
         AND COALESCE(tipo_producto, 'terminado') = $2
       LIMIT 1`,
      [nombre, tipoProducto]
    );
    if (duplicate.rows[0]) {
      const error = new Error('Ya existe un producto con ese nombre para el mismo tipo');
      error.statusCode = 409;
      throw error;
    }

    const precioInicial = Number(data?.precio ?? data?.precioVenta);
    const precioSeguro = Number.isFinite(precioInicial) && precioInicial >= 0 ? precioInicial : 0;

    // Validar que stock sea 0 (stock se gestiona solo desde Compras)
    if (data.stock && Number(data.stock) !== 0) {
      const error = new Error('Stock inicial debe ser 0. Se modifica solo via Compras/Ajustes.');
      error.statusCode = 400;
      throw error;
    }

    if (tipoProducto === 'preparacion' && (!Number.isFinite(precioSeguro) || precioSeguro <= 0)) {
      const error = new Error('El precio de venta es obligatorio y debe ser mayor a 0 para productos de preparación');
      error.statusCode = 400;
      throw error;
    }
    const { u: insumoUnidad, q: insumoCantidad } = parseInsumoMedidasForProduct(tipoProducto, data);
    const smRawCreate = Number(data.stock_minimo ?? data.stockMinimo);
    const stockMinimoInsert =
      tipoProducto === 'preparacion'
        ? 0
        : tipoProducto === 'insumo'
          ? Number.isFinite(smRawCreate) && smRawCreate >= 0
            ? Math.floor(smRawCreate)
            : 0
          : Number(data.stock_minimo ?? data.stockMinimo) >= 0
            ? Number(data.stock_minimo ?? data.stockMinimo)
            : 10;

    const result = await pool.query(
      `INSERT INTO productos (
         nombre, categoria_id, descripcion, precio, stock, stock_minimo, imagen_url, estado, tipo_producto,
         insumo_unidad_medida, insumo_cantidad_medida
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        nombre,
        data.categoria_id,
        data.descripcion,
        precioSeguro,
        0, // ✅ Stock siempre inicia en 0
        stockMinimoInsert,
        data.imagen_url,
        'Activo',
        tipoProducto,
        insumoUnidad,
        insumoCantidad,
      ]
    );
    await syncCategoriaProductCount(data.categoria_id);
    const newId = result.rows[0].id;
    await registerProductoAudit({
      productoId: newId,
      accion: 'CREATE',
      usuarioId: data?.actor_id ?? null,
      cambios: {
        before: null,
        after: {
          nombre,
          categoria_id: data.categoria_id,
          precio: precioSeguro,
          stock_minimo: stockMinimoInsert,
          tipo_producto: tipoProducto,
          insumo_unidad_medida: insumoUnidad,
          insumo_cantidad_medida: insumoCantidad,
          estado: 'Activo',
        },
      },
    });
    return newId;
  },
  update: async (id, data) => {
    await ensureCategoriaProductCountColumn();
    await ensureProductoTipoColumn();
    await ensureProductoInsumoMedidaColumns();
    const nombre = String(data?.nombre || '').trim();
    if (!nombre) {
      const error = new Error('El nombre del producto es obligatorio');
      error.statusCode = 400;
      throw error;
    }

    const previous = await pool.query(
      'SELECT categoria_id, stock, tipo_producto, stock_minimo, imagen_url, insumo_unidad_medida, insumo_cantidad_medida FROM productos WHERE id = $1',
      [id]
    );
    if (!previous.rows[0]) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const previousCategoriaId = previous.rows[0]?.categoria_id ?? null;
    const stockActual = previous.rows[0]?.stock ?? 0;
    const currentTipo = normalizeProductoTipoValue(previous.rows[0]?.tipo_producto);

    const duplicate = await pool.query(
      `SELECT id
       FROM productos
       WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
         AND COALESCE(tipo_producto, 'terminado') = $2
         AND id <> $3
       LIMIT 1`,
      [nombre, currentTipo, id]
    );
    if (duplicate.rows[0]) {
      const error = new Error('Ya existe un producto con ese nombre para el mismo tipo');
      error.statusCode = 409;
      throw error;
    }
    const prevStockMinimo = Number(previous.rows[0]?.stock_minimo ?? 10);

    const newTipo = currentTipo;
    const prevRow = previous.rows[0];
    const mergedData = {
      ...data,
      insumo_unidad_medida:
        data.insumo_unidad_medida ?? data.insumoUnidadMedida ?? prevRow.insumo_unidad_medida,
      insumo_cantidad_medida:
        data.insumo_cantidad_medida ?? data.insumoCantidadMedida ?? prevRow.insumo_cantidad_medida,
    };
    const { u: insumoUnidad, q: insumoCantidad } = parseInsumoMedidasForProduct(newTipo, mergedData);
    const imagenUrl =
      data.imagen_url !== undefined && data.imagen_url !== null ? data.imagen_url : prevRow.imagen_url;
    const stockMinimoVal =
      newTipo === 'preparacion'
        ? 0
        : newTipo === 'insumo'
          ? data.stock_minimo !== undefined && data.stock_minimo !== null && Number.isFinite(Number(data.stock_minimo))
            ? Math.max(0, Math.floor(Number(data.stock_minimo)))
            : data.stockMinimo !== undefined && data.stockMinimo !== null && Number.isFinite(Number(data.stockMinimo))
              ? Math.max(0, Math.floor(Number(data.stockMinimo)))
              : prevStockMinimo
          : data.stock_minimo !== undefined && data.stock_minimo !== null && Number.isFinite(Number(data.stock_minimo))
            ? Number(data.stock_minimo)
            : data.stockMinimo !== undefined && data.stockMinimo !== null && Number.isFinite(Number(data.stockMinimo))
              ? Number(data.stockMinimo)
              : prevStockMinimo;

    await pool.query(
      `UPDATE productos
       SET nombre = $1,
           categoria_id = $2,
           descripcion = $3,
           precio = $4,
           stock = $5,
           stock_minimo = $6,
           imagen_url = $7,
           tipo_producto = $8,
           insumo_unidad_medida = $9,
           insumo_cantidad_medida = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11`,
      [
        nombre,
        data.categoria_id,
        data.descripcion,
        data.precio,
        newTipo === 'preparacion' ? 0 : stockActual,
        stockMinimoVal,
        imagenUrl,
        newTipo,
        insumoUnidad,
        insumoCantidad,
        id,
      ]
    );
    await syncCategoriaProductCount(data.categoria_id);
    if (previousCategoriaId && Number(previousCategoriaId) !== Number(data.categoria_id)) {
      await syncCategoriaProductCount(previousCategoriaId);
    }
    await registerProductoAudit({
      productoId: Number(id),
      accion: 'UPDATE',
      usuarioId: data?.actor_id ?? null,
      cambios: {
        before: { categoria_id: previousCategoriaId, stock: stockActual },
        after: {
          nombre,
          categoria_id: data.categoria_id,
          precio: data.precio,
          stock_minimo: stockMinimoVal,
          tipo_producto: newTipo,
          insumo_unidad_medida: insumoUnidad,
          insumo_cantidad_medida: insumoCantidad,
        },
      },
    });
    return true;
  },
  updateStatus: async (id, data = {}) => {
    const current = await Productos.getById(id);
    if (!current) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const estado = String(data?.estado || '').trim();
    if (!['Activo', 'Inactivo'].includes(estado)) {
      const error = new Error('Estado invalido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    ensureMotivoEstado(data?.motivo);

    if (current.estado === estado) {
      return current;
    }

    if (current.estado !== 'Inactivo' && estado === 'Inactivo') {
      await checkInactivacionDependencias('producto', id);
    }

    await pool.query(
      'UPDATE productos SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [estado, id]
    );

    await registerProductoAudit({
      productoId: Number(id),
      accion: 'STATUS_CHANGE',
      usuarioId: data?.actor_id ?? null,
      cambios: {
        before: { estado: current.estado },
        after: { estado },
        motivo: typeof data?.motivo === 'string' ? data.motivo.trim() : null,
      },
    });

    return Productos.getById(id);
  },
  delete: async (id, options = {}) => {
    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (!reason || reason.length < 10 || reason.length > 50) {
      const error = new Error('El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres');
      error.statusCode = 400;
      throw error;
    }

    await ensureCategoriaProductCountColumn();
    const previousFull = await Productos.getById(id);
    if (!previousFull) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }
    const previousCategoriaId = previousFull?.categoria_id ?? null;

    await assertProductoEliminable(id, previousFull);

    try {
      await pool.query('DELETE FROM productos WHERE id = $1', [id]);
    } catch (err) {
      const mapped = productoDeleteBlockedByFk(err, previousFull);
      if (mapped) throw mapped;
      throw err;
    }

    if (previousCategoriaId) {
      await syncCategoriaProductCount(previousCategoriaId);
    }
    await registerProductoAudit({
      productoId: Number(id),
      accion: 'DELETE',
      usuarioId: options?.actor_id ?? null,
      cambios: {
        before: previousFull
          ? {
              nombre: previousFull.nombre,
              categoria_id: previousCategoriaId,
              estado: previousFull.estado,
              stock: previousFull.stock,
            }
          : null,
        after: null,
        reason,
      },
    });
    return true;
  },
  getPublicCatalog: async () => {
    await ensureProductoTipoColumn();
    const categorias = await pool.query(`
      SELECT DISTINCT c.id, c.nombre
      FROM categorias c
      INNER JOIN productos p ON p.categoria_id = c.id
      WHERE p.estado = 'Activo' AND c.estado = 'Activo'
        AND (p.tipo_producto IS NULL OR p.tipo_producto IN ('terminado','preparacion'))
        AND COALESCE(p.tipo_producto, 'terminado') <> 'insumo'
      ORDER BY c.nombre
    `);
    const productos = await pool.query(`
      SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, p.imagen_url,
             COALESCE(p.tipo_producto, 'terminado') AS tipo_producto,
             c.nombre AS categoria
      FROM productos p
      INNER JOIN categorias c ON p.categoria_id = c.id
      WHERE p.estado = 'Activo' AND c.estado = 'Activo'
        AND (p.tipo_producto IS NULL OR p.tipo_producto IN ('terminado','preparacion'))
        AND COALESCE(p.tipo_producto, 'terminado') <> 'insumo'
      ORDER BY p.nombre
      LIMIT 200
    `);
    return { categorias: categorias.rows, productos: productos.rows };
  }
};

module.exports = Productos;
