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
  registerProductoAudit,
} = require('../shared/auditoria');

const INSUMO_UNIDADES_VALIDAS = ['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros'];

const parseInsumoMedidasForProduct = (tipoProducto, data) => {
  if (tipoProducto !== 'insumo') return { u: null, q: null };
  const u = String(data?.insumo_unidad_medida ?? data?.insumoUnidadMedida ?? '').trim();
  if (!INSUMO_UNIDADES_VALIDAS.includes(u)) {
    const error = new Error(`Unidad de presentación inválida. Valores: ${INSUMO_UNIDADES_VALIDAS.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  const q = Number(data?.insumo_cantidad_medida ?? data?.insumoCantidadMedida);
  if (!Number.isFinite(q) || q <= 0) {
    const error = new Error('La cantidad / volumen de presentación del insumo debe ser mayor a 0');
    error.statusCode = 400;
    throw error;
  }
  return { u, q };
};

const Productos = {
  getAll: async () => {
    await ensureProductoTipoColumn();
    await ensureProductoInsumoMedidaColumns();
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria 
      FROM productos p 
      JOIN categorias c ON p.categoria_id = c.id 
      ORDER BY
        CASE WHEN LOWER(TRIM(COALESCE(p.estado, ''))) = 'activo' THEN 0 ELSE 1 END,
        p.id DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    await ensureProductoInsumoMedidaColumns();
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria 
      FROM productos p 
      JOIN categorias c ON p.categoria_id = c.id 
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

    const duplicate = await pool.query(
      'SELECT id, estado FROM productos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1',
      [nombre]
    );
    if (duplicate.rows[0]) {
      const error = new Error('Ya existe un producto con ese nombre');
      error.statusCode = 409;
      throw error;
    }

    const precioInicial = Number(data?.precio);
    const precioSeguro = Number.isFinite(precioInicial) && precioInicial >= 0 ? precioInicial : 0;

    // Validar que stock sea 0 (stock se gestiona solo desde Compras)
    if (data.stock && Number(data.stock) !== 0) {
      const error = new Error('Stock inicial debe ser 0. Se modifica solo via Compras/Ajustes.');
      error.statusCode = 400;
      throw error;
    }

    const tipoProducto = normalizeProductoTipoValue(data?.tipo_producto ?? data?.tipo);
    const { u: insumoUnidad, q: insumoCantidad } = parseInsumoMedidasForProduct(tipoProducto, data);

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
        data.stock_minimo || 10,
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
          stock_minimo: data.stock_minimo || 10,
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

    const duplicate = await pool.query(
      'SELECT id FROM productos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1',
      [nombre, id]
    );
    if (duplicate.rows[0]) {
      const error = new Error('Ya existe un producto con ese nombre');
      error.statusCode = 409;
      throw error;
    }

    const previous = await pool.query(
      'SELECT categoria_id, stock, tipo_producto FROM productos WHERE id = $1',
      [id]
    );
    const previousCategoriaId = previous.rows[0]?.categoria_id ?? null;
    const stockActual = previous.rows[0]?.stock ?? 0;
    const currentTipo = normalizeProductoTipoValue(previous.rows[0]?.tipo_producto);

    const tipoProductoInput =
      data.tipo_producto !== undefined || data.tipo !== undefined
        ? normalizeProductoTipoValue(data?.tipo_producto ?? data?.tipo)
        : undefined;
    const newTipo = tipoProductoInput !== undefined ? tipoProductoInput : currentTipo;
    const { u: insumoUnidad, q: insumoCantidad } = parseInsumoMedidasForProduct(newTipo, data);

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
        stockActual,
        data.stock_minimo,
        data.imagen_url,
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
          stock_minimo: data.stock_minimo,
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
    await ensureCategoriaProductCountColumn();
    const previousFull = await Productos.getById(id);
    const previousCategoriaId = previousFull?.categoria_id ?? null;
    await pool.query('DELETE FROM productos WHERE id = $1', [id]);
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
      SELECT p.id, p.nombre, p.descripcion, p.precio, p.imagen_url, c.nombre AS categoria
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
