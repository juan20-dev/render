const pool = require('../../db');
const bcrypt = require('bcryptjs');
const { generateTempPassword } = require('../utils/credentials');

let productoImageColumnReady = null;

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

/**
 * FUNCIONES GENÉRICAS PARA CONSULTAS A LA BD POSTGRESQL
 */

// ------- CATEGORÍAS -------
const Categorias = {
  getAll: async () => {
    const result = await pool.query('SELECT * FROM categorias ORDER BY nombre');
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query('SELECT * FROM categorias WHERE id = $1', [id]);
    return result.rows[0];
  },
  create: async (data) => {
    await ensureProductoImageColumn();

    const nombre = String(data?.nombre || '').trim();
    const descripcion = String(data?.descripcion || '').trim();

    if (!nombre) {
      const error = new Error('El nombre de la categoría es obligatorio');
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
      'INSERT INTO categorias (nombre, descripcion, estado) VALUES ($1, $2, $3) RETURNING id',
      [nombre, descripcion || null, 'Activo']
    );
    return result.rows[0].id;
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

    await pool.query(
      'UPDATE categorias SET nombre = $1, descripcion = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [nombre, descripcion || null, id]
    );
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

    const motivo = typeof data?.motivo === 'string' ? data.motivo.trim() : '';
    if (!motivo || motivo.length < 10) {
      const error = new Error('El motivo de cambio de estado es obligatorio y debe tener al menos 10 caracteres');
      error.statusCode = 400;
      throw error;
    }

    if (current.estado === estado) {
      return current;
    }

    await pool.query(
      'UPDATE categorias SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [estado, id]
    );

    return Categorias.getById(id);
  },
  delete: async (id) => {
    await pool.query('DELETE FROM categorias WHERE id = $1', [id]);
    return true;
  }
};

// ------- PRODUCTOS -------
const Productos = {
  getAll: async () => {
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

    const result = await pool.query(
      'INSERT INTO productos (nombre, categoria_id, descripcion, precio, stock, stock_minimo, imagen_url, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [
        nombre,
        data.categoria_id,
        data.descripcion,
        data.precio,
        data.stock || 0,
        data.stock_minimo || 10,
        data.imagen_url,
        'Activo',
      ]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
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
      [nombre, data.categoria_id, data.descripcion, data.precio, data.stock, data.stock_minimo, data.imagen_url, id]
    );
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

    const motivo = typeof data?.motivo === 'string' ? data.motivo.trim() : '';
    if (!motivo || motivo.length < 10) {
      const error = new Error('El motivo de cambio de estado es obligatorio y debe tener al menos 10 caracteres');
      error.statusCode = 400;
      throw error;
    }

    if (current.estado === estado) {
      return current;
    }

    await pool.query(
      'UPDATE productos SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [estado, id]
    );

    return Productos.getById(id);
  },
  delete: async (id) => {
    await pool.query('DELETE FROM productos WHERE id = $1', [id]);
    return true;
  }
};

// ------- CLIENTES -------
const Clientes = {
  getAll: async () => {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nombre');
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
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
        id,
      ]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
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

    const reason = typeof data.motivo === 'string' ? data.motivo.trim() : '';
    if (!reason || reason.length < 10 || reason.length > 500) {
      const error = new Error('El motivo de cambio de estado es obligatorio y debe tener entre 10 y 500 caracteres');
      error.statusCode = 400;
      throw error;
    }

    if (currentProveedor.estado !== 'Inactivo' && nextEstado === 'Inactivo') {
      const pendingPurchases = await getPendingComprasByProveedor(id);
      if (pendingPurchases > 0) {
        const error = new Error('No se puede desactivar el proveedor porque tiene ordenes de compra pendientes');
        error.statusCode = 409;
        error.details = { pendingPurchases };
        throw error;
      }
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
  getAll: async () => {
    const result = await pool.query(`
      SELECT p.*, 
             CONCAT(c.nombre, ' ', c.apellido) as cliente,
             c.email
      FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id
      ORDER BY p.fecha DESC
    `);
    return result.rows;
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
  getByCliente: async (clienteId) => {
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
      'INSERT INTO pedidos (numero_pedido, cliente_id, fecha, fecha_entrega, detalles, total, estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [data.numero_pedido, data.cliente_id, data.fecha, data.fecha_entrega, data.detalles, data.total || 0, data.estado || 'Pendiente']
    );
    return result.rows[0].id;
  },
  addDetalle: async (pedidoId, productoId, cantidad, precioUnitario) => {
    const subtotal = cantidad * precioUnitario;
    await pool.query(
      'INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ($1, $2, $3, $4, $5)',
      [pedidoId, productoId, cantidad, precioUnitario, subtotal]
    );
    return true;
  },
  update: async (id, data) => {
    await pool.query(
      'UPDATE pedidos SET numero_pedido = $1, fecha = $2, fecha_entrega = $3, detalles = $4, total = $5, estado = $6 WHERE id = $7',
      [data.numero_pedido, data.fecha, data.fecha_entrega, data.detalles, data.total, data.estado, id]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM detalle_pedidos WHERE pedido_id = $1', [id]);
    await pool.query('DELETE FROM pedidos WHERE id = $1', [id]);
    return true;
  }
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
    await Ventas.validateClienteActivo(data.cliente_id);

    const result = await pool.query(
      'INSERT INTO ventas (numero_venta, tipo, cliente_id, pedido_id, fecha, metodopago, total, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [data.numero_venta, data.tipo, data.cliente_id, data.pedido_id, data.fecha, data.metodopago, data.total, data.estado || 'Completada']
    );
    return result.rows[0].id;
  },
  addDetalle: async (ventaId, productoId, cantidad, precioUnitario) => {
    const subtotal = cantidad * precioUnitario;
    await pool.query(
      'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ($1, $2, $3, $4, $5)',
      [ventaId, productoId, cantidad, precioUnitario, subtotal]
    );
    return true;
  },
  update: async (id, data) => {
    const current = await Ventas.getById(id);
    if (!current) {
      const error = new Error('Venta no encontrada');
      error.statusCode = 404;
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
const Abonos = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT a.*, c.nombre as cliente_nombre
      FROM abonos a
      JOIN clientes c ON a.cliente_id = c.id
      ORDER BY a.fecha DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query('SELECT * FROM abonos WHERE id = $1', [id]);
    return result.rows[0];
  },
  getByPedido: async (pedidoId) => {
    const result = await pool.query('SELECT * FROM abonos WHERE pedido_id = $1 ORDER BY fecha DESC', [pedidoId]);
    return result.rows;
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO abonos (numero_abono, pedido_id, cliente_id, monto, fecha, metodo_pago, estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [data.numero_abono, data.pedido_id, data.cliente_id, data.monto, data.fecha, data.metodo_pago, data.estado || 'Registrado']
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await pool.query(
      'UPDATE abonos SET monto = $1, fecha = $2, metodo_pago = $3, estado = $4 WHERE id = $5',
      [data.monto, data.fecha, data.metodo_pago, data.estado, id]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM abonos WHERE id = $1', [id]);
    return true;
  }
};

// ------- DOMICILIOS -------
const Domicilios = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT d.*, 
             p.numero_pedido as pedido,
             CONCAT(c.nombre, ' ', c.apellido) as cliente
      FROM domicilios d
      JOIN pedidos p ON d.pedido_id = p.id
      JOIN clientes c ON d.cliente_id = c.id
      ORDER BY d.fecha DESC, d.hora DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query('SELECT * FROM domicilios WHERE id = $1', [id]);
    return result.rows[0];
  },
  getByPedido: async (pedidoId) => {
    const result = await pool.query('SELECT * FROM domicilios WHERE pedido_id = $1', [pedidoId]);
    return result.rows[0];
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO domicilios (numero_domicilio, pedido_id, cliente_id, direccion, repartidor, fecha, hora, estado, detalle) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [data.numero_domicilio, data.pedido_id, data.cliente_id, data.direccion, data.repartidor, data.fecha, data.hora, data.estado || 'Pendiente', data.detalle]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await pool.query(
      'UPDATE domicilios SET repartidor = $1, fecha = $2, hora = $3, estado = $4, detalle = $5 WHERE id = $6',
      [data.repartidor, data.fecha, data.hora, data.estado, data.detalle, id]
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
        data.fecha_creacion,
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

    const precioContrato = Number(producto.precio || 0);
    if (!Number.isFinite(precioContrato) || precioContrato <= 0) {
      const error = new Error('El producto no tiene un precio de contrato válido');
      error.statusCode = 409;
      throw error;
    }

    if (Math.abs(parsedPrecioSolicitado - precioContrato) > 0.0001) {
      const error = new Error('El precio unitario debe coincidir con el precio de contrato del producto');
      error.statusCode = 409;
      error.details = { precioContrato };
      throw error;
    }

    const subtotal = parsedCantidad * precioContrato;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'INSERT INTO detalle_compras (compra_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ($1, $2, $3, $4, $5)',
        [compraId, productoId, parsedCantidad, precioContrato, subtotal]
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
        `SELECT producto_id, SUM(cantidad)::int AS cantidad
         FROM detalle_compras
         WHERE compra_id = $1
         GROUP BY producto_id`,
        [compraId]
      );

      if (!detalleResult.rows.length) {
        const error = new Error('La compra no tiene productos para recibir');
        error.statusCode = 409;
        throw error;
      }

      for (const detalle of detalleResult.rows) {
        await client.query(
          'UPDATE productos SET stock = COALESCE(stock, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [Number(detalle.cantidad || 0), detalle.producto_id]
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
    const result = await pool.query(
      'INSERT INTO insumos (nombre, descripcion, cantidad, unidad, stock_minimo, estado) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [data.nombre, data.descripcion, data.cantidad || 0, data.unidad, data.stock_minimo || 10, data.estado || 'Activo']
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await pool.query(
      'UPDATE insumos SET nombre = $1, descripcion = $2, cantidad = $3, unidad = $4, stock_minimo = $5, estado = $6 WHERE id = $7',
      [data.nombre, data.descripcion, data.cantidad, data.unidad, data.stock_minimo, data.estado, id]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM insumos WHERE id = $1', [id]);
    return true;
  }
};

// ------- ENTREGAS INSUMOS -------
const EntregasInsumos = {
  getAll: async () => {
    const result = await pool.query(`
      SELECT ei.*, i.nombre as insumo_nombre
      FROM entregas_insumos ei
      JOIN insumos i ON ei.insumo_id = i.id
      ORDER BY ei.fecha DESC
    `);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query('SELECT * FROM entregas_insumos WHERE id = $1', [id]);
    return result.rows[0];
  },
  create: async (data) => {
    const result = await pool.query(
      'INSERT INTO entregas_insumos (numero_entrega, insumo_id, cantidad, unidad, operario, fecha, hora) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [data.numero_entrega, data.insumo_id, data.cantidad, data.unidad, data.operario, data.fecha, data.hora]
    );
    return result.rows[0].id;
  },
  update: async (id, data) => {
    await pool.query(
      'UPDATE entregas_insumos SET insumo_id = $1, cantidad = $2, unidad = $3, operario = $4, fecha = $5, hora = $6 WHERE id = $7',
      [data.insumo_id, data.cantidad, data.unidad, data.operario, data.fecha, data.hora, id]
    );
    return true;
  },
  delete: async (id) => {
    await pool.query('DELETE FROM entregas_insumos WHERE id = $1', [id]);
    return true;
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
  if (normalized === 'orden lista' || normalized === 'completada' || normalized === 'lista') return 'Orden Lista';
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
       WHERE ei.operario = $1
         AND ei.fecha <= $2
       ORDER BY ei.fecha DESC, ei.hora DESC, ei.id DESC
       LIMIT 10`,
      [produccion.responsable || '', produccion.fecha]
    );

    produccion.insumos_gastados = insumosResult.rows;
    produccion.entregas_insumos_relacionadas = insumosResult.rows;

    return produccion;
  },
  create: async (data) => {
    validateProduccionPayload(data);
    const estadoInicial = normalizeProduccionStatus(data.estado) || 'Orden Recibida';
    const result = await pool.query(
      'INSERT INTO produccion (numero_produccion, producto_id, pedido_id, cantidad, fecha, responsable, tiempo_preparacion_minutos, estado, notes, insumos_gastados) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [
        data.numero_produccion,
        data.producto_id,
        data.pedido_id ?? null,
        data.cantidad,
        data.fecha,
        data.responsable,
        data.tiempo_preparacion_minutos ?? 0,
        estadoInicial,
        data.notes,
        Array.isArray(data.insumos_gastados) ? JSON.stringify(data.insumos_gastados) : '[]'
      ]
    );
    return result.rows[0].id;
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

const CRITICAL_PERMISSION_MODULES = ['Configuración', 'Usuarios', 'Ventas'];
const CLIENT_ROLE_NAME = 'cliente';
const CLIENT_ALLOWED_PERMISSIONS = ['Ver Mis Pedidos'];

const PERMISSION_MODULE_MAP = {
  'Ver Roles': 'Configuración',
  'Asignar Permisos': 'Configuración',
  'Ver Usuarios': 'Usuarios',
  'Crear Usuarios': 'Usuarios',
  'Editar Usuarios': 'Usuarios',
  'Eliminar Usuarios': 'Usuarios',
  'Ver Clientes': 'Ventas',
  'Crear Clientes': 'Ventas',
  'Editar Clientes': 'Ventas',
  'Ver Ventas': 'Ventas',
  'Registrar Ventas': 'Ventas',
  'Anular Ventas': 'Ventas',
  'Ver Abonos': 'Ventas',
  'Registrar Abonos': 'Ventas',
  'Ver Pedidos': 'Ventas',
  'Crear Pedidos': 'Ventas',
  'Ver Domicilios': 'Ventas',
  'Gestionar Domicilios': 'Ventas',
};

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

const validatePermissionsPayload = ({ currentPermissions = [], nextPermissions, roleName }) => {
  if (!Array.isArray(nextPermissions)) return null;

  if (isClientRoleName(roleName)) {
    const hasOnlyAllowedPermissions =
      nextPermissions.length === CLIENT_ALLOWED_PERMISSIONS.length &&
      nextPermissions.every((permission) => CLIENT_ALLOWED_PERMISSIONS.includes(permission));

    if (!hasOnlyAllowedPermissions) {
      const error = new Error('El rol Cliente solo puede tener el permiso "Ver Mis Pedidos"');
      error.statusCode = 400;
      error.details = {
        reason: 'cliente_permissions_only',
        allowed: CLIENT_ALLOWED_PERMISSIONS,
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

  for (const moduleName of CRITICAL_PERMISSION_MODULES) {
    const hadBefore = currentPermissions.some(
      (permission) => PERMISSION_MODULE_MAP[permission] === moduleName
    );
    const hasAfter = nextPermissions.some(
      (permission) => PERMISSION_MODULE_MAP[permission] === moduleName
    );

    if (hadBefore && !hasAfter) {
      const error = new Error(
        `No se puede eliminar el ultimo permiso del modulo critico ${moduleName}`
      );
      error.statusCode = 400;
      error.details = {
        reason: 'critical_module_without_access',
        module: moduleName,
      };
      return error;
    }
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
    const result = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    return result.rows[0];
  },
  getByNombre: async (nombre) => {
    const result = await pool.query('SELECT * FROM roles WHERE nombre = $1', [nombre]);
    return result.rows[0];
  },
  create: async (data, options = {}) => {
    let permisosNormalizados = normalizePermissions(data.permisos || []);
    if (isClientRoleName(data.nombre)) {
      permisosNormalizados = [...CLIENT_ALLOWED_PERMISSIONS];
    }

    const permissionsError = validatePermissionsPayload({
      currentPermissions: [],
      nextPermissions: permisosNormalizados,
      roleName: data.nombre,
    });

    if (permissionsError) throw permissionsError;

    const result = await pool.query(
      'INSERT INTO roles (nombre, descripcion, permisos, estado) VALUES ($1, $2, $3, $4) RETURNING id',
      [data.nombre, data.descripcion, permisosNormalizados, data.estado || 'Activo']
    );
    const id = result.rows[0].id;

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
    const targetRoleName = data.nombre ?? currentRole?.nombre;

    let nextPermissions = data.permisos;
    if (Array.isArray(data.permisos)) {
      const currentPermissions = normalizePermissions(currentRole?.permisos || []);
      nextPermissions = normalizePermissions(data.permisos);

      if (isClientRoleName(targetRoleName)) {
        nextPermissions = [...CLIENT_ALLOWED_PERMISSIONS];
      }

      const permissionsError = validatePermissionsPayload({
        currentPermissions,
        nextPermissions,
        roleName: targetRoleName,
      });

      if (permissionsError) throw permissionsError;
    } else if (isClientRoleName(targetRoleName)) {
      nextPermissions = [...CLIENT_ALLOWED_PERMISSIONS];

      const permissionsError = validatePermissionsPayload({
        currentPermissions: normalizePermissions(currentRole?.permisos || []),
        nextPermissions,
        roleName: targetRoleName,
      });

      if (permissionsError) throw permissionsError;
    }

    if (data.estado === 'Inactivo') {
      const assignedUsersResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM usuarios WHERE rol_id = $1',
        [id]
      );
      const assignedUsers = Number(assignedUsersResult.rows[0]?.total || 0);

      if (assignedUsers > 0) {
        const error = new Error('No se puede desactivar el rol porque tiene usuarios asignados');
        error.statusCode = 400;
        error.details = { assignedUsers };
        throw error;
      }
    }

    await pool.query(
      `UPDATE roles
       SET nombre = COALESCE($1, nombre),
           descripcion = COALESCE($2, descripcion),
           permisos = COALESCE($3, permisos),
           estado = COALESCE($4, estado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [data.nombre, data.descripcion, nextPermissions, data.estado, id]
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

    const currentPermissions = normalizePermissions(currentRole.permisos || []);
    let nextPermissions = normalizePermissions(permisos || []);
    if (isClientRoleName(currentRole.nombre)) {
      nextPermissions = [...CLIENT_ALLOWED_PERMISSIONS];
    }
    const permissionsError = validatePermissionsPayload({
      currentPermissions,
      nextPermissions,
      roleName: currentRole.nombre,
    });

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
      activeSessions = await getActiveUserSessionCount(id);
      if (activeSessions > 0 && !force) {
        const error = new Error('No se puede desactivar un usuario con sesion activa');
        error.statusCode = 409;
        error.details = { activeSessions };
        throw error;
      }
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

    const performPhysicalDelete = options.mode === 'physical';
    const omitValidations = options.omit_validaciones === true || options.omit_validaciones === 'true';
    const impact = await getUserDeletionImpact(id);

    if (!impact) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (!omitValidations && impact.blockers.length > 0) {
      const error = new Error('No se puede eliminar el usuario porque tiene relaciones activas o transacciones recientes');
      error.statusCode = 409;
      error.details = { blockers: impact.blockers };
      throw error;
    }

    if (performPhysicalDelete && !impact.canPhysicalDelete && !omitValidations) {
      const error = new Error('La eliminacion fisica solo se permite despues de 90 dias inactivo');
      error.statusCode = 409;
      error.details = { daysInactive: impact.daysInactive };
      throw error;
    }

    if (performPhysicalDelete) {
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
          omitValidations,
        },
      });

      return { mode: 'physical' };
    }

    if (String(currentUser.estado || '').toLowerCase() === 'eliminado') {
      const error = new Error('El usuario ya fue eliminado');
      error.statusCode = 409;
      error.details = { reason: 'already_deleted' };
      throw error;
    }

    await pool.query(
      `UPDATE usuarios
       SET estado = 'Eliminado',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    const updatedUser = await Usuarios.getById(id);
    await registerUserAudit({
      usuarioId: Number(id),
      accion: 'DELETE',
      actorId: options.actor_id ?? null,
      cambios: {
        before: toUserSnapshot(currentUser),
        after: toUserSnapshot(updatedUser),
        reason,
        logicalDelete: true,
        omitValidations,
      },
    });
    return { mode: 'logical' };
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
  Roles,
  Usuarios
};

