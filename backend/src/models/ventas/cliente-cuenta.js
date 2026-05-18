/**
 * Operaciones transaccionales cliente + usuario (alta, registro publico, actualizacion, borrado).
 */
const pool = require('../../../db');
const Usuarios = require('../usuarios/usuarios');

const conflictError = (message) => {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
};

const notFoundError = (message = 'Cliente no encontrado') => {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
};

const badRequestError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const serverError = (message) => {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
};

const mapPgUniqueError = (error) => {
  if (error?.code !== '23505') return null;
  const constraint = String(error?.constraint || '').toLowerCase();
  if (constraint.includes('documento')) {
    return { statusCode: 409, message: 'El documento ya esta registrado.' };
  }
  if (constraint.includes('email')) {
    return { statusCode: 409, message: 'El correo ya esta registrado.' };
  }
  if (constraint.includes('telefono')) {
    return { statusCode: 409, message: 'El telefono ya esta registrado.' };
  }
  if (constraint.includes('clientes_usuario_id')) {
    return { statusCode: 409, message: 'Este cliente ya esta vinculado a un usuario.' };
  }
  return {
    statusCode: 409,
    message: 'El correo, documento o telefono ya se encuentra registrado.',
  };
};

const mapRegisterPgUniqueError = (error) => {
  if (error?.code !== '23505') return null;
  const constraint = String(error?.constraint || '').toLowerCase();
  if (constraint.includes('usuarios_documento') || constraint.includes('documento')) {
    return { statusCode: 409, message: 'El documento ya se encuentra registrado.' };
  }
  if (constraint.includes('usuarios_email') || constraint.includes('clientes_email') || constraint.includes('email')) {
    return { statusCode: 409, message: 'El correo ya se encuentra registrado.' };
  }
  if (constraint.includes('clientes_usuario_id')) {
    return { statusCode: 409, message: 'Este cliente ya está vinculado a un usuario.' };
  }
  return { statusCode: 409, message: 'El correo o documento ya se encuentra registrado.' };
};

const runTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const getClienteRoleId = async (client) => {
  const clienteRoleResult = await client.query('SELECT id FROM roles WHERE nombre = $1 LIMIT 1', ['Cliente']);
  if (clienteRoleResult.rows.length === 0) {
    throw serverError('No existe el rol Cliente en la base de datos');
  }
  return clienteRoleResult.rows[0].id;
};

const assertNoRegistrationConflicts = async (
  client,
  { email, documento, telefono, checkTelefono = true, requireUnlinkedLegacy = false }
) => {
  const emailInUsuarios = await client.query(
    'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  if (emailInUsuarios.rows.length > 0) {
    throw conflictError('El correo ya esta registrado');
  }

  const documentoInUsuarios = await client.query('SELECT id FROM usuarios WHERE documento = $1 LIMIT 1', [
    documento,
  ]);
  if (documentoInUsuarios.rows.length > 0) {
    throw conflictError('El documento ya esta registrado');
  }

  if (checkTelefono && telefono) {
    const telefonoInUsuarios = await client.query('SELECT id FROM usuarios WHERE telefono = $1 LIMIT 1', [
      telefono,
    ]);
    if (telefonoInUsuarios.rows.length > 0) {
      throw conflictError('El telefono ya esta registrado');
    }
  }

  const emailInClientes = await client.query(
    'SELECT id, usuario_id FROM clientes WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  const documentoInClientes = await client.query(
    'SELECT id, usuario_id FROM clientes WHERE documento = $1 LIMIT 1',
    [documento]
  );
  const clienteByEmail = emailInClientes.rows[0] || null;
  const clienteByDocumento = documentoInClientes.rows[0] || null;

  if (requireUnlinkedLegacy) {
    if (clienteByEmail?.usuario_id || clienteByDocumento?.usuario_id) {
      throw conflictError('El cliente ya esta vinculado a un usuario existente.');
    }
    if (
      clienteByEmail &&
      clienteByDocumento &&
      Number(clienteByEmail.id) !== Number(clienteByDocumento.id)
    ) {
      throw conflictError(
        'El correo y el documento ya existen en clientes pero corresponden a registros distintos.'
      );
    }
  } else {
    if (clienteByEmail && clienteByDocumento && Number(clienteByEmail.id) !== Number(clienteByDocumento.id)) {
      throw conflictError(
        'El correo y el documento ya existen en clientes, pero corresponden a registros distintos.'
      );
    }
    if (clienteByEmail?.usuario_id) {
      throw conflictError('El correo ya está asociado a una cuenta existente.');
    }
    if (clienteByDocumento?.usuario_id) {
      throw conflictError('El documento ya está asociado a una cuenta existente.');
    }
  }

  return { clienteByEmail, clienteByDocumento };
};

const upsertClienteForNewUsuario = async (
  client,
  {
    usuarioId,
    clienteByEmail,
    clienteByDocumento,
    nombre,
    apellido,
    tipoDocumento,
    documento,
    telefono,
    email,
    direccion,
    foto_url,
    estado,
    useRegisterUpsert = false,
  }
) => {
  const existingClienteForNewUser = await client.query(
    'SELECT id FROM clientes WHERE usuario_id = $1 LIMIT 1',
    [usuarioId]
  );

  if (existingClienteForNewUser.rows.length > 0) {
    const updated = await client.query(
      `UPDATE clientes
          SET nombre = $1,
              apellido = $2,
              tipo_documento = $3,
              documento = $4,
              telefono = $5,
              email = $6,
              direccion = $7,
              foto_url = COALESCE($8, foto_url),
              estado = $9,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
        RETURNING id`,
      [
        nombre,
        apellido,
        tipoDocumento,
        documento,
        telefono,
        email,
        direccion,
        foto_url || null,
        estado,
        existingClienteForNewUser.rows[0].id,
      ]
    );
    return updated.rows[0].id;
  }

  if (clienteByEmail || clienteByDocumento) {
    const targetId = (clienteByEmail || clienteByDocumento).id;
    const updated = await client.query(
      `UPDATE clientes
          SET usuario_id = $1,
              nombre = $2,
              apellido = $3,
              tipo_documento = $4,
              documento = $5,
              telefono = $6,
              email = $7,
              direccion = $8,
              foto_url = COALESCE($9, foto_url),
              estado = $10,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
        RETURNING id`,
      [
        usuarioId,
        nombre,
        apellido,
        tipoDocumento,
        documento,
        telefono,
        email,
        direccion,
        foto_url || null,
        estado,
        targetId,
      ]
    );
    return updated.rows[0].id;
  }

  if (useRegisterUpsert) {
    const inserted = await client.query(
      `INSERT INTO clientes
         (usuario_id, nombre, apellido, tipo_documento, documento, telefono, email, direccion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (documento) DO UPDATE
       SET usuario_id = EXCLUDED.usuario_id,
           nombre = EXCLUDED.nombre,
           apellido = EXCLUDED.apellido,
           tipo_documento = EXCLUDED.tipo_documento,
           telefono = EXCLUDED.telefono,
           email = EXCLUDED.email,
           direccion = EXCLUDED.direccion,
           estado = EXCLUDED.estado,
           updated_at = CURRENT_TIMESTAMP
       WHERE clientes.usuario_id IS NULL
       RETURNING id`,
      [usuarioId, nombre, apellido, tipoDocumento, documento, telefono, email, direccion, estado]
    );
    if (!inserted.rows.length) {
      throw conflictError('El documento ya está asociado a una cuenta existente.');
    }
    return inserted.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO clientes
       (usuario_id, nombre, apellido, tipo_documento, documento, telefono, email, direccion, foto_url, estado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [usuarioId, nombre, apellido, tipoDocumento, documento, telefono, email, direccion, foto_url || null, estado]
  );
  return inserted.rows[0].id;
};

const createWithUsuario = async ({
  nombre,
  apellido,
  tipoDocumento,
  documento,
  telefono,
  email,
  direccion,
  estado,
  foto_url,
  passwordHash,
  setPasswordEmailExpiry = false,
}) =>
  runTransaction(async (client) => {
    const { clienteByEmail, clienteByDocumento } = await assertNoRegistrationConflicts(client, {
      email,
      documento,
      telefono,
      checkTelefono: true,
      requireUnlinkedLegacy: true,
    });

    const clienteRoleId = await getClienteRoleId(client);

    const userResult = await client.query(
      `INSERT INTO usuarios
         (nombre, apellido, tipo_documento, documento, direccion, email, telefono, password_hash, rol_id, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [nombre, apellido, tipoDocumento, documento, direccion, email, telefono, passwordHash, clienteRoleId, estado]
    );
    const usuarioId = userResult.rows[0].id;

    const clienteId = await upsertClienteForNewUsuario(client, {
      usuarioId,
      clienteByEmail,
      clienteByDocumento,
      nombre,
      apellido,
      tipoDocumento,
      documento,
      telefono,
      email,
      direccion,
      foto_url,
      estado,
    });

    if (setPasswordEmailExpiry) {
      await Usuarios.ensurePasswordEmailExpiryColumn();
      await client.query(
        `UPDATE usuarios SET password_email_expires_at = CURRENT_TIMESTAMP + INTERVAL '2 hours' WHERE id = $1`,
        [usuarioId]
      );
    }

    return { clienteId, usuarioId };
  });

const registerWithUsuario = async ({
  nombre,
  apellido,
  tipoDocumento,
  documento,
  telefono,
  email,
  direccion,
  estado,
  passwordHash,
}) =>
  runTransaction(async (client) => {
    const { clienteByEmail, clienteByDocumento } = await assertNoRegistrationConflicts(client, {
      email,
      documento,
      telefono,
      checkTelefono: false,
      requireUnlinkedLegacy: false,
    });

    const clienteRoleId = await getClienteRoleId(client);

    const userResult = await client.query(
      `INSERT INTO usuarios
         (nombre, apellido, tipo_documento, documento, direccion, email, telefono, password_hash, rol_id, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Activo')
       RETURNING id`,
      [nombre, apellido, tipoDocumento, documento, direccion, email, telefono, passwordHash, clienteRoleId]
    );
    const usuarioId = userResult.rows[0].id;

    let clienteId;
    if (clienteByEmail && !clienteByDocumento) {
      const updated = await client.query(
        `UPDATE clientes
            SET usuario_id = $1,
                nombre = $2,
                apellido = $3,
                tipo_documento = $4,
                documento = $5,
                telefono = $6,
                email = $7,
                direccion = $8,
                estado = $9,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $10
          RETURNING id`,
        [
          usuarioId,
          nombre,
          apellido,
          tipoDocumento,
          documento,
          telefono,
          email,
          direccion,
          estado,
          clienteByEmail.id,
        ]
      );
      clienteId = updated.rows[0].id;
    } else {
      clienteId = await upsertClienteForNewUsuario(client, {
        usuarioId,
        clienteByEmail,
        clienteByDocumento,
        nombre,
        apellido,
        tipoDocumento,
        documento,
        telefono,
        email,
        direccion,
        foto_url: null,
        estado,
        useRegisterUpsert: true,
      });
    }

    return { clienteId, usuarioId };
  });

const updateWithUsuario = async (clienteId, fields) =>
  runTransaction(async (client) => {
    const currentClienteResult = await client.query('SELECT * FROM clientes WHERE id = $1 LIMIT 1', [clienteId]);
    if (currentClienteResult.rows.length === 0) {
      throw notFoundError();
    }
    const currentCliente = currentClienteResult.rows[0];
    const usuarioId = currentCliente.usuario_id || null;

    const {
      nombre: nextNombre,
      apellido: nextApellido,
      tipoDocumento: nextTipoDocumento,
      documento: nextDocumento,
      telefono: nextTelefono,
      email: nextEmail,
      direccion: nextDireccion,
      estado: nextEstado,
      foto_url: nextFotoUrl,
    } = fields;

    const nextTelDigits = nextTelefono ? String(nextTelefono).replace(/\D/g, '') : '';
    if (nextTelDigits && nextTelDigits.length !== 10) {
      throw badRequestError('Telefono invalido. Debe tener exactamente 10 digitos.');
    }

    const emailInUsuariosConflict = await client.query(
      `SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1`,
      [nextEmail, usuarioId || 0]
    );
    if (emailInUsuariosConflict.rows.length > 0) {
      throw conflictError('El correo ya esta registrado por otro usuario');
    }

    const emailInClientesConflict = await client.query(
      `SELECT id FROM clientes WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1`,
      [nextEmail, clienteId]
    );
    if (emailInClientesConflict.rows.length > 0) {
      throw conflictError('El correo ya esta registrado por otro cliente');
    }

    const documentoInUsuariosConflict = await client.query(
      `SELECT id FROM usuarios WHERE documento = $1 AND id <> $2 LIMIT 1`,
      [nextDocumento, usuarioId || 0]
    );
    if (documentoInUsuariosConflict.rows.length > 0) {
      throw conflictError('El documento ya esta registrado por otro usuario');
    }

    const documentoInClientesConflict = await client.query(
      `SELECT id FROM clientes WHERE documento = $1 AND id <> $2 LIMIT 1`,
      [nextDocumento, clienteId]
    );
    if (documentoInClientesConflict.rows.length > 0) {
      throw conflictError('El documento ya esta registrado por otro cliente');
    }

    if (nextTelefono) {
      const telefonoInUsuariosConflict = await client.query(
        `SELECT id FROM usuarios WHERE telefono = $1 AND id <> $2 LIMIT 1`,
        [nextTelefono, usuarioId || 0]
      );
      if (telefonoInUsuariosConflict.rows.length > 0) {
        throw conflictError('El telefono ya esta registrado por otro usuario');
      }
    }

    await client.query(
      `UPDATE clientes
          SET nombre = $1,
              apellido = $2,
              tipo_documento = $3,
              documento = $4,
              telefono = $5,
              email = $6,
              direccion = $7,
              estado = $8,
              foto_url = COALESCE($9, foto_url),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $10`,
      [
        nextNombre,
        nextApellido,
        nextTipoDocumento,
        nextDocumento,
        nextTelefono,
        nextEmail,
        nextDireccion,
        nextEstado,
        nextFotoUrl,
        clienteId,
      ]
    );

    if (usuarioId) {
      await client.query(
        `UPDATE usuarios
            SET nombre = $1,
                apellido = $2,
                tipo_documento = $3,
                documento = $4,
                telefono = $5,
                email = $6,
                direccion = $7,
                estado = $8,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $9`,
        [
          nextNombre,
          nextApellido,
          nextTipoDocumento,
          nextDocumento,
          nextTelefono,
          nextEmail,
          nextDireccion,
          nextEstado,
          usuarioId,
        ]
      );
    }

    return {
      usuarioId,
      before: {
        nombre: currentCliente.nombre,
        apellido: currentCliente.apellido,
        tipo_documento: currentCliente.tipo_documento,
        documento: currentCliente.documento,
        telefono: currentCliente.telefono,
        email: currentCliente.email,
        direccion: currentCliente.direccion,
        estado: currentCliente.estado,
      },
      after: {
        nombre: nextNombre,
        apellido: nextApellido,
        tipo_documento: nextTipoDocumento,
        documento: nextDocumento,
        telefono: nextTelefono,
        email: nextEmail,
        direccion: nextDireccion,
        estado: nextEstado,
      },
    };
  });

const deleteWithCascade = async (clienteId) =>
  runTransaction(async (client) => {
    const currentResult = await client.query('SELECT id, usuario_id FROM clientes WHERE id = $1 LIMIT 1', [
      clienteId,
    ]);
    if (currentResult.rows.length === 0) {
      throw notFoundError();
    }

    const usuarioId = currentResult.rows[0].usuario_id || null;

    const beforeSnapshot = await client.query(
      'SELECT id, nombre, apellido, email, documento, estado, usuario_id FROM clientes WHERE id = $1 LIMIT 1',
      [clienteId]
    );

    await client.query('DELETE FROM abonos WHERE cliente_id = $1', [clienteId]);
    await client.query('DELETE FROM domicilios WHERE cliente_id = $1', [clienteId]);
    await client.query('DELETE FROM ventas WHERE cliente_id = $1', [clienteId]);
    await client.query('DELETE FROM pedidos WHERE cliente_id = $1', [clienteId]);
    await client.query('DELETE FROM clientes WHERE id = $1', [clienteId]);

    if (usuarioId) {
      await client.query('DELETE FROM usuarios_sesiones WHERE usuario_id = $1', [usuarioId]);
      await client.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
    }

    return { usuarioId, before: beforeSnapshot.rows[0] || null };
  });

module.exports = {
  mapPgUniqueError,
  mapRegisterPgUniqueError,
  createWithUsuario,
  registerWithUsuario,
  updateWithUsuario,
  deleteWithCascade,
};
