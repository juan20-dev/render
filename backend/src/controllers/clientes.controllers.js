// Rewire: el modelo Clientes, Auditoria viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Clientes: require('../models/ventas/clientes'),
  Auditoria: require('../models/shared').Auditoria,
};
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../db');
const { normalizeClientePayload } = require('./normalizador-http');
const { isClienteUser, assertOwnClienteParam } = require('../utils/selfServiceAccess');
const { generateTempPassword, isStrongPassword } = require('../utils/credentials');
const { sendTemporaryPasswordEmail, sendWelcomeEmail } = require('../services/email.service');
const Usuarios = require('../models/usuarios/usuarios');

module.exports = {
  getAll: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const clientes = await models.Clientes.getAll();
      res.json({ success: true, data: clientes });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.id);
      if (denied) return denied;

      const cliente = await models.Clientes.getById(req.params.id);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByDocumento: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const cliente = await models.Clientes.getByDocumento(req.params.documento);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByEmail: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const cliente = await models.Clientes.getByEmail(req.params.email);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByUsuarioId: async (req, res) => {
    try {
      if (isClienteUser(req) && Number(req.params.usuarioId) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const cliente = await models.Clientes.getOrCreateByUsuarioId(req.params.usuarioId);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado para el usuario indicado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }

      const normalized = normalizeClientePayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const data = normalized.data;
      const normalizedNombre = String(data.nombre || '').trim();
      const normalizedApellido = String(data.apellido || '').trim();
      const normalizedDocumento = String(data.documento || '').trim();
      const normalizedTelefono = String(data.telefono || '').replace(/\D/g, '');
      const normalizedEmail = String(data.email || '').trim().toLowerCase();
      const normalizedDireccion = String(data.direccion || '').trim();
      const tipoDocumento = data.tipoDocumento;
      const estado = data.estado === 'Inactivo' ? 'Inactivo' : 'Activo';

      const requiredFields = [
        { value: normalizedNombre, label: 'Nombre' },
        { value: normalizedApellido, label: 'Apellido' },
        { value: tipoDocumento, label: 'Tipo de Documento' },
        { value: normalizedDocumento, label: 'Numero de Documento' },
        { value: normalizedTelefono, label: 'Telefono' },
        { value: normalizedEmail, label: 'Correo Electronico' },
        { value: normalizedDireccion, label: 'Direccion' },
      ];
      const missing = requiredFields.find((field) => !field.value || String(field.value).trim() === '');
      if (missing) {
        return res.status(400).json({
          success: false,
          message: `El campo "${missing.label}" es obligatorio.`,
        });
      }

      const rawPassword = typeof data.password === 'string' ? data.password.trim() : '';
      const useManualPassword = Boolean(rawPassword);
      if (useManualPassword && !isStrongPassword(rawPassword)) {
        return res.status(400).json({
          success: false,
          message:
            'La contrasena debe tener minimo 8 caracteres, una mayuscula, una minuscula, un numero y un caracter especial',
        });
      }

      const client = await pool.connect();
      try {
      await client.query('BEGIN');

      const emailInUsuarios = await client.query(
        'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [normalizedEmail]
      );
      if (emailInUsuarios.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El correo ya esta registrado' });
      }

      const documentoInUsuarios = await client.query(
        'SELECT id FROM usuarios WHERE documento = $1 LIMIT 1',
        [normalizedDocumento]
      );
      if (documentoInUsuarios.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El documento ya esta registrado' });
      }

      const telefonoInUsuarios = await client.query(
        'SELECT id FROM usuarios WHERE telefono = $1 LIMIT 1',
        [normalizedTelefono]
      );
      if (telefonoInUsuarios.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El telefono ya esta registrado' });
      }

      const emailInClientes = await client.query(
        'SELECT id, usuario_id FROM clientes WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [normalizedEmail]
      );
      const documentoInClientes = await client.query(
        'SELECT id, usuario_id FROM clientes WHERE documento = $1 LIMIT 1',
        [normalizedDocumento]
      );
      const clienteByEmail = emailInClientes.rows[0] || null;
      const clienteByDocumento = documentoInClientes.rows[0] || null;

      if (clienteByEmail?.usuario_id || clienteByDocumento?.usuario_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El cliente ya esta vinculado a un usuario existente.',
        });
      }

      if (
        clienteByEmail &&
        clienteByDocumento &&
        Number(clienteByEmail.id) !== Number(clienteByDocumento.id)
      ) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message:
            'El correo y el documento ya existen en clientes pero corresponden a registros distintos.',
        });
      }

      const clienteRoleResult = await client.query(
        'SELECT id FROM roles WHERE nombre = $1 LIMIT 1',
        ['Cliente']
      );
      if (clienteRoleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res
          .status(500)
          .json({ success: false, message: 'No existe el rol Cliente en la base de datos' });
      }
      const clienteRoleId = clienteRoleResult.rows[0].id;

      const tempPassword = useManualPassword ? null : generateTempPassword();
      const passwordToHash = useManualPassword ? rawPassword : tempPassword;
      const passwordHash = await bcrypt.hash(passwordToHash, 10);

      const userResult = await client.query(
        `INSERT INTO usuarios
           (nombre, apellido, tipo_documento, documento, direccion, email, telefono, password_hash, rol_id, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          normalizedNombre,
          normalizedApellido,
          tipoDocumento,
          normalizedDocumento,
          normalizedDireccion,
          normalizedEmail,
          normalizedTelefono,
          passwordHash,
          clienteRoleId,
          estado,
        ]
      );
      const usuarioId = userResult.rows[0].id;

      let clienteId;
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
            normalizedNombre,
            normalizedApellido,
            tipoDocumento,
            normalizedDocumento,
            normalizedTelefono,
            normalizedEmail,
            normalizedDireccion,
            data.foto_url || null,
            estado,
            existingClienteForNewUser.rows[0].id,
          ]
        );
        clienteId = updated.rows[0].id;
      } else if (clienteByEmail || clienteByDocumento) {
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
            normalizedNombre,
            normalizedApellido,
            tipoDocumento,
            normalizedDocumento,
            normalizedTelefono,
            normalizedEmail,
            normalizedDireccion,
            data.foto_url || null,
            estado,
            targetId,
          ]
        );
        clienteId = updated.rows[0].id;
      } else {
        const inserted = await client.query(
          `INSERT INTO clientes
             (usuario_id, nombre, apellido, tipo_documento, documento, telefono, email, direccion, foto_url, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            usuarioId,
            normalizedNombre,
            normalizedApellido,
            tipoDocumento,
            normalizedDocumento,
            normalizedTelefono,
            normalizedEmail,
            normalizedDireccion,
            data.foto_url || null,
            estado,
          ]
        );
        clienteId = inserted.rows[0].id;
      }

      const welcomePassword = useManualPassword ? rawPassword : tempPassword;
      if (welcomePassword) {
        await Usuarios.ensurePasswordEmailExpiryColumn();
        await client.query(
          `UPDATE usuarios SET password_email_expires_at = CURRENT_TIMESTAMP + INTERVAL '2 hours' WHERE id = $1`,
          [usuarioId]
        );
      }

      await client.query('COMMIT');

      void models.Auditoria.registerClienteAudit({
        clienteId: clienteId,
        accion: 'CREATE',
        usuarioId: req.user?.id || null,
        cambios: {
          before: null,
          after: {
            usuario_id: usuarioId,
            nombre: normalizedNombre,
            apellido: normalizedApellido,
            tipo_documento: tipoDocumento,
            documento: normalizedDocumento,
            email: normalizedEmail,
            telefono: normalizedTelefono,
            estado,
          },
        },
      });

      // Correo de bienvenida con credenciales (correo + contrasena) al cliente
      // recien creado desde Gestion Clientes. La contrasena puede haber sido
      // generada de forma segura por el backend o haber sido digitada por el
      // administrador.
      if (welcomePassword) {
        void sendWelcomeEmail({
          to: normalizedEmail,
          name: `${normalizedNombre} ${normalizedApellido}`.trim(),
          email: normalizedEmail,
          password: welcomePassword,
          emailCredentialExpiresHours: 2,
        }).catch((error) => {
          console.error('Error enviando correo de bienvenida al cliente:', error);
        });
      }

      return res.status(201).json({
        success: true,
        id: clienteId,
        data: {
          cliente_id: clienteId,
          usuario_id: usuarioId,
        },
        message: useManualPassword
          ? 'Cliente creado exitosamente. Se envio un correo de bienvenida con las credenciales al correo registrado.'
          : 'Cliente creado exitosamente. Se envio un correo de bienvenida con la contrasena segura al correo registrado.',
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});

      if (error?.code === '23505') {
        const constraint = String(error?.constraint || '').toLowerCase();
        if (constraint.includes('documento')) {
          return res.status(409).json({ success: false, message: 'El documento ya esta registrado.' });
        }
        if (constraint.includes('email')) {
          return res.status(409).json({ success: false, message: 'El correo ya esta registrado.' });
        }
        if (constraint.includes('telefono')) {
          return res.status(409).json({ success: false, message: 'El telefono ya esta registrado.' });
        }
        if (constraint.includes('clientes_usuario_id')) {
          return res.status(409).json({ success: false, message: 'Este cliente ya esta vinculado a un usuario.' });
        }
        return res.status(409).json({
          success: false,
          message: 'El correo, documento o telefono ya se encuentra registrado.',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'No se pudo crear el cliente. Intentalo nuevamente.',
      });
    } finally {
      client.release();
    }
    } catch (outerError) {
      return res.status(500).json({
        success: false,
        message: 'Error procesando la solicitud: ' + (outerError?.message || 'Error desconocido'),
      });
    }
  },
  update: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.id);
      if (denied) return denied;

      const normalized = normalizeClientePayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const data = { ...normalized.data };
      if (isClienteUser(req)) {
        delete data.estado;
        delete data.usuario_id;
      }

      const clienteId = Number(req.params.id);

      const client = await pool.connect();
      try {
      await client.query('BEGIN');

      const currentClienteResult = await client.query(
        'SELECT * FROM clientes WHERE id = $1 LIMIT 1',
        [clienteId]
      );
      if (currentClienteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      }
      const currentCliente = currentClienteResult.rows[0];
      const usuarioId = currentCliente.usuario_id || null;

      const nextNombre =
        data.nombre !== undefined ? String(data.nombre || '').trim() : currentCliente.nombre;
      const nextApellido =
        data.apellido !== undefined ? String(data.apellido || '').trim() : currentCliente.apellido;
      const nextTipoDocumento =
        data.tipoDocumento !== undefined ? data.tipoDocumento : currentCliente.tipo_documento;
      const nextDocumento =
        data.documento !== undefined
          ? String(data.documento || '').trim()
          : currentCliente.documento;
      const nextTelefono =
        data.telefono !== undefined
          ? String(data.telefono || '').replace(/\D/g, '')
          : currentCliente.telefono;
      const nextEmail =
        data.email !== undefined
          ? String(data.email || '').trim().toLowerCase()
          : currentCliente.email;
      const nextDireccion =
        data.direccion !== undefined ? String(data.direccion || '').trim() : currentCliente.direccion;
      const nextEstado =
        data.estado !== undefined && (data.estado === 'Activo' || data.estado === 'Inactivo')
          ? data.estado
          : currentCliente.estado;
      const nextFotoUrl = data.foto_url !== undefined ? data.foto_url : null;

      const nextTelDigits = nextTelefono ? String(nextTelefono).replace(/\D/g, '') : '';
      if (nextTelDigits && nextTelDigits.length !== 10) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Telefono invalido. Debe tener exactamente 10 digitos.',
        });
      }

      const emailInUsuariosConflict = await client.query(
        `SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1`,
        [nextEmail, usuarioId || 0]
      );
      if (emailInUsuariosConflict.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El correo ya esta registrado por otro usuario' });
      }

      const emailInClientesConflict = await client.query(
        `SELECT id FROM clientes WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1`,
        [nextEmail, clienteId]
      );
      if (emailInClientesConflict.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El correo ya esta registrado por otro cliente' });
      }

      const documentoInUsuariosConflict = await client.query(
        `SELECT id FROM usuarios WHERE documento = $1 AND id <> $2 LIMIT 1`,
        [nextDocumento, usuarioId || 0]
      );
      if (documentoInUsuariosConflict.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El documento ya esta registrado por otro usuario' });
      }

      const documentoInClientesConflict = await client.query(
        `SELECT id FROM clientes WHERE documento = $1 AND id <> $2 LIMIT 1`,
        [nextDocumento, clienteId]
      );
      if (documentoInClientesConflict.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El documento ya esta registrado por otro cliente' });
      }

      if (nextTelefono) {
        const telefonoInUsuariosConflict = await client.query(
          `SELECT id FROM usuarios WHERE telefono = $1 AND id <> $2 LIMIT 1`,
          [nextTelefono, usuarioId || 0]
        );
        if (telefonoInUsuariosConflict.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, message: 'El telefono ya esta registrado por otro usuario' });
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

      await client.query('COMMIT');

      void models.Auditoria.registerClienteAudit({
        clienteId: clienteId,
        accion: 'UPDATE',
        usuarioId: req.user?.id || null,
        cambios: {
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
          usuario_sincronizado: usuarioId || null,
        },
      });

      return res.json({
        success: true,
        message: usuarioId
          ? 'Cliente y usuario actualizados exitosamente'
          : 'Cliente actualizado exitosamente',
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});

      if (error?.code === '23505') {
        const constraint = String(error?.constraint || '').toLowerCase();
        if (constraint.includes('documento')) {
          return res.status(409).json({ success: false, message: 'El documento ya esta registrado.' });
        }
        if (constraint.includes('email')) {
          return res.status(409).json({ success: false, message: 'El correo ya esta registrado.' });
        }
        if (constraint.includes('telefono')) {
          return res.status(409).json({ success: false, message: 'El telefono ya esta registrado.' });
        }
        return res.status(409).json({
          success: false,
          message: 'El correo, documento o telefono ya esta registrado.',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'No se pudo actualizar el cliente. Intentalo nuevamente.',
      });
    } finally {
      client.release();
    }
    } catch (outerError) {
      return res.status(500).json({
        success: false,
        message: 'Error procesando la solicitud: ' + (outerError?.message || 'Error desconocido'),
      });
    }
  },
  updateStatus: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }

      const estado = typeof req.body?.estado === 'string' ? req.body.estado.trim() : '';
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';

      if (!['Activo', 'Inactivo'].includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado invalido. Valores permitidos: Activo, Inactivo',
        });
      }

      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }

      const updated = await models.Clientes.updateStatus(req.params.id, {
        estado,
        motivo,
        actor_id: req.user?.id || null,
      });
      return res.json({
        success: true,
        message: 'Estado del cliente actualizado correctamente.',
        data: updated,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  uploadProfilePhoto: async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Debes seleccionar una imagen.' });
      }

      const cliente = await models.Clientes.getOrCreateByUsuarioId(req.user.id);
      if (!cliente?.id) {
        return res.status(404).json({ success: false, message: 'No se encontró el perfil de cliente.' });
      }

      const uploadsDir = path.join(__dirname, '../../uploads/perfiles');
      fs.mkdirSync(uploadsDir, { recursive: true });

      const extension = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
      const filename = `cliente_${cliente.id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${extension}`;
      const absolutePath = path.join(uploadsDir, filename);
      const relativeUrl = `/uploads/perfiles/${filename}`;

      fs.writeFileSync(absolutePath, req.file.buffer);

      await models.Clientes.update(cliente.id, { foto_url: relativeUrl });

      return res.json({
        success: true,
        message: 'Foto de perfil actualizada exitosamente.',
        data: {
          foto_url: relativeUrl,
          cliente_id: cliente.id,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'No se pudo actualizar la foto de perfil.' });
    }
  },
  delete: async (req, res) => {
    if (isClienteUser(req)) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ success: false, message: 'ID de cliente invalido' });
    }

    // 1) Bloquear si el cliente tiene trabajo pendiente (pedidos/ventas/domicilios en operacion).
    try {
      const work = await models.Clientes.getPendingWork(clienteId);
      if (work.total > 0) {
        return res.status(409).json({
          success: false,
          message: models.Clientes.buildBloqueoMensaje(work, 'eliminar'),
          details: { dependencias: work },
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          'No se pudieron verificar las dependencias del cliente: ' +
          (error?.message || 'Error desconocido'),
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT id, usuario_id FROM clientes WHERE id = $1 LIMIT 1',
        [clienteId]
      );
      if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      }

      const usuarioId = currentResult.rows[0].usuario_id || null;

      const beforeSnapshot = await client.query(
        'SELECT id, nombre, apellido, email, documento, estado, usuario_id FROM clientes WHERE id = $1 LIMIT 1',
        [clienteId]
      );

      // 2) Borrado en orden seguro respetando RESTRICT: primero hijos, luego cliente, luego usuario.
      // Solo quedaran registros en estados finales tras el chequeo previo.
      await client.query('DELETE FROM abonos WHERE cliente_id = $1', [clienteId]);
      await client.query('DELETE FROM domicilios WHERE cliente_id = $1', [clienteId]);
      await client.query('DELETE FROM ventas WHERE cliente_id = $1', [clienteId]);
      await client.query('DELETE FROM pedidos WHERE cliente_id = $1', [clienteId]);
      await client.query('DELETE FROM clientes WHERE id = $1', [clienteId]);

      if (usuarioId) {
        await client.query('DELETE FROM usuarios_sesiones WHERE usuario_id = $1', [usuarioId]);
        await client.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
      }

      await client.query('COMMIT');

      void models.Auditoria.registerClienteAudit({
        clienteId: clienteId,
        accion: 'DELETE',
        usuarioId: req.user?.id || null,
        cambios: {
          before: beforeSnapshot.rows[0] || null,
          after: null,
          usuario_eliminado: usuarioId || null,
        },
      });

      return res.json({
        success: true,
        message: usuarioId
          ? 'Cliente y usuario eliminados exitosamente'
          : 'Cliente eliminado exitosamente',
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});

      if (error?.code === '23503') {
        // Algun otro registro restringido aparecio en la carrera (auditorias o tablas externas).
        return res.status(409).json({
          success: false,
          message:
            'No se puede eliminar el cliente porque aun existen registros relacionados (' +
            (error?.constraint || error?.detail || 'restriccion de integridad referencial') +
            '). Verifica historial, ventas, pedidos o domicilios antes de continuar.',
        });
      }

      return res.status(500).json({
        success: false,
        message:
          'No se pudo eliminar el cliente: ' +
          (error?.message || error?.code || 'Error desconocido'),
      });
    } finally {
      client.release();
    }
  }
};

