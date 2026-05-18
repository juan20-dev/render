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
const ClienteCuenta = require('../models/ventas/cliente-cuenta');
const { normalizeClientePayload } = require('./normalizador-http');
const { isClienteUser, assertOwnClienteParam } = require('../utils/selfServiceAccess');
const { generateTempPassword, isStrongPassword } = require('../utils/credentials');
const { sendTemporaryPasswordEmail, sendWelcomeEmail } = require('../services/email.service');
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

      const tempPassword = useManualPassword ? null : generateTempPassword();
      const passwordToHash = useManualPassword ? rawPassword : tempPassword;
      const passwordHash = await bcrypt.hash(passwordToHash, 10);
      const welcomePassword = useManualPassword ? rawPassword : tempPassword;

      let clienteId;
      let usuarioId;
      try {
        const created = await ClienteCuenta.createWithUsuario({
          nombre: normalizedNombre,
          apellido: normalizedApellido,
          tipoDocumento,
          documento: normalizedDocumento,
          telefono: normalizedTelefono,
          email: normalizedEmail,
          direccion: normalizedDireccion,
          estado,
          foto_url: data.foto_url || null,
          passwordHash,
          setPasswordEmailExpiry: Boolean(welcomePassword),
        });
        clienteId = created.clienteId;
        usuarioId = created.usuarioId;
      } catch (error) {
        const mapped = ClienteCuenta.mapPgUniqueError(error);
        if (mapped) {
          return res.status(mapped.statusCode).json({ success: false, message: mapped.message });
        }
        if (error?.statusCode) {
          return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        return res.status(500).json({
          success: false,
          message: 'No se pudo crear el cliente. Intentalo nuevamente.',
        });
      }

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

      const currentCliente = await models.Clientes.getById(clienteId);
      if (!currentCliente) {
        return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      }

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

      let syncResult;
      try {
        syncResult = await ClienteCuenta.updateWithUsuario(clienteId, {
          nombre: nextNombre,
          apellido: nextApellido,
          tipoDocumento: nextTipoDocumento,
          documento: nextDocumento,
          telefono: nextTelefono,
          email: nextEmail,
          direccion: nextDireccion,
          estado: nextEstado,
          foto_url: nextFotoUrl,
        });
      } catch (error) {
        const mapped = ClienteCuenta.mapPgUniqueError(error);
        if (mapped) {
          return res.status(mapped.statusCode).json({ success: false, message: mapped.message });
        }
        if (error?.statusCode) {
          return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        return res.status(500).json({
          success: false,
          message: 'No se pudo actualizar el cliente. Intentalo nuevamente.',
        });
      }

      void models.Auditoria.registerClienteAudit({
        clienteId: clienteId,
        accion: 'UPDATE',
        usuarioId: req.user?.id || null,
        cambios: {
          before: syncResult.before,
          after: syncResult.after,
          usuario_sincronizado: syncResult.usuarioId || null,
        },
      });

      return res.json({
        success: true,
        message: syncResult.usuarioId
          ? 'Cliente y usuario actualizados exitosamente'
          : 'Cliente actualizado exitosamente',
      });
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

    try {
      const deleted = await ClienteCuenta.deleteWithCascade(clienteId);

      void models.Auditoria.registerClienteAudit({
        clienteId: clienteId,
        accion: 'DELETE',
        usuarioId: req.user?.id || null,
        cambios: {
          before: deleted.before,
          after: null,
          usuario_eliminado: deleted.usuarioId || null,
        },
      });

      return res.json({
        success: true,
        message: deleted.usuarioId
          ? 'Cliente y usuario eliminados exitosamente'
          : 'Cliente eliminado exitosamente',
      });
    } catch (error) {
      if (error?.statusCode === 404) {
        return res.status(404).json({ success: false, message: error.message });
      }

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
    }
  }
};

