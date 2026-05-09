const pool = require('../../db');
const bcrypt = require('bcryptjs');
const { generateTempPassword } = require('../utils/credentials');
const { parseMoneyCO } = require('../controllers/normalizador-http');

let ventasMoneyColumnsReady = null;
const ensureVentasMoneyColumns = async () => {
  if (!ventasMoneyColumnsReady) {
    ventasMoneyColumnsReady = (async () => {
      await pool.query(`
        ALTER TABLE ventas
          ALTER COLUMN total TYPE NUMERIC(18,2),
          ALTER COLUMN abono_recibido TYPE NUMERIC(18,2)
      `);
      await pool.query(`
        ALTER TABLE detalle_ventas
          ALTER COLUMN precio_unitario TYPE NUMERIC(18,2),
          ALTER COLUMN subtotal TYPE NUMERIC(18,2)
      `);
    })();
  }
  try {
    await ventasMoneyColumnsReady;
  } catch (_e) {
    ventasMoneyColumnsReady = null;
  }
};

const nextNumeroVenta = () => `VTA-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

let productoImageColumnReady = null;
let categoriaProductCountColumnReady = null;

const ensureProductoImageColumn = async () => {
  if (!productoImageColumnReady) {
    productoImageColumnReady = pool.query('ALTER TABLE productos ALTER COLUMN imagen_url TYPE TEXT');
  }

  try {
    await productoImageColumnReady;
  } catch (error) {
    // Ignore if table/column is not ready yet; create/update queries will still report precise errors.
  }
};

let productoTipoColumnReady = null;
const ensureProductoTipoColumn = async () => {
  if (!productoTipoColumnReady) {
    productoTipoColumnReady = pool.query(
      `ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_producto VARCHAR(30) NOT NULL DEFAULT 'terminado'`
    );
  }
  try {
    await productoTipoColumnReady;
  } catch (_error) {
    // ignore
  }
  try {
    await pool.query(`ALTER TABLE productos ALTER COLUMN precio TYPE NUMERIC(18,2)`);
  } catch (_e) {
    /* ya ampliado o permisos */
  }
};

let productoInsumosTableReady = null;
const ensureProductoInsumosTable = async () => {
  if (!productoInsumosTableReady) {
    productoInsumosTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS producto_insumos (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
        cantidad_requerida DECIMAL(12, 4) NOT NULL CHECK (cantidad_requerida > 0),
        unidad VARCHAR(20) NOT NULL,
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (producto_id, insumo_id)
      )
    `);
  }
  try {
    await productoInsumosTableReady;
  } catch (_error) {
    // ignore
  }
};

const normalizeProductoTipoValue = (raw) => {
  const compact = String(raw ?? 'terminado')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (compact === 'preparacion' || compact === 'de_preparacion') return 'preparacion';
  return 'terminado';
};

const syncCategoriaProductCount = async (categoriaId = null) => {
  if (categoriaId === null || categoriaId === undefined) {
    await pool.query(`
      UPDATE categorias c
      SET cantidad_productos = (
        SELECT COUNT(*)
        FROM productos p
        WHERE p.categoria_id = c.id
      )
    `);
    return;
  }

  await pool.query(
    `UPDATE categorias c
     SET cantidad_productos = (
       SELECT COUNT(*)
       FROM productos p
       WHERE p.categoria_id = c.id
     )
     WHERE c.id = $1`,
    [categoriaId]
  );
};

const ensureCategoriaProductCountColumn = async () => {
  if (!categoriaProductCountColumnReady) {
    categoriaProductCountColumnReady = (async () => {
      await pool.query(`
        ALTER TABLE categorias
        ADD COLUMN IF NOT EXISTS cantidad_productos INTEGER NOT NULL DEFAULT 0
      `);
      await syncCategoriaProductCount();
    })();
  }

  await categoriaProductCountColumnReady;
};

const groupRowsBy = (rows, key) => {
  const grouped = new Map();

  for (const row of rows) {
    const groupKey = row[key];
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey).push(row);
  }

  return grouped;
};

const ensureMotivoEstado = (motivoRaw, min = 10, max = 50) => {
  const motivo = typeof motivoRaw === 'string' ? motivoRaw.trim() : '';
  if (!motivo || motivo.length < min || motivo.length > max) {
    const error = new Error(`El motivo es obligatorio y debe tener entre ${min} y ${max} caracteres`);
    error.statusCode = 400;
    throw error;
  }
  return motivo;
};

const checkInactivacionDependencias = async (tipo, id) => {
  try {
    const result = await pool.query('SELECT check_inactivacion($1, $2)::jsonb AS resultado', [tipo, id]);
    const payload = result.rows[0]?.resultado || {};
    const permitido = Boolean(payload.permitido);
    if (!permitido) {
      const error = new Error(payload.motivo || 'No se puede inactivar por dependencias activas');
      error.statusCode = 409;
      error.details = payload;
      throw error;
    }
    return true;
  } catch (error) {
    // Si la función aún no existe en BD, no romper runtime.
    if (error?.code === '42883' || /check_inactivacion/.test(String(error?.message || ''))) {
      return true;
    }
    throw error;
  }
};

/**
 * FUNCIONES GENÉRICAS PARA CONSULTAS A LA BD POSTGRESQL
 */

// ------- CATEGORÍAS -------
const Categorias = {
  getAll: async () => {
    await ensureCategoriaProductCountColumn();
    const result = await pool.query(`
      SELECT c.*,
             COALESCE(c.cantidad_productos, 0) AS productos
      FROM categorias c
      ORDER BY c.nombre
    `);
    return result.rows;
  },
  getById: async (id) => {
    await ensureCategoriaProductCountColumn();
    const result = await pool.query(
      `SELECT c.*,
              COALESCE(c.cantidad_productos, 0) AS productos
       FROM categorias c
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  create: async (data) => {
    await ensureProductoImageColumn();
    await ensureCategoriaProductCountColumn();

    const nombre = String(data?.nombre || '').trim();
    const descripcion = String(data?.descripcion || '').trim();
    const estado = String(data?.estado || 'Activo').trim();

    if (!nombre) {
      const error = new Error('El nombre de la categoría es obligatorio');
      error.statusCode = 400;
      throw error;
    }

    // Validar estado permitido
    if (!['Activo', 'Inactivo'].includes(estado)) {
      const error = new Error('Estado inválido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    const duplicate = await pool.query(
      'SELECT id, estado FROM categorias WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1',
      [nombre]
    );
    if (duplicate.rows[0]) {
      const error = new Error('Ya existe una categoría con ese nombre');
      error.statusCode = 409;
      throw error;
    }

    const result = await pool.query(
      'INSERT INTO categorias (nombre, descripcion, estado, cantidad_productos) VALUES ($1, $2, $3, $4) RETURNING id',
      [nombre, descripcion || null, estado, 0]
    );
    const newId = result.rows[0].id;
    await registerCategoriaAudit({
      categoriaId: newId,
      accion: 'CREATE',
      usuarioId: data?.actor_id ?? null,
      cambios: { before: null, after: { nombre, descripcion: descripcion || null, estado } },
    });
    return newId;
  },
  update: async (id, data) => {
    await ensureProductoImageColumn();

    const nombre = String(data?.nombre || '').trim();
    const descripcion = String(data?.descripcion || '').trim();

    if (!nombre) {
      const error = new Error('El nombre de la categoría es obligatorio');
      error.statusCode = 400;
      throw error;
    }

    const duplicate = await pool.query(
      'SELECT id FROM categorias WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1',
      [nombre, id]
    );
    if (duplicate.rows[0]) {
      const error = new Error('Ya existe una categoría con ese nombre');
      error.statusCode = 409;
      throw error;
    }

    const previous = await Categorias.getById(id);
    await pool.query(
      'UPDATE categorias SET nombre = $1, descripcion = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [nombre, descripcion || null, id]
    );
    await registerCategoriaAudit({
      categoriaId: Number(id),
      accion: 'UPDATE',
      usuarioId: data?.actor_id ?? null,
      cambios: {
        before: previous
          ? { nombre: previous.nombre, descripcion: previous.descripcion }
          : null,
        after: { nombre, descripcion: descripcion || null },
      },
    });
    return true;
  },
  updateStatus: async (id, data = {}) => {
    const current = await Categorias.getById(id);
    if (!current) {
      const error = new Error('Categoria no encontrada');
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
      await checkInactivacionDependencias('categoria', id);
    }

    await pool.query(
      'UPDATE categorias SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [estado, id]
    );

    await registerCategoriaAudit({
      categoriaId: Number(id),
      accion: 'STATUS_CHANGE',
      usuarioId: data?.actor_id ?? null,
      cambios: {
        before: { estado: current.estado },
        after: { estado },
        motivo: typeof data?.motivo === 'string' ? data.motivo.trim() : null,
      },
    });

    return Categorias.getById(id);
  },
  delete: async (id, options = {}) => {
    const idNum = parseInt(String(id), 10);
    if (!Number.isFinite(idNum)) {
      const error = new Error('ID de categoría inválido');
      error.statusCode = 400;
      throw error;
    }

    const current = await Categorias.getById(idNum);
    if (!current) {
      const error = new Error('Categoria no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const countRes = await pool.query(
      'SELECT COUNT(*)::int AS n FROM productos WHERE categoria_id = $1',
      [idNum]
    );
    const numProductos = countRes.rows[0]?.n ?? 0;

    const rawDest = options.reubicarEnCategoriaId;
    const destId =
      rawDest === null || rawDest === undefined || rawDest === ''
        ? null
        : parseInt(String(rawDest), 10);

    if (numProductos === 0) {
      await pool.query('DELETE FROM categorias WHERE id = $1', [idNum]);
      await registerCategoriaAudit({
        categoriaId: idNum,
        accion: 'DELETE',
        usuarioId: options?.actor_id ?? null,
        cambios: {
          before: { nombre: current.nombre, estado: current.estado, productos_asociados: 0 },
          after: null,
        },
      });
      return true;
    }

    if (!Number.isFinite(destId)) {
      const error = new Error(
        `No se puede eliminar la categoría porque tiene ${numProductos} producto(s) asociado(s). ` +
          'Indique una categoría destino para reubicar los productos.'
      );
      error.statusCode = 400;
      throw error;
    }

    if (destId === idNum) {
      const error = new Error('La categoría destino debe ser distinta de la que se elimina');
      error.statusCode = 400;
      throw error;
    }

    const destRow = await pool.query('SELECT id FROM categorias WHERE id = $1 LIMIT 1', [destId]);
    if (!destRow.rows[0]) {
      const error = new Error('La categoría destino no existe');
      error.statusCode = 404;
      throw error;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE productos SET categoria_id = $1, updated_at = CURRENT_TIMESTAMP WHERE categoria_id = $2`,
        [destId, idNum]
      );
      await client.query('DELETE FROM categorias WHERE id = $1', [idNum]);
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (_r) {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }

    await ensureCategoriaProductCountColumn();
    await syncCategoriaProductCount(destId);

    await registerCategoriaAudit({
      categoriaId: idNum,
      accion: 'DELETE',
      usuarioId: options?.actor_id ?? null,
      cambios: {
        before: { nombre: current.nombre, estado: current.estado, productos_asociados: numProductos },
        after: null,
        productos_reubicados_a: destId,
      },
    });

    return true;
  }
};

// ------- PRODUCTOS -------
const Productos = {
  getAll: async () => {
    await ensureProductoTipoColumn();
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria 
      FROM productos p 
      JOIN categorias c ON p.categoria_id = c.id 
      ORDER BY p.nombre
    `);
    return result.rows;
  },
  getById: async (id) => {
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

    const result = await pool.query(
      'INSERT INTO productos (nombre, categoria_id, descripcion, precio, stock, stock_minimo, imagen_url, estado, tipo_producto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
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
          estado: 'Activo',
        },
      },
    });
    return newId;
  },
  update: async (id, data) => {
    await ensureCategoriaProductCountColumn();
    await ensureProductoTipoColumn();
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

    const previous = await pool.query('SELECT categoria_id, stock FROM productos WHERE id = $1', [id]);
    const previousCategoriaId = previous.rows[0]?.categoria_id ?? null;
    const stockActual = previous.rows[0]?.stock ?? 0; // Mantener stock actual

    const tipoProducto =
      data.tipo_producto !== undefined || data.tipo !== undefined
        ? normalizeProductoTipoValue(data?.tipo_producto ?? data?.tipo)
        : undefined;

    if (tipoProducto !== undefined) {
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
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [nombre, data.categoria_id, data.descripcion, data.precio, stockActual, data.stock_minimo, data.imagen_url, tipoProducto, id]
      );
    } else {
      await pool.query(
        `UPDATE productos
         SET nombre = $1,
             categoria_id = $2,
             descripcion = $3,
             precio = $4,
             stock = $5,
             stock_minimo = $6,
             imagen_url = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [nombre, data.categoria_id, data.descripcion, data.precio, stockActual, data.stock_minimo, data.imagen_url, id]
      );
    }
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
          tipo_producto: tipoProducto,
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
        AND (p.tipo_producto IS NULL OR p.tipo_producto = 'terminado')
      ORDER BY c.nombre
    `);
    const productos = await pool.query(`
      SELECT p.id, p.nombre, p.descripcion, p.precio, p.imagen_url, c.nombre AS categoria
      FROM productos p
      INNER JOIN categorias c ON p.categoria_id = c.id
      WHERE p.estado = 'Activo' AND c.estado = 'Activo'
        AND (p.tipo_producto IS NULL OR p.tipo_producto = 'terminado')
      ORDER BY p.nombre
      LIMIT 200
    `);
    return { categorias: categorias.rows, productos: productos.rows };
  }
};

// ------- CLIENTES -------
/**
 * Calcula trabajo pendiente real de un cliente que impide eliminarlo o inactivarlo.
 * Pendiente significa:
 *   - pedidos en estado 'Pendiente' o 'En Proceso'
 *   - ventas en estado 'Pendiente'
 *   - domicilios cuyo estado no es 'Entregado' ni 'Cancelado' (es decir, en operacion)
 */
const getClientePendingWork = async (clienteId) => {
  const id = Number(clienteId);
  if (!Number.isFinite(id) || id <= 0) {
    return { pedidos: 0, ventas: 0, domicilios: 0, total: 0 };
  }
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM pedidos
         WHERE cliente_id = $1
           AND TRIM(LOWER(COALESCE(estado, ''))) IN ('pendiente','en proceso'))::int AS pedidos,
       (SELECT COUNT(*) FROM ventas
         WHERE cliente_id = $1
           AND TRIM(LOWER(COALESCE(estado, ''))) = 'pendiente')::int AS ventas,
       (SELECT COUNT(*) FROM domicilios
         WHERE cliente_id = $1
           AND TRIM(LOWER(COALESCE(estado, ''))) NOT IN ('entregado','cancelado'))::int AS domicilios`,
    [id]
  );
  const row = result.rows[0] || {};
  const pedidos = Number(row.pedidos || 0);
  const ventas = Number(row.ventas || 0);
  const domicilios = Number(row.domicilios || 0);
  return { pedidos, ventas, domicilios, total: pedidos + ventas + domicilios };
};

const buildClienteBloqueoMensaje = (work, accion) => {
  const partes = [];
  if (work.pedidos > 0) {
    partes.push(`${work.pedidos} pedido${work.pedidos === 1 ? '' : 's'} en estado Pendiente o En Proceso`);
  }
  if (work.ventas > 0) {
    partes.push(`${work.ventas} venta${work.ventas === 1 ? '' : 's'} en estado Pendiente`);
  }
  if (work.domicilios > 0) {
    partes.push(`${work.domicilios} domicilio${work.domicilios === 1 ? '' : 's'} sin entregar`);
  }
  const detalle = partes.join(', ');
  return `No se puede ${accion} el cliente porque tiene ${detalle}. Finalice o cancele esos registros antes de continuar.`;
};

const Clientes = {
  getPendingWork: getClientePendingWork,
  buildBloqueoMensaje: buildClienteBloqueoMensaje,
  getAll: async () => {
    const result = await pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)::int
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ), 0) AS compras,
         (
           SELECT MAX(v.fecha)
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ) AS ultima_compra
       FROM clientes c
       ORDER BY c.nombre`
    );
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)::int
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ), 0) AS compras,
         (
           SELECT MAX(v.fecha)
           FROM ventas v
           WHERE v.cliente_id = c.id
             AND TRIM(LOWER(COALESCE(v.estado, ''))) <> 'cancelada'
         ) AS ultima_compra
       FROM clientes c
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  getByDocumento: async (documento) => {
    const result = await pool.query('SELECT * FROM clientes WHERE documento = $1', [documento]);
    return result.rows[0];
  },
  getByEmail: async (email) => {
    const result = await pool.query('SELECT * FROM clientes WHERE email = $1', [email]);
    return result.rows[0];
  },
  getByUsuarioId: async (usuarioId) => {
    const result = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuarioId]);
    return result.rows[0];
  },
  getOrCreateByUsuarioId: async (usuarioId) => {
    const existing = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuarioId]);
    if (existing.rows[0]) return existing.rows[0];

    // Intentar vincular por email si existe un cliente legacy sin usuario_id.
    const linked = await pool.query(
      `UPDATE clientes c
       SET usuario_id = u.id,
           nombre = COALESCE(c.nombre, u.nombre),
           apellido = COALESCE(c.apellido, u.apellido),
           tipo_documento = COALESCE(c.tipo_documento, u.tipo_documento),
           documento = COALESCE(c.documento, u.documento),
           telefono = COALESCE(c.telefono, u.telefono),
           direccion = COALESCE(c.direccion, u.direccion),
           estado = COALESCE(c.estado, u.estado),
           updated_at = CURRENT_TIMESTAMP
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1
         AND r.nombre = 'Cliente'
         AND c.usuario_id IS NULL
         AND c.email IS NOT NULL
         AND LOWER(c.email) = LOWER(u.email)
       RETURNING c.*`,
      [usuarioId]
    );
    if (linked.rows[0]) return linked.rows[0];

    // Crear perfil cliente si el usuario existe y su rol es Cliente.
    const inserted = await pool.query(
      `INSERT INTO clientes (
         usuario_id,
         nombre,
         apellido,
         tipo_documento,
         documento,
         telefono,
         email,
         direccion,
         estado
       )
       SELECT
         u.id,
         u.nombre,
         u.apellido,
         u.tipo_documento,
         u.documento,
         u.telefono,
         u.email,
         u.direccion,
         COALESCE(u.estado, 'Activo')
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1
         AND r.nombre = 'Cliente'
         AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.usuario_id = u.id)
       RETURNING *`,
      [usuarioId]
    );

    if (inserted.rows[0]) return inserted.rows[0];

    const fallback = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuarioId]);
    return fallback.rows[0] || null;
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO clientes (usuario_id, nombre, apellido, tipo_documento, documento, telefono, email, direccion, foto_url, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [data.usuario_id || null, data.nombre, data.apellido, data.tipoDocumento, data.documento, data.telefono, data.email, data.direccion, data.foto_url, data.estado || 'Activo']
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await pool.query(
      `UPDATE clientes
       SET usuario_id = COALESCE($1, usuario_id),
           nombre = COALESCE($2, nombre),
           apellido = COALESCE($3, apellido),
           tipo_documento = COALESCE($4, tipo_documento),
           documento = COALESCE($5, documento),
           telefono = COALESCE($6, telefono),
           email = COALESCE($7, email),
           direccion = COALESCE($8, direccion),
           estado = COALESCE($9, estado),
           foto_url = COALESCE($10, foto_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11`,
      [
        data.usuario_id,
        data.nombre,
        data.apellido,
        data.tipoDocumento,
        data.documento,
        data.telefono,
        data.email,
        data.direccion,
        data.estado,
        data.foto_url,
        id,
      ]
    );
    return true;
  },
  updateStatus: async (id, data = {}) => {
    const current = await Clientes.getById(id);
    if (!current) {
      const error = new Error('Cliente no encontrado');
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
      const work = await getClientePendingWork(id);
      if (work.total > 0) {
        const error = new Error(buildClienteBloqueoMensaje(work, 'inactivar'));
        error.statusCode = 409;
        error.details = { dependencias: work };
        throw error;
      }
      // Mantener compatibilidad con check de BD si existe (no rompe si no esta).
      await checkInactivacionDependencias('cliente', id);
    }

    await pool.query(
      `UPDATE clientes
       SET estado = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [estado, id]
    );

    if (current.usuario_id) {
      await pool.query(
        `UPDATE usuarios
         SET estado = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [estado, current.usuario_id]
      );
    }

    await registerClienteAudit({
      clienteId: Number(id),
      accion: 'STATUS_CHANGE',
      usuarioId: data?.actor_id ?? null,
      cambios: {
        before: { estado: current.estado },
        after: { estado },
        motivo: typeof data?.motivo === 'string' ? data.motivo.trim() : null,
        usuario_id_sincronizado: current.usuario_id || null,
      },
    });

    return Clientes.getById(id);
  },
  delete: async (id, options = {}) => {
    const previous = await Clientes.getById(id);
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    await registerClienteAudit({
      clienteId: Number(id),
      accion: 'DELETE',
      usuarioId: options?.actor_id ?? null,
      cambios: {
        before: previous
          ? {
              nombre: previous.nombre,
              apellido: previous.apellido,
              email: previous.email,
              documento: previous.documento,
              estado: previous.estado,
              usuario_id: previous.usuario_id,
            }
          : null,
        after: null,
      },
    });
    return true;
  }
};

// ------- PROVEEDORES -------
let proveedorAuditTableReady = null;
let proveedorSchemaReady = null;

const ensureProveedorAuditTable = async () => {
  if (!proveedorAuditTableReady) {
    proveedorAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores_auditoria (
        id SERIAL PRIMARY KEY,
        proveedor_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await proveedorAuditTableReady;
};

const ensureProveedorSchema = async () => {
  if (!proveedorSchemaReady) {
    proveedorSchemaReady = (async () => {
      await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS preferente BOOLEAN DEFAULT FALSE');
      await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2)');
      await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS observaciones TEXT');
      await pool.query('UPDATE proveedores SET preferente = FALSE WHERE preferente IS NULL');
    })();
  }

  await proveedorSchemaReady;
};

const toBooleanValue = (value) => value === true || value === 'true' || value === 1 || value === '1';

const getProveedorDisplayName = (proveedor = {}) => {
  if (proveedor.tipo_persona === 'Juridica') {
    return proveedor.nombre_empresa || '';
  }

  return [proveedor.nombre, proveedor.apellido].filter(Boolean).join(' ').trim();
};

const getProveedorIdentifier = (proveedor = {}) => {
  if (proveedor.tipo_persona === 'Juridica') {
    return proveedor.nit || '';
  }

  return proveedor.numero_documento || '';
};

const toProveedorSnapshot = (proveedor = {}) => ({
  id: proveedor.id,
  tipo_persona: proveedor.tipo_persona,
  nombre_empresa: proveedor.nombre_empresa,
  nit: proveedor.nit,
  nombre: proveedor.nombre,
  apellido: proveedor.apellido,
  tipo_documento: proveedor.tipo_documento,
  numero_documento: proveedor.numero_documento,
  telefono: proveedor.telefono,
  email: proveedor.email,
  direccion: proveedor.direccion,
  estado: proveedor.estado,
  preferente: toBooleanValue(proveedor.preferente),
  rating: proveedor.rating !== null && proveedor.rating !== undefined ? Number(proveedor.rating) : null,
  observaciones: proveedor.observaciones || null,
  nombre_completo: getProveedorDisplayName(proveedor),
  identificador: getProveedorIdentifier(proveedor),
});

const getProveedorChanges = (before = {}, after = {}) => {
  const changedFields = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  keys.forEach((key) => {
    const beforeValue = JSON.stringify(before[key]);
    const afterValue = JSON.stringify(after[key]);
    if (beforeValue !== afterValue) {
      changedFields.push(key);
    }
  });

  return changedFields;
};

const registerProveedorAudit = async ({ proveedorId, accion, usuarioId = null, cambios }) => {
  await ensureProveedorAuditTable();
  await pool.query(
    'INSERT INTO proveedores_auditoria (proveedor_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
    [proveedorId, accion, usuarioId, JSON.stringify(cambios || {})]
  );
};

const getProveedorIdentifierValue = ({ tipoPersona, nit, numeroDocumento }) => {
  const normalizedTipo = String(tipoPersona || '').trim();
  if (normalizedTipo === 'Juridica') {
    return String(nit || '').trim();
  }

  return String(numeroDocumento || '').trim();
};

const findProveedorByIdentifier = async ({ nit, numeroDocumento, excludeId = null }) => {
  const whereParts = [];
  const values = [];

  if (nit) {
    values.push(nit);
    whereParts.push(`nit = $${values.length}`);
  }

  if (numeroDocumento) {
    values.push(numeroDocumento);
    whereParts.push(`numero_documento = $${values.length}`);
  }

  if (whereParts.length === 0) {
    return null;
  }

  let query = `SELECT * FROM proveedores WHERE (${whereParts.join(' OR ')})`;
  if (excludeId !== null && excludeId !== undefined) {
    values.push(excludeId);
    query += ` AND id <> $${values.length}`;
  }

  query += ' ORDER BY CASE WHEN estado = \'Activo\' THEN 0 ELSE 1 END, id ASC LIMIT 1';

  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

const findProveedorByEmail = async ({ email, excludeId = null }) => {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail) return null;

  const values = [normalizedEmail];
  let query = 'SELECT * FROM proveedores WHERE LOWER(COALESCE(email, \'\')) = $1';
  if (excludeId !== null && excludeId !== undefined) {
    values.push(excludeId);
    query += ` AND id <> $${values.length}`;
  }

  query += ' ORDER BY CASE WHEN estado = \'Activo\' THEN 0 ELSE 1 END, id ASC LIMIT 1';
  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

const findProveedorByTelefono = async ({ telefono, excludeId = null }) => {
  const normalizedTelefono = typeof telefono === 'string' ? telefono.replace(/\D/g, '') : '';
  if (!normalizedTelefono) return null;

  const values = [normalizedTelefono];
  let query = `
    SELECT *
    FROM proveedores
    WHERE regexp_replace(COALESCE(telefono, ''), '\\D', '', 'g') = $1
  `;
  if (excludeId !== null && excludeId !== undefined) {
    values.push(excludeId);
    query += ` AND id <> $${values.length}`;
  }

  query += ' ORDER BY CASE WHEN estado = \'Activo\' THEN 0 ELSE 1 END, id ASC LIMIT 1';
  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

const getPendingComprasByProveedor = async (id) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM compras
     WHERE proveedor_id = $1
       AND LOWER(COALESCE(estado, '')) = 'pendiente'`,
    [id]
  );

  return Number(result.rows[0]?.total || 0);
};

const Proveedores = {
  getAll: async () => {
    await ensureProveedorSchema();
    const result = await pool.query(`
      SELECT *
      FROM proveedores
      ORDER BY
        CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END,
        LOWER(COALESCE(NULLIF(TRIM(nombre_empresa), ''), NULLIF(TRIM(CONCAT(COALESCE(nombre, ''), ' ', COALESCE(apellido, ''))), ''))),
        id ASC
    `);
    return result.rows;
  },
  getById: async (id) => {
    await ensureProveedorSchema();
    const result = await pool.query('SELECT * FROM proveedores WHERE id = $1', [id]);
    return result.rows[0];
  },
  getByNitOrDocumento: async (identifier) => {
    await ensureProveedorSchema();
    const normalized = String(identifier || '').trim();
    if (!normalized) return null;

    const result = await pool.query(
      `SELECT *
       FROM proveedores
       WHERE nit = $1 OR numero_documento = $1
       ORDER BY CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [normalized]
    );
    return result.rows[0] || null;
  },
  getByEmail: async (email) => {
    await ensureProveedorSchema();
    const result = await pool.query(
      `SELECT *
       FROM proveedores
       WHERE LOWER(COALESCE(email, '')) = LOWER($1)
       ORDER BY CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [email]
    );
    return result.rows[0] || null;
  },
  getByTelefono: async (telefono) => {
    await ensureProveedorSchema();
    const normalized = String(telefono || '').replace(/\D/g, '');
    if (!normalized) return null;

    const result = await pool.query(
      `SELECT *
       FROM proveedores
       WHERE regexp_replace(COALESCE(telefono, ''), '\\D', '', 'g') = $1
       ORDER BY CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [normalized]
    );
    return result.rows[0] || null;
  },
  getPendingPurchases: async (id) => {
    await ensureProveedorSchema();
    return getPendingComprasByProveedor(id);
  },
  getAuditByProveedor: async (id) => {
    await ensureProveedorSchema();
    await ensureProveedorAuditTable();
    const result = await pool.query(
      `SELECT pa.*, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.email AS usuario_email
       FROM proveedores_auditoria pa
       LEFT JOIN usuarios u ON u.id = pa.usuario_id
       WHERE pa.proveedor_id = $1
       ORDER BY pa.created_at DESC`,
      [id]
    );
    return result.rows;
  },
  create: async (data, options = {}) => {
    await ensureProveedorSchema();

    const duplicate = await findProveedorByIdentifier({ nit: data.nit, numeroDocumento: data.numeroDocumento });
    if (duplicate) {
      const error = new Error(
        duplicate.estado === 'Inactivo'
          ? 'El RUC ya existe pero el proveedor esta inactivo'
          : 'El RUC ya existe para otro proveedor'
      );
      error.statusCode = 409;
      error.details = { proveedorId: duplicate.id, estado: duplicate.estado };
      throw error;
    }

    const duplicateEmail = await findProveedorByEmail({ email: data.email });
    if (duplicateEmail) {
      const error = new Error('El correo ya existe para otro proveedor');
      error.statusCode = 409;
      error.details = { field: 'email', proveedorId: duplicateEmail.id, estado: duplicateEmail.estado };
      throw error;
    }

    const duplicatePhone = await findProveedorByTelefono({ telefono: data.telefono });
    if (duplicatePhone) {
      const error = new Error('El telefono ya existe para otro proveedor');
      error.statusCode = 409;
      error.details = { field: 'telefono', proveedorId: duplicatePhone.id, estado: duplicatePhone.estado };
      throw error;
    }

    const result = await pool.query(
      `INSERT INTO proveedores (
         tipo_persona, nombre_empresa, nit, nombre, apellido, tipo_documento, numero_documento, telefono, email, direccion, estado, preferente, rating, observaciones
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        data.tipoPersona,
        data.nombreEmpresa,
        data.nit,
        data.nombre,
        data.apellido,
        data.tipoDocumento,
        data.numeroDocumento,
        data.telefono,
        data.email,
        data.direccion,
        data.estado || 'Activo',
        toBooleanValue(data.preferente),
        data.rating ?? null,
        data.observaciones ?? null,
      ]
    );

    const createdProveedor = await Proveedores.getById(result.rows[0].id);
    await registerProveedorAudit({
      proveedorId: result.rows[0].id,
      accion: 'CREATE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: null,
        after: toProveedorSnapshot(createdProveedor),
      },
    });

    return result.rows[0].id;
  },
  update: async (id, data, options = {}) => {
    await ensureProveedorSchema();
    const currentProveedor = await Proveedores.getById(id);
    if (!currentProveedor) {
      const error = new Error('Proveedor no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const nextEstado = data.estado ?? currentProveedor.estado;
    if (currentProveedor.estado !== 'Inactivo' && nextEstado === 'Inactivo') {
      const pendingPurchases = await getPendingComprasByProveedor(id);
      if (pendingPurchases > 0) {
        const error = new Error('No se puede desactivar el proveedor porque tiene ordenes de compra pendientes');
        error.statusCode = 409;
        error.details = { pendingPurchases };
        throw error;
      }
    }

    const nextTipoPersona = data.tipoPersona ?? currentProveedor.tipo_persona;
    const nextNombreEmpresa = data.nombreEmpresa !== undefined ? data.nombreEmpresa : currentProveedor.nombre_empresa;
    const nextNit = data.nit !== undefined ? data.nit : currentProveedor.nit;
    const nextNombre = data.nombre !== undefined ? data.nombre : currentProveedor.nombre;
    const nextApellido = data.apellido !== undefined ? data.apellido : currentProveedor.apellido;
    const nextTipoDocumento = data.tipoDocumento !== undefined ? data.tipoDocumento : currentProveedor.tipo_documento;
    const nextNumeroDocumento = data.numeroDocumento !== undefined ? data.numeroDocumento : currentProveedor.numero_documento;
    const nextTelefono = data.telefono !== undefined ? data.telefono : currentProveedor.telefono;
    const nextEmail = data.email !== undefined ? data.email : currentProveedor.email;
    const nextDireccion = data.direccion !== undefined ? data.direccion : currentProveedor.direccion;
    const nextPreferente = data.preferente !== undefined ? toBooleanValue(data.preferente) : toBooleanValue(currentProveedor.preferente);
    const nextRating = data.rating !== undefined ? data.rating : currentProveedor.rating;
    const nextObservaciones = data.observaciones !== undefined ? data.observaciones : currentProveedor.observaciones;

    const currentIdentifier = getProveedorIdentifierValue({
      tipoPersona: currentProveedor.tipo_persona,
      nit: currentProveedor.nit,
      numeroDocumento: currentProveedor.numero_documento,
    });
    const nextIdentifier = getProveedorIdentifierValue({
      tipoPersona: nextTipoPersona,
      nit: nextNit,
      numeroDocumento: nextNumeroDocumento,
    });

    if (nextIdentifier !== currentIdentifier) {
      const error = new Error('El RUC/Documento del proveedor no se puede editar por trazabilidad');
      error.statusCode = 409;
      error.details = { field: 'identifier', currentIdentifier, nextIdentifier };
      throw error;
    }

    const duplicateIdentifier = await findProveedorByIdentifier({
      nit: nextNit,
      numeroDocumento: nextNumeroDocumento,
      excludeId: Number(id),
    });
    if (duplicateIdentifier) {
      const error = new Error('El RUC ya existe para otro proveedor');
      error.statusCode = 409;
      error.details = { field: 'nit', proveedorId: duplicateIdentifier.id, estado: duplicateIdentifier.estado };
      throw error;
    }

    const duplicateEmail = await findProveedorByEmail({ email: nextEmail, excludeId: Number(id) });
    if (duplicateEmail) {
      const error = new Error('El correo ya existe para otro proveedor');
      error.statusCode = 409;
      error.details = { field: 'email', proveedorId: duplicateEmail.id, estado: duplicateEmail.estado };
      throw error;
    }

    const duplicatePhone = await findProveedorByTelefono({ telefono: nextTelefono, excludeId: Number(id) });
    if (duplicatePhone) {
      const error = new Error('El telefono ya existe para otro proveedor');
      error.statusCode = 409;
      error.details = { field: 'telefono', proveedorId: duplicatePhone.id, estado: duplicatePhone.estado };
      throw error;
    }

    await pool.query(
      `UPDATE proveedores
       SET tipo_persona = COALESCE($1, tipo_persona),
           nombre_empresa = COALESCE($2, nombre_empresa),
           nit = COALESCE($3, nit),
           nombre = COALESCE($4, nombre),
           apellido = COALESCE($5, apellido),
           tipo_documento = COALESCE($6, tipo_documento),
           numero_documento = COALESCE($7, numero_documento),
           telefono = COALESCE($8, telefono),
           email = COALESCE($9, email),
           direccion = COALESCE($10, direccion),
           estado = COALESCE($11, estado),
           preferente = COALESCE($12, preferente),
           rating = COALESCE($13, rating),
           observaciones = COALESCE($14, observaciones),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15`,
      [
        nextTipoPersona,
        nextNombreEmpresa,
        nextNit,
        nextNombre,
        nextApellido,
        nextTipoDocumento,
        nextNumeroDocumento,
        nextTelefono,
        nextEmail,
        nextDireccion,
        nextEstado,
        nextPreferente,
        nextRating,
        nextObservaciones,
        id,
      ]
    );

    const updatedProveedor = await Proveedores.getById(id);
    await registerProveedorAudit({
      proveedorId: Number(id),
      accion: 'UPDATE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: toProveedorSnapshot(currentProveedor),
        after: toProveedorSnapshot(updatedProveedor),
        changedFields: getProveedorChanges(toProveedorSnapshot(currentProveedor), toProveedorSnapshot(updatedProveedor)),
        reason: typeof data.motivo === 'string' && data.motivo.trim() ? data.motivo.trim() : null,
      },
    });

    return true;
  },
  updateStatus: async (id, data = {}, options = {}) => {
    await ensureProveedorSchema();
    const currentProveedor = await Proveedores.getById(id);
    if (!currentProveedor) {
      const error = new Error('Proveedor no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const nextEstado = data.estado;
    if (!['Activo', 'Inactivo'].includes(nextEstado)) {
      const error = new Error('Estado invalido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    const reason = ensureMotivoEstado(data.motivo);

    if (currentProveedor.estado !== 'Inactivo' && nextEstado === 'Inactivo') {
      await checkInactivacionDependencias('proveedor', id);
    }

    await pool.query(
      'UPDATE proveedores SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextEstado, id]
    );

    const updatedProveedor = await Proveedores.getById(id);
    await registerProveedorAudit({
      proveedorId: Number(id),
      accion: 'UPDATE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: toProveedorSnapshot(currentProveedor),
        after: toProveedorSnapshot(updatedProveedor),
        changedFields: getProveedorChanges(toProveedorSnapshot(currentProveedor), toProveedorSnapshot(updatedProveedor)),
        reason,
        statusChange: true,
      },
    });

    return updatedProveedor;
  },
  delete: async (id, options = {}) => {
    await ensureProveedorSchema();
    const currentProveedor = await Proveedores.getById(id);
    if (!currentProveedor) {
      const error = new Error('Proveedor no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (!reason || reason.length < 10 || reason.length > 200) {
      const error = new Error('El motivo de eliminacion es obligatorio y debe tener entre 10 y 200 caracteres');
      error.statusCode = 400;
      error.details = { reasonLength: reason.length };
      throw error;
    }

    await pool.query('DELETE FROM proveedores WHERE id = $1', [id]);

    await registerProveedorAudit({
      proveedorId: Number(id),
      accion: 'DELETE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: toProveedorSnapshot(currentProveedor),
        after: null,
        reason,
      },
    });

    return true;
  }
};

// ------- PEDIDOS -------
const Pedidos = {
  getAll: async (estado) => {
    try {
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
    const prod = await pool.query('SELECT id, stock, estado FROM productos WHERE id = $1 LIMIT 1', [productoId]);
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

/**
 * Quita inventario del producto y registra línea en detalle_ventas (uso dentro de transacción).
 */
const aplicarDescuentoStockYLíneaDetalleVenta = async (
  client,
  ventaId,
  productoId,
  cantidadRaw,
  precioUnitarioRaw,
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
    `SELECT id, nombre, COALESCE(stock, 0)::bigint AS stock, estado
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

  const subtotal = qty * price;
  await client.query(
    `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
     VALUES ($1, $2, $3, $4, $5)`,
    [ventaId, productoId, qty, price, subtotal],
  );

  return true;
};

// ------- VENTAS -------
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

      const numero_venta =
        typeof data.numero_venta === 'string' && String(data.numero_venta).trim().length > 0
          ? String(data.numero_venta).trim()
          : nextNumeroVenta();

      const totalGuardado = parseMoneyCO(data.total);
      if (totalGuardado === undefined || !Number.isFinite(totalGuardado) || totalGuardado < 0) {
        const error = new Error('Total de venta invalido');
        error.statusCode = 400;
        throw error;
      }

      // Validar método de pago
      const metodo_pago = String(data?.metodo_pago || data?.metodopago || 'Efectivo').trim();
      if (!['Efectivo', 'Transferencia'].includes(metodo_pago)) {
        const error = new Error(`Método de pago inválido: ${metodo_pago}`);
        error.statusCode = 400;
        throw error;
      }

      const metodopagoCol = data.metodopago ?? metodo_pago;

      const fechaRaw = data.fecha != null && String(data.fecha).trim() !== '' ? String(data.fecha).trim() : '';
      const fechaVenta = fechaRaw ? fechaRaw.split('T')[0] : new Date().toISOString().split('T')[0];

      const result = await pool.query(
        'INSERT INTO ventas (numero_venta, tipo, cliente_id, pedido_id, fecha, metodopago, total, estado, metodo_pago, abono_recibido) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [
          numero_venta,
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
    await Ventas.validateClienteActivo(data.cliente_id);

    const numero_venta =
      typeof data.numero_venta === 'string' && String(data.numero_venta).trim().length > 0
        ? String(data.numero_venta).trim()
        : nextNumeroVenta();

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

      const inserted = await client.query(
        `INSERT INTO ventas (numero_venta, tipo, cliente_id, pedido_id, fecha, metodopago, total, estado, metodo_pago, abono_recibido)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          numero_venta,
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

      for (const line of lines) {
        await aplicarDescuentoStockYLíneaDetalleVenta(
          client,
          ventaId,
          line.productoId,
          line.cantidad,
          line.precioUnitario,
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
    };

    await pool.query(
      'UPDATE ventas SET numero_venta = $1, tipo = $2, cliente_id = $3, pedido_id = $4, fecha = $5, metodopago = $6, total = $7, estado = $8 WHERE id = $9',
      [mergedData.numero_venta, mergedData.tipo, mergedData.cliente_id, mergedData.pedido_id, mergedData.fecha, mergedData.metodopago, mergedData.total, mergedData.estado, id]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [id]);
    await pool.query('DELETE FROM ventas WHERE id = $1', [id]);
    return true;
  }
};

// ------- ABONOS -------
let abonosSchemaEnsured = false;
let abonosSchemaPromise = null;
/** Alinea abonos con db.pgsql: agrega columna `detalle` (TEXT) si la BD es anterior. */
const ensureAbonosSchema = async () => {
  if (abonosSchemaEnsured) return;
  if (!abonosSchemaPromise) {
    abonosSchemaPromise = (async () => {
      await pool.query(`ALTER TABLE abonos ADD COLUMN IF NOT EXISTS detalle TEXT`);
      await pool.query(`ALTER TABLE abonos ADD COLUMN IF NOT EXISTS porcentaje_abonado INTEGER`);
    })();
  }
  try {
    await abonosSchemaPromise;
    abonosSchemaEnsured = true;
  } catch (error) {
    abonosSchemaPromise = null;
    throw error;
  }
};

const Abonos = {
  getAll: async () => {
    await ensureAbonosSchema();
    const result = await pool.query(`
      SELECT a.*,
             c.nombre AS cliente_nombre,
             p.total AS total_pedido
      FROM abonos a
      JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN pedidos p ON p.id = a.pedido_id
      ORDER BY a.fecha DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    await ensureAbonosSchema();
    const result = await pool.query(
      `SELECT a.*, p.total AS total_pedido
       FROM abonos a
       LEFT JOIN pedidos p ON p.id = a.pedido_id
       WHERE a.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  getByPedido: async (pedidoId) => {
    await ensureAbonosSchema();
    const result = await pool.query(
      `SELECT a.*, p.total AS total_pedido
       FROM abonos a
       LEFT JOIN pedidos p ON p.id = a.pedido_id
       WHERE a.pedido_id = $1
       ORDER BY a.id ASC`,
      [pedidoId]
    );
    return result.rows;
  },
  create: async (data) => {
    await ensureAbonosSchema();
    const result = await pool.query(
      'INSERT INTO abonos (numero_abono, pedido_id, cliente_id, monto, fecha, metodo_pago, estado, detalle, porcentaje_abonado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [
        data.numero_abono,
        data.pedido_id,
        data.cliente_id,
        data.monto,
        data.fecha,
        data.metodo_pago,
        data.estado || 'Registrado',
        data.detalle ?? null,
        data.porcentaje_abonado != null ? Number(data.porcentaje_abonado) : null,
      ]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await ensureAbonosSchema();
    await pool.query(
      `UPDATE abonos SET
         monto = COALESCE($1, monto),
         fecha = COALESCE($2, fecha),
         metodo_pago = COALESCE($3, metodo_pago),
         estado = COALESCE($4, estado),
         detalle = COALESCE($5, detalle)
       WHERE id = $6`,
      [
        data.monto !== undefined ? data.monto : null,
        data.fecha !== undefined ? data.fecha : null,
        data.metodo_pago !== undefined ? data.metodo_pago : null,
        data.estado !== undefined ? data.estado : null,
        data.detalle !== undefined ? data.detalle : null,
        id,
      ]
    );
    return true;
  },
  updateEstado: async (id, estado) => {
    await ensureAbonosSchema();
    await pool.query('UPDATE abonos SET estado = $1 WHERE id = $2', [estado, id]);
    return true;
  },
  /**
   * Liquidacion final del abono cuando el domicilio se entrega: combina la
   * informacion de los abonos previos en `detalle`, eleva el monto a `monto`
   * y mueve el estado a 'Finalizado' para dar cierre.
   */
  updateLiquidacion: async (id, { monto, detalle, estado, porcentaje_abonado }) => {
    await ensureAbonosSchema();
    await pool.query(
      `UPDATE abonos SET
         monto = COALESCE($1, monto),
         detalle = COALESCE($2, detalle),
         estado = COALESCE($3, estado),
         porcentaje_abonado = COALESCE($4, porcentaje_abonado)
       WHERE id = $5`,
      [
        monto !== undefined ? monto : null,
        detalle !== undefined ? detalle : null,
        estado !== undefined ? estado : null,
        porcentaje_abonado !== undefined ? porcentaje_abonado : null,
        id,
      ]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM abonos WHERE id = $1', [id]);
    return true;
  }
};

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

// ------- DOMICILIOS -------
const Domicilios = {
  getAll: async () => {
    await ensureDomiciliosSchema();
    const result = await pool.query(`
      SELECT d.*,
             p.numero_pedido as pedido,
             p.total as total_pedido,
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
      ORDER BY d.fecha DESC, d.hora DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(`
      SELECT d.*,
             p.numero_pedido as pedido,
             p.total as total_pedido,
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
         numero_domicilio, pedido_id, cliente_id, direccion, repartidor, repartidor_id, fecha, hora, estado, detalle
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          data.numero_domicilio,
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

    await pool.query(
      `UPDATE domicilios SET
         repartidor = COALESCE($1, repartidor),
         repartidor_id = COALESCE($2, repartidor_id),
         fecha = COALESCE($3, fecha),
         hora = COALESCE($4, hora),
         estado = COALESCE($5, estado),
         detalle = COALESCE($6, detalle),
         motivo_cancelacion = COALESCE($7, motivo_cancelacion)
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
  delete: async (id) => {
    await pool.query('DELETE FROM domicilios WHERE id = $1', [id]);
    return true;
  }
};

// ------- COMPRAS -------
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
  const result = await pool.query('SELECT id, nombre, precio, stock, estado FROM productos WHERE id = $1', [productoId]);
  return result.rows[0] || null;
};

const Compras = {
  getAll: async () => {
    await ensureComprasSchema();
    const result = await pool.query(`
      SELECT c.*, p.nombre_empresa, p.nombre as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.proveedor_id = p.id
      ORDER BY c.fecha DESC
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
         numero_compra, proveedor_id, fecha, fecha_creacion, subtotal, iva, total, estado, observaciones, requiere_aprobacion, aprobacion_extraordinaria, motivo_aprobacion
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        data.numero_compra,
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

    const pctRaw = options?.porcentajeGanancia;
    const parsedPct = pctRaw === undefined || pctRaw === null || pctRaw === '' ? 0 : Number(pctRaw);
    if (!Number.isFinite(parsedPct) || parsedPct < 0 || parsedPct > 1000) {
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
        `SELECT producto_id, cantidad, precio_unitario, COALESCE(porcentaje_ganancia, 0)::numeric AS pct
         FROM detalle_compras
         WHERE compra_id = $1
         ORDER BY id ASC`,
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
        await client.query(
          'UPDATE productos SET stock = COALESCE(stock, 0) + $1, precio = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [Number(row.cantidad || 0), precioVenta, row.producto_id]
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

      if (normalizeStatus(compra.estado) === 'Recibida') {
        const error = new Error('La compra ya fue recibida y no puede modificarse');
        error.statusCode = 409;
        throw error;
      }

      if (normalizeStatus(compra.estado) === 'Cancelada' && requestedStatus !== 'Cancelada') {
        const error = new Error('La compra ya fue cancelada y no puede reactivarse');
        error.statusCode = 409;
        throw error;
      }

      const motivoCancelacion = typeof data.motivo_cancelacion === 'string' ? data.motivo_cancelacion.trim() : '';

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

      const previousStatus = normalizeStatus(compra.estado);

      if (requestedStatus === 'Recibida') {
        await applyReceiptStock(id);
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

// ------- INSUMOS -------
const Insumos = {
  getAll: async () => {
    const result = await pool.query('SELECT * FROM insumos ORDER BY nombre');
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
  delete: async (id) => {
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
    const result = await pool.query(`
      SELECT i.id,
             i.nombre,
             i.cantidad,
             i.unidad,
             i.stock_minimo,
             TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, ''))) AS operario,
             le.fecha AS fecha
      FROM insumos i
      LEFT JOIN LATERAL (
        SELECT ei.fecha, ei.operario_id
        FROM entregas_insumos ei
        WHERE ei.insumo_id = i.id
        ORDER BY ei.fecha DESC, ei.hora DESC NULLS LAST, ei.id DESC
        LIMIT 1
      ) le ON true
      LEFT JOIN usuarios u ON u.id = le.operario_id
      ORDER BY i.nombre
    `);
    return result.rows;
  }
};

// ------- ENTREGAS INSUMOS -------
const EntregasInsumos = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT ei.*, i.nombre as insumo_nombre, CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) as operario_nombre
      FROM entregas_insumos ei
      JOIN insumos i ON ei.insumo_id = i.id
      LEFT JOIN usuarios u ON ei.operario_id = u.id
      ORDER BY ei.fecha DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(`
      SELECT ei.*, i.nombre as insumo_nombre, CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')) as operario_nombre
      FROM entregas_insumos ei
      JOIN insumos i ON ei.insumo_id = i.id
      LEFT JOIN usuarios u ON ei.operario_id = u.id
      WHERE ei.id = $1
    `, [id]);
    return result.rows[0];
  },
  create: async (data) => {
    if (!data.numero_entrega || !String(data.numero_entrega).trim()) {
      const error = new Error('El número de entrega es obligatorio');
      error.statusCode = 400;
      throw error;
    }
    if (!data.insumo_id || data.insumo_id <= 0) {
      const error = new Error('El ID del insumo es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }
    const cantidad = Number(data?.cantidad) || 0;
    if (cantidad <= 0) {
      const error = new Error('La cantidad debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    const unidad = String(data?.unidad || '').trim();
    const unidadesValidas = ['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros'];
    if (!unidad || !unidadesValidas.includes(unidad)) {
      const error = new Error(`Unidad inválida. Valores permitidos: ${unidadesValidas.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
    if (!data.operario_id || data.operario_id <= 0) {
      const error = new Error('El productor es obligatorio');
      error.statusCode = 400;
      throw error;
    }
    if (!data.fecha) {
      const error = new Error('La fecha es obligatoria');
      error.statusCode = 400;
      throw error;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'INSERT INTO entregas_insumos (numero_entrega, insumo_id, cantidad, unidad, operario_id, fecha, hora) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [data.numero_entrega, data.insumo_id, cantidad, unidad, data.operario_id, data.fecha, data.hora || null]
      );
      await client.query(
        'UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [cantidad, data.insumo_id]
      );
      await client.query('COMMIT');
      return result.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  update: async (id, data) => {
    const current = await EntregasInsumos.getById(id);
    if (!current) {
      const error = new Error('Entrega no encontrada');
      error.statusCode = 404;
      throw error;
    }
    const cantidad = data.cantidad !== undefined ? Number(data.cantidad) : current.cantidad;
    if (cantidad <= 0) {
      const error = new Error('La cantidad debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    const unidad = data.unidad !== undefined ? String(data.unidad).trim() : current.unidad;
    const unidadesValidas = ['Litros', 'Kilogramos', 'Gramos', 'Unidades', 'Cajas', 'Botellas', 'Mililitros'];
    if (!unidadesValidas.includes(unidad)) {
      const error = new Error(`Unidad inválida. Valores permitidos: ${unidadesValidas.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
    const operarioId = data.operario_id !== undefined ? data.operario_id : current.operario_id;
    if (!operarioId || operarioId <= 0) {
      const error = new Error('El productor es obligatorio');
      error.statusCode = 400;
      throw error;
    }
    const newInsumoId = data.insumo_id !== undefined ? Number(data.insumo_id) : Number(current.insumo_id);
    if (!Number.isFinite(newInsumoId) || newInsumoId <= 0) {
      const error = new Error('El insumo es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }

    const oldInsumo = Number(current.insumo_id);
    const oldCant = Number(current.cantidad);
    const newInsumo = newInsumoId;
    const newCant = Number(cantidad);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM entregas_insumos WHERE id = $1 FOR UPDATE', [id]);

      if (oldInsumo === newInsumo) {
        const delta = newCant - oldCant;
        if (delta !== 0) {
          const up = await client.query(
            `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND COALESCE(cantidad, 0) + $1 >= 0
             RETURNING id`,
            [delta, oldInsumo]
          );
          if (up.rowCount === 0) {
            const err = new Error(
              'No se puede actualizar la entrega: el inventario del insumo quedaría negativo'
            );
            err.statusCode = 409;
            throw err;
          }
        }
      } else {
        const rev = await client.query(
          `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) - $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND COALESCE(cantidad, 0) >= $1
           RETURNING id`,
          [oldCant, oldInsumo]
        );
        if (rev.rowCount === 0) {
          const err = new Error(
            'No se puede actualizar la entrega: el inventario del insumo original quedaría negativo'
          );
          err.statusCode = 409;
          throw err;
        }
        const add = await client.query(
          `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) + $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING id`,
          [newCant, newInsumo]
        );
        if (add.rowCount === 0) {
          const err = new Error('Insumo destino no encontrado');
          err.statusCode = 404;
          throw err;
        }
      }

      await client.query(
        'UPDATE entregas_insumos SET insumo_id = $1, cantidad = $2, unidad = $3, operario_id = $4, fecha = $5, hora = $6 WHERE id = $7',
        [newInsumo, newCant, unidad, operarioId, data.fecha || current.fecha, data.hora || current.hora, id]
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  delete: async (id) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query('SELECT * FROM entregas_insumos WHERE id = $1 FOR UPDATE', [id]);
      if (!row.rows[0]) {
        await client.query('ROLLBACK');
        const error = new Error('Entrega no encontrada');
        error.statusCode = 404;
        throw error;
      }
      const e = row.rows[0];
      const sub = await client.query(
        `UPDATE insumos SET cantidad = COALESCE(cantidad, 0) - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND COALESCE(cantidad, 0) >= $1
         RETURNING id`,
        [Number(e.cantidad), e.insumo_id]
      );
      if (sub.rowCount === 0) {
        await client.query('ROLLBACK');
        const err = new Error(
          'No se puede eliminar la entrega: el inventario del insumo quedaría negativo'
        );
        err.statusCode = 409;
        throw err;
      }
      await client.query('DELETE FROM entregas_insumos WHERE id = $1', [id]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

// ------- PRODUCCIÓN -------
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

const Produccion = {
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
      `SELECT ei.*, i.nombre AS insumo_nombre
       FROM entregas_insumos ei
       JOIN insumos i ON i.id = ei.insumo_id
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
          Array.isArray(data.insumos_gastados) ? JSON.stringify(data.insumos_gastados) : '[]',
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

// ------- PRODUCTO INSUMOS (RELACIÓN N:N) -------
const ProductoInsumos = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT pi.*, p.nombre as producto_nombre, i.nombre as insumo_nombre
      FROM producto_insumos pi
      JOIN productos p ON pi.producto_id = p.id
      JOIN insumos i ON pi.insumo_id = i.id
      ORDER BY p.nombre, i.nombre
    `);
    return result.rows;
  },
  getByProducto: async (productoId) => {
    const result = await pool.query(`
      SELECT pi.*, i.nombre as insumo_nombre, i.cantidad as stock_actual, i.stock_minimo
      FROM producto_insumos pi
      JOIN insumos i ON pi.insumo_id = i.id
      WHERE pi.producto_id = $1
      ORDER BY i.nombre
    `, [productoId]);
    return result.rows;
  },
  getByInsumo: async (insumoId) => {
    const result = await pool.query(`
      SELECT pi.*, p.nombre as producto_nombre
      FROM producto_insumos pi
      JOIN productos p ON pi.producto_id = p.id
      WHERE pi.insumo_id = $1
      ORDER BY p.nombre
    `, [insumoId]);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(
      `SELECT pi.*, p.nombre as producto_nombre, i.nombre as insumo_nombre
       FROM producto_insumos pi
       JOIN productos p ON pi.producto_id = p.id
       JOIN insumos i ON pi.insumo_id = i.id
       WHERE pi.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  create: async (data) => {
    if (!data.producto_id || data.producto_id <= 0) {
      const error = new Error('El ID del producto es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }
    if (!data.insumo_id || data.insumo_id <= 0) {
      const error = new Error('El ID del insumo es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }
    if (!data.cantidad_requerida || data.cantidad_requerida <= 0) {
      const error = new Error('La cantidad requerida debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    if (!data.unidad || !String(data.unidad).trim()) {
      const error = new Error('La unidad es obligatoria');
      error.statusCode = 400;
      throw error;
    }
    const result = await pool.query(
      'INSERT INTO producto_insumos (producto_id, insumo_id, cantidad_requerida, unidad, notas) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [data.producto_id, data.insumo_id, data.cantidad_requerida, data.unidad, data.notas || null]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    if (data.cantidad_requerida !== undefined && data.cantidad_requerida <= 0) {
      const error = new Error('La cantidad requerida debe ser un valor positivo');
      error.statusCode = 400;
      throw error;
    }
    if (data.unidad && !String(data.unidad).trim()) {
      const error = new Error('La unidad no puede estar vacía');
      error.statusCode = 400;
      throw error;
    }
    await pool.query(
      'UPDATE producto_insumos SET cantidad_requerida = $1, unidad = $2, notas = $3 WHERE id = $4',
      [data.cantidad_requerida, data.unidad, data.notas || null, id]
    );
    return true;
  },
  delete: async (id) => {
    const r = await pool.query('DELETE FROM producto_insumos WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) {
      const error = new Error('Receta no encontrada');
      error.statusCode = 404;
      throw error;
    }
    return true;
  }
};

// ------- INSUMO MOVIMIENTOS (AUDITORÍA) -------
const InsumoMovimientos = {
  getAll: async (filters = {}) => {
    let query = `
      SELECT im.*, i.nombre as insumo_nombre, u.nombre as usuario_nombre
      FROM insumo_movimientos im
      JOIN insumos i ON im.insumo_id = i.id
      LEFT JOIN usuarios u ON im.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (filters.insumo_id) {
      query += ` AND im.insumo_id = $${params.length + 1}`;
      params.push(filters.insumo_id);
    }
    if (filters.tipo_movimiento) {
      query += ` AND im.tipo_movimiento = $${params.length + 1}`;
      params.push(filters.tipo_movimiento);
    }
    if (filters.usuario_id) {
      query += ` AND im.usuario_id = $${params.length + 1}`;
      params.push(filters.usuario_id);
    }
    if (filters.fecha_desde) {
      query += ` AND im.created_at >= $${params.length + 1}`;
      params.push(filters.fecha_desde);
    }
    if (filters.fecha_hasta) {
      query += ` AND im.created_at <= $${params.length + 1}`;
      params.push(filters.fecha_hasta);
    }
    
    query += ' ORDER BY im.created_at DESC';
    const result = await pool.query(query, params);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(
      `SELECT im.*, i.nombre as insumo_nombre, u.nombre as usuario_nombre
       FROM insumo_movimientos im
       JOIN insumos i ON im.insumo_id = i.id
       LEFT JOIN usuarios u ON im.usuario_id = u.id
       WHERE im.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  create: async (data) => {
    if (!data.insumo_id || data.insumo_id <= 0) {
      const error = new Error('El ID del insumo es obligatorio y debe ser válido');
      error.statusCode = 400;
      throw error;
    }
    if (!['Entrega', 'Consumo', 'Ajuste'].includes(data.tipo_movimiento)) {
      const error = new Error('Tipo de movimiento inválido. Valores permitidos: Entrega, Consumo, Ajuste');
      error.statusCode = 400;
      throw error;
    }
    if (data.cantidad === undefined || data.cantidad === 0) {
      const error = new Error('La cantidad debe ser un valor diferente de cero');
      error.statusCode = 400;
      throw error;
    }
    if (!data.unidad || !String(data.unidad).trim()) {
      const error = new Error('La unidad es obligatoria');
      error.statusCode = 400;
      throw error;
    }
    
    const result = await pool.query(
      `INSERT INTO insumo_movimientos 
       (insumo_id, tipo_movimiento, cantidad, unidad, saldo_anterior, saldo_nuevo, referencia_tabla, referencia_id, usuario_id, razon) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING id`,
      [
        data.insumo_id,
        data.tipo_movimiento,
        data.cantidad,
        data.unidad,
        data.saldo_anterior || null,
        data.saldo_nuevo || null,
        data.referencia_tabla || null,
        data.referencia_id || null,
        data.usuario_id || null,
        data.razon || null
      ]
    );
    return result.rows[0].id;
  },
  getHistorialByInsumo: async (insumoId, limit = 50) => {
    const result = await pool.query(`
      SELECT im.*, i.nombre as insumo_nombre, u.nombre as usuario_nombre
      FROM insumo_movimientos im
      JOIN insumos i ON im.insumo_id = i.id
      LEFT JOIN usuarios u ON im.usuario_id = u.id
      WHERE im.insumo_id = $1
      ORDER BY im.created_at DESC
      LIMIT $2
    `, [insumoId, limit]);
    return result.rows;
  },
  getResumenByInsumo: async (insumoId) => {
    const result = await pool.query(`
      SELECT 
        i.id,
        i.nombre,
        i.cantidad as stock_actual,
        COUNT(CASE WHEN im.tipo_movimiento = 'Entrega' THEN 1 END) as total_entregas,
        COUNT(CASE WHEN im.tipo_movimiento = 'Consumo' THEN 1 END) as total_consumos,
        COUNT(CASE WHEN im.tipo_movimiento = 'Ajuste' THEN 1 END) as total_ajustes,
        COALESCE(SUM(CASE WHEN im.tipo_movimiento = 'Entrega' THEN im.cantidad ELSE 0 END), 0) as total_cantidad_entregada,
        COALESCE(SUM(CASE WHEN im.tipo_movimiento = 'Consumo' THEN ABS(im.cantidad) ELSE 0 END), 0) as total_cantidad_consumida,
        MAX(im.created_at) as ultimo_movimiento
      FROM insumos i
      LEFT JOIN insumo_movimientos im ON i.id = im.insumo_id
      WHERE i.id = $1
      GROUP BY i.id, i.nombre, i.cantidad
    `, [insumoId]);
    return result.rows[0] || null;
  }
};

// ------- AUDITORÍA: PRODUCTOS / CATEGORÍAS / CLIENTES -------
let productoAuditTableReady = null;
let categoriaAuditTableReady = null;
let clienteAuditTableReady = null;

const ensureProductoAuditTable = async () => {
  if (!productoAuditTableReady) {
    productoAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS productos_auditoria (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  await productoAuditTableReady;
};

const registerProductoAudit = async ({ productoId, accion, usuarioId = null, cambios }) => {
  try {
    await ensureProductoAuditTable();
    await pool.query(
      'INSERT INTO productos_auditoria (producto_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
      [productoId, accion, usuarioId, JSON.stringify(cambios || {})]
    );
  } catch (err) {
    // La auditoría nunca debe romper la operación principal
    console.warn('⚠️  No se pudo registrar auditoría de producto:', err.message);
  }
};

const ensureCategoriaAuditTable = async () => {
  if (!categoriaAuditTableReady) {
    categoriaAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS categorias_auditoria (
        id SERIAL PRIMARY KEY,
        categoria_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  await categoriaAuditTableReady;
};

const registerCategoriaAudit = async ({ categoriaId, accion, usuarioId = null, cambios }) => {
  try {
    await ensureCategoriaAuditTable();
    await pool.query(
      'INSERT INTO categorias_auditoria (categoria_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
      [categoriaId, accion, usuarioId, JSON.stringify(cambios || {})]
    );
  } catch (err) {
    console.warn('⚠️  No se pudo registrar auditoría de categoría:', err.message);
  }
};

const ensureClienteAuditTable = async () => {
  if (!clienteAuditTableReady) {
    clienteAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS clientes_auditoria (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  await clienteAuditTableReady;
};

const registerClienteAudit = async ({ clienteId, accion, usuarioId = null, cambios }) => {
  try {
    await ensureClienteAuditTable();
    await pool.query(
      'INSERT INTO clientes_auditoria (cliente_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
      [clienteId, accion, usuarioId, JSON.stringify(cambios || {})]
    );
  } catch (err) {
    console.warn('⚠️  No se pudo registrar auditoría de cliente:', err.message);
  }
};

// ------- ROLES -------
let roleAuditTableReady = null;
let userAuditTableReady = null;
let userSessionTableReady = null;
let userBackupTableReady = null;
let userPasswordHistoryTableReady = null;
let userPasswordResetTableReady = null;
let userLoginAttemptsTableReady = null;

const ensureRoleAuditTable = async () => {
  if (!roleAuditTableReady) {
    roleAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS roles_auditoria (
        id SERIAL PRIMARY KEY,
        rol_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await roleAuditTableReady;
};

const registerRoleAudit = async ({ rolId, accion, usuarioId = null, cambios }) => {
  await ensureRoleAuditTable();
  await pool.query(
    'INSERT INTO roles_auditoria (rol_id, accion, usuario_id, cambios) VALUES ($1, $2, $3, $4)',
    [rolId, accion, usuarioId, JSON.stringify(cambios || {})]
  );
};

const ensureUserAuditTable = async () => {
  if (!userAuditTableReady) {
    userAuditTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_auditoria (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        actor_id INTEGER,
        cambios JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userAuditTableReady;
};

const ensureUserSessionTable = async () => {
  if (!userSessionTableReady) {
    userSessionTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios_sesiones (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          jti VARCHAR(120) NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          revoked_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query('ALTER TABLE usuarios_sesiones ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64)');
      await pool.query('ALTER TABLE usuarios_sesiones ADD COLUMN IF NOT EXISTS user_agent TEXT');
    })();
  }

  await userSessionTableReady;
};

const ensureUserBackupTable = async () => {
  if (!userBackupTableReady) {
    userBackupTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_backup (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        actor_id INTEGER,
        reason TEXT,
        snapshot JSONB NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userBackupTableReady;
};

const ensureUserPasswordHistoryTable = async () => {
  if (!userPasswordHistoryTableReady) {
    userPasswordHistoryTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_password_historial (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userPasswordHistoryTableReady;
};

const ensureUserPasswordResetTable = async () => {
  if (!userPasswordResetTableReady) {
    userPasswordResetTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_password_resets (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userPasswordResetTableReady;
};

const ensureUserLoginAttemptsTable = async () => {
  if (!userLoginAttemptsTableReady) {
    userLoginAttemptsTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_login_intentos (
        email VARCHAR(255) PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        blocked_until TIMESTAMP NULL,
        last_attempt_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await userLoginAttemptsTableReady;
};

const registerUserSession = async ({ usuarioId, jti, expiresAt, ipAddress = null, userAgent = null }) => {
  await ensureUserSessionTable();
  await pool.query(
    `INSERT INTO usuarios_sesiones (usuario_id, jti, expires_at, last_seen_at, ip_address, user_agent)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), CURRENT_TIMESTAMP, $4, $5)`,
    [usuarioId, jti, expiresAt, ipAddress, userAgent]
  );
};

const getPasswordHistory = async (usuarioId, limit = 3) => {
  await ensureUserPasswordHistoryTable();
  const result = await pool.query(
    `SELECT password_hash
     FROM usuarios_password_historial
     WHERE usuario_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [usuarioId, limit]
  );
  return result.rows.map((row) => row.password_hash);
};

const storePasswordHistory = async (usuarioId, passwordHash) => {
  await ensureUserPasswordHistoryTable();
  await pool.query(
    'INSERT INTO usuarios_password_historial (usuario_id, password_hash) VALUES ($1, $2)',
    [usuarioId, passwordHash]
  );
};

const createPasswordResetToken = async ({ usuarioId, tokenHash, expiresAt }) => {
  await ensureUserPasswordResetTable();
  await pool.query(
    'INSERT INTO usuarios_password_resets (usuario_id, token_hash, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))',
    [usuarioId, tokenHash, expiresAt]
  );
};

const consumePasswordResetToken = async ({ email, tokenHash }) => {
  await ensureUserPasswordResetTable();
  const result = await pool.query(
    `SELECT pr.*, u.id AS usuario_id
     FROM usuarios_password_resets pr
     JOIN usuarios u ON u.id = pr.usuario_id
     WHERE LOWER(u.email) = LOWER($1)
       AND pr.token_hash = $2
       AND pr.used_at IS NULL
       AND pr.expires_at > CURRENT_TIMESTAMP
     ORDER BY pr.created_at DESC
     LIMIT 1`,
    [email, tokenHash]
  );

  const tokenRow = result.rows[0];
  if (!tokenRow) return null;

  await pool.query('UPDATE usuarios_password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [tokenRow.id]);
  return tokenRow;
};

const getLoginAttemptRecord = async (email) => {
  await ensureUserLoginAttemptsTable();
  const result = await pool.query('SELECT * FROM usuarios_login_intentos WHERE email = LOWER($1) LIMIT 1', [email]);
  return result.rows[0] || null;
};

const registerLoginFailure = async (email) => {
  await ensureUserLoginAttemptsTable();
  const current = await getLoginAttemptRecord(email);
  const attempts = Number(current?.attempts || 0) + 1;
  const blockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : current?.blocked_until || null;

  await pool.query(
    `INSERT INTO usuarios_login_intentos (email, attempts, blocked_until, last_attempt_at, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO UPDATE
     SET attempts = EXCLUDED.attempts,
         blocked_until = EXCLUDED.blocked_until,
         last_attempt_at = EXCLUDED.last_attempt_at,
         updated_at = CURRENT_TIMESTAMP`,
    [String(email).trim().toLowerCase(), attempts, blockedUntil]
  );

  return { attempts, blockedUntil };
};

const clearLoginAttempts = async (email) => {
  await ensureUserLoginAttemptsTable();
  await pool.query('DELETE FROM usuarios_login_intentos WHERE LOWER(email) = LOWER($1)', [email]);
};

const isLoginBlocked = async (email) => {
  const record = await getLoginAttemptRecord(email);
  if (!record?.blocked_until) return false;
  return new Date(record.blocked_until).getTime() > Date.now();
};

/**
 * Devuelve información detallada del bloqueo: si está bloqueado y cuánto
 * tiempo (ms) le queda para volver a intentar. Útil para construir mensajes
 * claros ("Inténtalo en X minutos") sin hardcodear la cifra en el controller.
 */
const getLoginBlockInfo = async (email) => {
  const record = await getLoginAttemptRecord(email);
  if (!record?.blocked_until) return { blocked: false, remainingMs: 0, attempts: Number(record?.attempts || 0) };
  const blockedUntilMs = new Date(record.blocked_until).getTime();
  const remainingMs = blockedUntilMs - Date.now();
  return {
    blocked: remainingMs > 0,
    remainingMs: Math.max(0, remainingMs),
    attempts: Number(record.attempts || 0),
  };
};

const revokeUserSession = async (jti) => {
  if (!jti) return;
  await ensureUserSessionTable();
  await pool.query(
    'UPDATE usuarios_sesiones SET revoked_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE jti = $1',
    [jti]
  );
};

const getActiveUserSessionCount = async (usuarioId) => {
  await ensureUserSessionTable();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM usuarios_sesiones
     WHERE usuario_id = $1
       AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP`,
    [usuarioId]
  );
  return Number(result.rows[0]?.total || 0);
};

const getLinkedClienteForUsuario = async (usuario) => {
  const linkedByUserId = await pool.query('SELECT * FROM clientes WHERE usuario_id = $1', [usuario.id]);
  if (linkedByUserId.rows[0]) return linkedByUserId.rows[0];

  if (!usuario?.email) return null;

  const linkedByEmail = await pool.query(
    'SELECT * FROM clientes WHERE email IS NOT NULL AND LOWER(email) = LOWER($1) LIMIT 1',
    [usuario.email]
  );

  return linkedByEmail.rows[0] || null;
};

const getUserDeletionBlockers = async (usuario) => {
  const blockers = [];
  const linkedCliente = await getLinkedClienteForUsuario(usuario);

  if (!linkedCliente) {
    return blockers;
  }

  const thresholdQuery = "CURRENT_TIMESTAMP - INTERVAL '30 days'";
  const counts = [
    {
      key: 'pedidos_activos',
      label: 'pedidos activos',
      query: `SELECT COUNT(*)::int AS total FROM pedidos WHERE cliente_id = $1 AND estado NOT IN ('Completado', 'Cancelado')`,
    },
    {
      key: 'domicilios_activos',
      label: 'domicilios activos',
      query: `SELECT COUNT(*)::int AS total FROM domicilios WHERE cliente_id = $1 AND estado NOT IN ('Entregado', 'Cancelado')`,
    },
    {
      key: 'pedidos_recientes',
      label: 'pedidos de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM pedidos WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
    {
      key: 'ventas_recientes',
      label: 'ventas de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM ventas WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
    {
      key: 'abonos_recientes',
      label: 'abonos de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM abonos WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
    {
      key: 'domicilios_recientes',
      label: 'domicilios de los ultimos 30 dias',
      query: `SELECT COUNT(*)::int AS total FROM domicilios WHERE cliente_id = $1 AND created_at >= ${thresholdQuery}`,
    },
  ];

  const results = await Promise.all(counts.map(async (item) => {
    const result = await pool.query(item.query, [linkedCliente.id]);
    const total = Number(result.rows[0]?.total || 0);
    return total > 0 ? { key: item.key, label: item.label, total } : null;
  }));

  for (const blocker of results) {
    if (blocker) blockers.push(blocker);
  }

  return blockers;
};

const buildUserFilterQuery = (filters = {}) => {
  const where = [];
  const values = [];

  const pushValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (!filters.includeDeleted) {
    where.push("(u.estado IS NULL OR u.estado <> 'Eliminado')");
  }

  // Excluir explícitamente usuarios con rol 'Cliente' del módulo de Gestión de Usuarios.
  // Los clientes se administran únicamente desde el módulo de Clientes.
  if (filters.excludeClientes) {
    where.push("(r.nombre IS NULL OR LOWER(r.nombre) <> 'cliente')");
  }

  if (Array.isArray(filters.estados) && filters.estados.length > 0) {
    const placeholders = filters.estados.map((estado) => pushValue(estado));
    where.push(`u.estado IN (${placeholders.join(', ')})`);
  }

  if (filters.rolId) {
    where.push(`u.rol_id = ${pushValue(filters.rolId)}`);
  }

  if (Array.isArray(filters.tiposDocumento) && filters.tiposDocumento.length > 0) {
    const placeholders = filters.tiposDocumento.map((tipo) => pushValue(tipo));
    where.push(`u.tipo_documento IN (${placeholders.join(', ')})`);
  }

  if (filters.fechaDesde) {
    where.push(`u.created_at >= ${pushValue(filters.fechaDesde)}`);
  }

  if (filters.fechaHasta) {
    where.push(`u.created_at <= ${pushValue(filters.fechaHasta)}`);
  }

  if (typeof filters.globalQuery === 'string' && filters.globalQuery.trim()) {
    const term = `%${filters.globalQuery.trim().toLowerCase()}%`;
    const placeholder = pushValue(term);
    where.push(`(
      LOWER(COALESCE(u.nombre, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.apellido, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.email, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.documento, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.telefono, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.direccion, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.tipo_documento, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.estado, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(r.nombre, '')) LIKE ${placeholder}
      OR CAST(u.id AS TEXT) LIKE ${placeholder}
    )`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return { whereClause, values };
};

const getUserDeletionImpact = async (usuarioId) => {
  const usuario = await Usuarios.getById(usuarioId);
  if (!usuario) {
    return null;
  }

  const blockers = await getUserDeletionBlockers(usuario);
  const activeSessions = await getActiveUserSessionCount(usuarioId);
  const isInactiveState = ['inactivo', 'eliminado'].includes(String(usuario.estado || '').toLowerCase());
  const referenceDate = isInactiveState ? new Date(usuario.updated_at || usuario.created_at || Date.now()) : null;
  const daysInactive = referenceDate
    ? Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const canPhysicalDelete = Boolean(isInactiveState && daysInactive >= 90);

  return {
    usuario,
    blockers,
    activeSessions,
    daysInactive,
    canPhysicalDelete,
    hasImpact: blockers.length > 0 || activeSessions > 0,
  };
};

const registerUserAudit = async ({ usuarioId, accion, actorId, cambios }) => {
  try {
    await pool.query(
      `INSERT INTO usuarios_auditoria (usuario_id, accion, actor_id, cambios, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [usuarioId, accion, actorId, JSON.stringify(cambios)]
    );
  } catch (error) {
    console.error('Error registering user audit:', error.message);
    // No throw - audit failure shouldn't block the main operation
  }
};

const toUserSnapshot = (user) => ({
  id: user?.id ?? null,
  nombre: user?.nombre ?? null,
  apellido: user?.apellido ?? null,
  tipo_documento: user?.tipo_documento ?? null,
  documento: user?.documento ?? null,
  direccion: user?.direccion ?? null,
  email: user?.email ?? null,
  telefono: user?.telefono ?? null,
  rol_id: user?.rol_id ?? null,
  estado: user?.estado ?? null,
  updated_at: user?.updated_at ?? null,
});

const getUserChanges = (before, after) => {
  const changed = {};
  const fields = ['nombre', 'apellido', 'tipo_documento', 'documento', 'direccion', 'email', 'telefono', 'rol_id', 'estado'];

  fields.forEach((field) => {
    const previous = before?.[field];
    const next = after?.[field];
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changed[field] = { before: previous, after: next };
    }
  });

  return changed;
};

const toRoleSnapshot = (role) => ({
  id: role?.id ?? null,
  nombre: role?.nombre ?? null,
  descripcion: role?.descripcion ?? null,
  permisos: Array.isArray(role?.permisos) ? role.permisos : [],
  estado: role?.estado ?? null,
  updated_at: role?.updated_at ?? null,
});

const getRoleChanges = (before, after) => {
  const changed = {};
  const fields = ['nombre', 'descripcion', 'permisos', 'estado'];

  fields.forEach((field) => {
    const previous = before?.[field];
    const next = after?.[field];
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changed[field] = { before: previous, after: next };
    }
  });

  return changed;
};

const CLIENT_ROLE_NAME = 'cliente';
const CLIENT_ALLOWED_PERMISSIONS = [
  'Ver Dashboard',
  'Ver Tienda',
  'Ver Mis Pedidos',
  'Ver Mis Lista de Compras',
  'Ver Mis Compras',
  'Ver Mis Domicilios',
];

const normalizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];

  const normalized = permissions
    .filter((permission) => typeof permission === 'string')
    .map((permission) => permission.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
};

const isClientRoleName = (roleName) =>
  typeof roleName === 'string' && roleName.trim().toLowerCase() === CLIENT_ROLE_NAME;

// Validación intuitiva del nombre de un rol (3-50 caracteres, sin caracteres extraños).
// Devuelve un Error con statusCode 400 cuando algo no es válido, o null cuando el nombre es correcto.
const validateRoleName = (rawName) => {
  const nombre = typeof rawName === 'string' ? rawName.trim() : '';

  if (!nombre) {
    const error = new Error('El nombre del rol es obligatorio.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'required' };
    return error;
  }

  if (nombre.length < 3) {
    const error = new Error('El nombre del rol debe tener al menos 3 caracteres.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'min_length', min: 3, length: nombre.length };
    return error;
  }

  if (nombre.length > 50) {
    const error = new Error('El nombre del rol no puede superar los 50 caracteres.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'max_length', max: 50, length: nombre.length };
    return error;
  }

  // Solo letras (con tildes/ñ), números, espacios, guiones y guion bajo
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s_\-]+$/.test(nombre)) {
    const error = new Error('El nombre del rol solo puede contener letras, números, espacios, guiones o guion bajo.');
    error.statusCode = 400;
    error.details = { field: 'nombre', reason: 'invalid_characters' };
    return error;
  }

  return null;
};

const buildDuplicateRoleNameError = (nombre) => {
  const error = new Error(`Ya existe un rol con el nombre "${String(nombre || '').trim()}". Elija un nombre diferente.`);
  error.statusCode = 409;
  error.details = { field: 'nombre', reason: 'duplicate' };
  return error;
};

const validatePermissionsPayload = ({ nextPermissions, roleName }) => {
  if (!Array.isArray(nextPermissions)) return null;

  if (isClientRoleName(roleName)) {
    const invalid = nextPermissions.filter((permission) => !CLIENT_ALLOWED_PERMISSIONS.includes(permission));
    if (invalid.length > 0 || nextPermissions.length === 0) {
      const error = new Error(
        `El rol Cliente solo puede incluir permisos permitidos: ${CLIENT_ALLOWED_PERMISSIONS.join(', ')}`
      );
      error.statusCode = 400;
      error.details = {
        reason: 'cliente_permissions_only',
        allowed: CLIENT_ALLOWED_PERMISSIONS,
        invalid,
      };
      return error;
    }

    return null;
  }

  if (nextPermissions.length === 0) {
    const error = new Error('Cada rol debe mantener al menos un permiso asignado');
    error.statusCode = 400;
    error.details = { reason: 'missing_permissions' };
    return error;
  }

  return null;
};

const Roles = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT r.*, 
             COALESCE(u.usuarios, 0) AS usuarios,
             COALESCE(u.usuarios_activos, 0) AS usuarios_activos
      FROM roles r
      LEFT JOIN (
        SELECT rol_id,
               COUNT(*) FILTER (WHERE estado IS NULL OR estado <> 'Eliminado') AS usuarios,
               COUNT(*) FILTER (WHERE estado = 'Activo') AS usuarios_activos
        FROM usuarios
        GROUP BY rol_id
      ) u ON u.rol_id = r.id
      ORDER BY r.nombre
    `);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(
      `SELECT r.*,
              COALESCE(u.usuarios, 0) AS usuarios,
              COALESCE(u.usuarios_activos, 0) AS usuarios_activos
       FROM roles r
       LEFT JOIN (
         SELECT rol_id,
                COUNT(*) FILTER (WHERE estado IS NULL OR estado <> 'Eliminado') AS usuarios,
                COUNT(*) FILTER (WHERE estado = 'Activo') AS usuarios_activos
         FROM usuarios
         GROUP BY rol_id
       ) u ON u.rol_id = r.id
       WHERE r.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  getByNombre: async (nombre) => {
    const result = await pool.query('SELECT * FROM roles WHERE nombre = $1', [nombre]);
    return result.rows[0];
  },
  create: async (data, options = {}) => {
    const nameError = validateRoleName(data?.nombre);
    if (nameError) throw nameError;

    const nombreNormalizado = String(data.nombre).trim();

    const duplicate = await pool.query(
      'SELECT id FROM roles WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
      [nombreNormalizado]
    );
    if (duplicate.rows.length > 0) {
      throw buildDuplicateRoleNameError(nombreNormalizado);
    }

    const permisosNormalizados = normalizePermissions(data.permisos || []);

    const permissionsError = validatePermissionsPayload({ nextPermissions: permisosNormalizados, roleName: nombreNormalizado });

    if (permissionsError) throw permissionsError;

    let id;
    try {
      const result = await pool.query(
        'INSERT INTO roles (nombre, descripcion, permisos, estado) VALUES ($1, $2, $3, $4) RETURNING id',
        [nombreNormalizado, data.descripcion, permisosNormalizados, data.estado || 'Activo']
      );
      id = result.rows[0].id;
    } catch (insertError) {
      if (insertError && insertError.code === '23505') {
        throw buildDuplicateRoleNameError(nombreNormalizado);
      }
      throw insertError;
    }

    const createdRole = await Roles.getById(id);
    await registerRoleAudit({
      rolId: id,
      accion: 'CREATE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: null,
        after: toRoleSnapshot(createdRole),
      },
    });

    return id;
  },
  update: async (id, data, options = {}) => {
    const currentRole = await Roles.getById(id);
    if (!currentRole) {
      const error = new Error('No se encontró el rol que intenta actualizar.');
      error.statusCode = 404;
      throw error;
    }

    let nombreNormalizado = currentRole.nombre;
    if (typeof data.nombre === 'string' && data.nombre.trim() && data.nombre.trim() !== currentRole.nombre) {
      const nameError = validateRoleName(data.nombre);
      if (nameError) throw nameError;
      nombreNormalizado = data.nombre.trim();

      const duplicate = await pool.query(
        'SELECT id FROM roles WHERE LOWER(nombre) = LOWER($1) AND id <> $2 LIMIT 1',
        [nombreNormalizado, id]
      );
      if (duplicate.rows.length > 0) {
        throw buildDuplicateRoleNameError(nombreNormalizado);
      }
    }

    const targetRoleName = nombreNormalizado;

    let nextPermissions = data.permisos;
    if (Array.isArray(data.permisos)) {
      nextPermissions = normalizePermissions(data.permisos);

      const permissionsError = validatePermissionsPayload({ nextPermissions, roleName: targetRoleName });

      if (permissionsError) throw permissionsError;
    }

    if (data.estado === 'Inactivo') {
      const assignedUsersResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM usuarios
         WHERE rol_id = $1
           AND (estado IS NULL OR estado <> 'Eliminado')`,
        [id]
      );
      const assignedUsers = Number(assignedUsersResult.rows[0]?.total || 0);

      if (assignedUsers > 0) {
        const error = new Error(
          `No se puede desactivar este rol porque tiene ${assignedUsers} usuario(s) asignado(s). Reasigne esos usuarios antes de desactivarlo.`
        );
        error.statusCode = 400;
        error.details = { assignedUsers };
        throw error;
      }
    }

    try {
      await pool.query(
        `UPDATE roles
         SET nombre = COALESCE($1, nombre),
             descripcion = COALESCE($2, descripcion),
             permisos = COALESCE($3, permisos),
             estado = COALESCE($4, estado),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [data.nombre ? nombreNormalizado : null, data.descripcion, nextPermissions, data.estado, id]
      );
    } catch (updateError) {
      if (updateError && updateError.code === '23505') {
        throw buildDuplicateRoleNameError(nombreNormalizado);
      }
      throw updateError;
    }

    const updatedRole = await Roles.getById(id);
    const changedFields = getRoleChanges(toRoleSnapshot(currentRole), toRoleSnapshot(updatedRole));

    await registerRoleAudit({
      rolId: Number(id),
      accion: 'UPDATE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: toRoleSnapshot(currentRole),
        after: toRoleSnapshot(updatedRole),
        changedFields,
        reason: typeof data.motivo === 'string' && data.motivo.trim() ? data.motivo.trim() : null,
      },
    });

    return true;
  },
  updatePermissions: async (id, permisos, options = {}) => {
    const currentRole = await Roles.getById(id);
    if (!currentRole) {
      const error = new Error('Rol no encontrado');
      error.statusCode = 404;
      throw error;
    }

    let nextPermissions = normalizePermissions(permisos || []);
    const permissionsError = validatePermissionsPayload({ nextPermissions, roleName: currentRole.nombre });

    if (permissionsError) throw permissionsError;

    await pool.query(
      `UPDATE roles
       SET permisos = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [nextPermissions, id]
    );

    const updatedRole = await Roles.getById(id);
    const changedFields = getRoleChanges(toRoleSnapshot(currentRole), toRoleSnapshot(updatedRole));

    await registerRoleAudit({
      rolId: Number(id),
      accion: 'UPDATE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: toRoleSnapshot(currentRole),
        after: toRoleSnapshot(updatedRole),
        changedFields,
        reason: typeof options.reason === 'string' && options.reason.trim() ? options.reason.trim() : null,
      },
    });

    return true;
  },
  delete: async (id, options = {}) => {
    const currentRole = await Roles.getById(id);

    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (!reason || reason.length < 10 || reason.length > 200) {
      const error = new Error('El motivo de eliminación es obligatorio y debe tener entre 10 y 200 caracteres');
      error.statusCode = 400;
      error.details = { reasonLength: reason.length };
      throw error;
    }

    await pool.query('DELETE FROM roles WHERE id = $1', [id]);

    await registerRoleAudit({
      rolId: Number(id),
      accion: 'DELETE',
      usuarioId: options.usuarioId ?? null,
      cambios: {
        before: toRoleSnapshot(currentRole),
        after: null,
        reason,
      },
    });

    return true;
  },
  getAuditByRole: async (id) => {
    await ensureRoleAuditTable();
    const result = await pool.query(
      `SELECT ra.*, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
       FROM roles_auditoria ra
       LEFT JOIN usuarios u ON u.id = ra.usuario_id
       WHERE ra.rol_id = $1
       ORDER BY ra.created_at DESC`,
      [id]
    );
    return result.rows;
  }
};

// ------- USUARIOS -------
const Usuarios = {
  getAll: async (filters = {}) => {
    const { whereClause, values } = buildUserFilterQuery(filters);
    const querySuffix =
      typeof filters.limit === 'number' && Number.isFinite(filters.limit)
        ? ` LIMIT ${Math.max(1, Math.min(filters.limit, 50000))}`
        : '';

    const result = await pool.query(`
      SELECT u.id,
             u.nombre,
             u.apellido,
             u.tipo_documento,
             u.documento,
             u.direccion,
             u.email,
             u.telefono,
             u.rol_id,
             u.estado,
             u.created_at,
             u.updated_at,
             r.nombre AS rol
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      ${whereClause}
      ORDER BY u.id ASC
      ${querySuffix}
    `, values);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query(`
      SELECT u.*, r.nombre as rol
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      WHERE u.id = $1
    `, [id]);
    return result.rows[0];
  },
  getByEmail: async (email) => {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return result.rows[0];
  },
  getByDocumento: async (documento) => {
    const result = await pool.query('SELECT * FROM usuarios WHERE documento = $1', [documento]);
    return result.rows[0];
  },
  getByTelefono: async (telefono) => {
    const result = await pool.query('SELECT * FROM usuarios WHERE telefono = $1', [telefono]);
    return result.rows[0];
  },
  getByEmailLogin: async (identifier) => {
    const result = await pool.query(
      `SELECT * FROM usuarios
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );
    return result.rows[0];
  },
  getFullDetailById: async (id, options = {}) => {
    await ensureUserAuditTable();
    await ensureUserSessionTable();

    const safeLimit = Number.isFinite(Number(options.limit))
      ? Math.max(20, Math.min(Number(options.limit), 300))
      : 120;

    const usuario = await Usuarios.getById(id);
    if (!usuario) return null;

    const auditResult = await pool.query(
      `SELECT ua.id,
              ua.usuario_id,
              ua.accion,
              ua.actor_id,
              ua.cambios,
              ua.created_at,
              actor.nombre AS actor_nombre,
              actor.apellido AS actor_apellido,
              actor.email AS actor_email
       FROM usuarios_auditoria ua
       LEFT JOIN usuarios actor ON actor.id = ua.actor_id
       WHERE ua.usuario_id = $1
       ORDER BY ua.created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    const sessionsResult = await pool.query(
      `SELECT id, usuario_id, jti, created_at, expires_at, revoked_at, last_seen_at, ip_address, user_agent
       FROM usuarios_sesiones
       WHERE usuario_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    return {
      usuario,
      logs: auditResult.rows,
      sesiones: sessionsResult.rows,
      activeSessions: sessionsResult.rows.filter(
        (session) => !session.revoked_at && new Date(session.expires_at).getTime() > Date.now()
      ).length,
    };
  },
  getDeletionImpact: async (id) => {
    const impact = await getUserDeletionImpact(id);
    return impact;
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, tipo_documento, documento, direccion, email, telefono, password_hash, rol_id, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [data.nombre, data.apellido, data.tipo_documento, data.documento, data.direccion, data.email, data.telefono, data.password_hash || '$2a$10$DEFAULT', data.rol_id, data.estado || 'Activo']
    );
    const createdUser = await Usuarios.getById(result.rows[0].id);
    await registerUserAudit({
      usuarioId: result.rows[0].id,
      accion: 'CREATE',
      actorId: data.actor_id ?? null,
      cambios: {
        before: null,
        after: toUserSnapshot(createdUser),
      },
    });
    return result.rows[0].id;
  },
  update: async (id, data) => {
    const currentUser = await Usuarios.getById(id);
    await pool.query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre),
           apellido = COALESCE($2, apellido),
           tipo_documento = COALESCE($3, tipo_documento),
           documento = COALESCE($4, documento),
           direccion = COALESCE($5, direccion),
           email = COALESCE($6, email),
           telefono = COALESCE($7, telefono),
           rol_id = COALESCE($8, rol_id),
           estado = COALESCE($9, estado),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $10`,
      [
        data.nombre,
        data.apellido,
        data.tipo_documento,
        data.documento,
        data.direccion,
        data.email,
        data.telefono,
        data.rol_id,
        data.estado,
        id,
      ]
    );

    const updatedUser = await Usuarios.getById(id);
    const changedFields = getUserChanges(toUserSnapshot(currentUser), toUserSnapshot(updatedUser));
    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'UPDATE',
      actorId: data.actor_id ?? null,
      cambios: {
        before: toUserSnapshot(currentUser),
        after: toUserSnapshot(updatedUser),
        changedFields,
        reason: typeof data.motivo === 'string' && data.motivo.trim() ? data.motivo.trim() : null,
      },
    });
    return true;
  },
  updatePasswordHash: async (id, passwordHash) => {
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );
    return true;
  },
  getPasswordHistory: getPasswordHistory,
  storePasswordHistory: storePasswordHistory,
  createPasswordResetToken: createPasswordResetToken,
  consumePasswordResetToken: consumePasswordResetToken,
  registerLoginFailure: registerLoginFailure,
  clearLoginAttempts: clearLoginAttempts,
  isLoginBlocked: isLoginBlocked,
  getLoginBlockInfo: getLoginBlockInfo,
  registerSession: async ({ usuarioId, jti, expiresAt, ipAddress = null, userAgent = null }) => {
    await registerUserSession({ usuarioId, jti, expiresAt, ipAddress, userAgent });
    return true;
  },
  revokeSession: async (jti) => {
    await revokeUserSession(jti);
    return true;
  },
  getActiveSessionCount: async (id) => {
    return getActiveUserSessionCount(id);
  },
  getActivityById: async (id, limit = 80) => {
    await ensureUserAuditTable();
    await ensureUserSessionTable();

    const safeLimit = Number.isFinite(Number(limit))
      ? Math.max(10, Math.min(Number(limit), 200))
      : 80;

    const auditResult = await pool.query(
      `SELECT ua.id,
              ua.usuario_id,
              ua.accion,
              ua.actor_id,
              ua.cambios,
              ua.created_at,
              actor.nombre AS actor_nombre,
              actor.apellido AS actor_apellido,
              actor.email AS actor_email
       FROM usuarios_auditoria ua
       LEFT JOIN usuarios actor ON actor.id = ua.actor_id
       WHERE ua.usuario_id = $1
       ORDER BY ua.created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    const sessionsResult = await pool.query(
      `SELECT id, usuario_id, jti, created_at, expires_at, revoked_at, last_seen_at
       FROM usuarios_sesiones
       WHERE usuario_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, safeLimit]
    );

    const sessionEvents = [];
    sessionsResult.rows.forEach((session) => {
      sessionEvents.push({
        id: `session-login-${session.id}`,
        usuario_id: session.usuario_id,
        accion: 'LOGIN',
        actor_id: session.usuario_id,
        actor_nombre: null,
        actor_apellido: null,
        actor_email: null,
        cambios: {
          session_id: session.id,
          jti: session.jti,
          expires_at: session.expires_at,
        },
        created_at: session.created_at,
      });

      if (session.revoked_at) {
        sessionEvents.push({
          id: `session-logout-${session.id}`,
          usuario_id: session.usuario_id,
          accion: 'LOGOUT',
          actor_id: session.usuario_id,
          actor_nombre: null,
          actor_apellido: null,
          actor_email: null,
          cambios: {
            session_id: session.id,
            jti: session.jti,
            revoked_at: session.revoked_at,
            last_seen_at: session.last_seen_at,
          },
          created_at: session.revoked_at,
        });
      }
    });

    return [...auditResult.rows, ...sessionEvents]
      .filter((item) => item.created_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, safeLimit);
  },
  updateStatus: async (id, data = {}) => {
    const currentUser = await Usuarios.getById(id);
    if (!currentUser) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const nextStatus = data.estado;
    if (!['Activo', 'Inactivo'].includes(nextStatus)) {
      const error = new Error('Estado invalido. Valores permitidos: Activo, Inactivo');
      error.statusCode = 400;
      throw error;
    }

    const force = data.force === true || data.force === 'true';
    let activeSessions = 0;

    if (nextStatus === 'Inactivo') {
      ensureMotivoEstado(data?.motivo);
      activeSessions = await getActiveUserSessionCount(id);
      if (activeSessions > 0 && !force) {
        const error = new Error('No se puede desactivar un usuario con sesion activa');
        error.statusCode = 409;
        error.details = { activeSessions };
        throw error;
      }
      await checkInactivacionDependencias('usuario', id);
    } else {
      ensureMotivoEstado(data?.motivo);
    }

    await pool.query(
      'UPDATE usuarios SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextStatus, id]
    );

    const updatedUser = await Usuarios.getById(id);
    const changedFields = getUserChanges(toUserSnapshot(currentUser), toUserSnapshot(updatedUser));
    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'UPDATE',
      actorId: data.actor_id ?? null,
      cambios: {
        before: toUserSnapshot(currentUser),
        after: toUserSnapshot(updatedUser),
        changedFields,
        reason: typeof data.motivo === 'string' && data.motivo.trim() ? data.motivo.trim() : null,
        statusChange: true,
        force,
        activeSessions,
      },
    });

    return updatedUser;
  },
  assignRole: async (id, rolId) => {
    await pool.query(
      'UPDATE usuarios SET rol_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [rolId, id]
    );
    return true;
  },
  delete: async (id, options = {}) => {
    const currentUser = await Usuarios.getById(id);
    if (!currentUser) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (!reason || reason.length < 10 || reason.length > 200) {
      const error = new Error('El motivo de eliminacion es obligatorio y debe tener entre 10 y 200 caracteres');
      error.statusCode = 400;
      error.details = { reasonLength: reason.length };
      throw error;
    }

    const impact = await getUserDeletionImpact(id);

    if (!impact) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (impact.blockers.length > 0) {
      const error = new Error('No se puede eliminar el usuario porque tiene relaciones activas o transacciones recientes');
      error.statusCode = 409;
      error.details = { blockers: impact.blockers };
      throw error;
    }

    await ensureUserBackupTable();
    await ensureUserSessionTable();
    await ensureUserAuditTable();

    await pool.query(
      `INSERT INTO usuarios_backup (usuario_id, actor_id, reason, snapshot)
       VALUES ($1, $2, $3, $4)`,
      [id, options.actor_id ?? null, reason, JSON.stringify({ user: currentUser, impact })]
    );

    await pool.query('DELETE FROM usuarios_sesiones WHERE usuario_id = $1', [id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);

    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'DELETE',
      actorId: options.actor_id ?? null,
      cambios: {
        before: toUserSnapshot(currentUser),
        after: null,
        reason,
        physicalDelete: true,
        backupStored: true,
      },
    });
    return { mode: 'physical' };
  },
  forceResetPassword: async (id, options = {}) => {
    const user = await Usuarios.getById(id);
    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await Usuarios.updatePasswordHash(id, passwordHash);

    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'UPDATE',
      actorId: options.actor_id ?? null,
      cambios: {
        before: null,
        after: null,
        forcedPasswordReset: true,
        reason: typeof options.reason === 'string' ? options.reason.trim() : null,
      },
    });

    return {
      user,
      tempPassword,
    };
  }
};

// Exportar todos los modelos
module.exports = {
  Categorias,
  Productos,
  Clientes,
  Proveedores,
  Pedidos,
  Ventas,
  Abonos,
  Domicilios,
  Compras,
  Insumos,
  EntregasInsumos,
  Produccion,
  ProductoInsumos,
  InsumoMovimientos,
  Roles,
  Usuarios,
  Auditoria: {
    registerProductoAudit,
    registerCategoriaAudit,
    registerClienteAudit,
  },
};

