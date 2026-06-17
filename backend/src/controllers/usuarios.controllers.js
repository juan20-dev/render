// Rewire: el modelo Roles, Usuarios viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Roles: require('../models/usuarios/roles'),
  Usuarios: require('../models/usuarios/usuarios'),
};
const bcrypt = require('bcryptjs');
const { normalizeUsuarioPayload } = require('./normalizador-http');
const { generateTempPassword, isStrongPassword } = require('../utils/credentials');
const {
  sendTemporaryPasswordEmail,
  sendEmailChangeNotification,
  sendPasswordChangeNotification,
  sendUserStatusChangeNotification,
  sendAccountDeletedNotification,
  sendWelcomeEmail,
} = require('../services/email.service');
const pool = require('../../db');
const { isClienteUser } = require('../utils/selfServiceAccess');
const { roleGrantsPermission } = require('../models/shared/auditoria');

const getRolePermissions = async (req) => {
  if (!req.user?.rol_id) return [];
  const roleResult = await pool.query('SELECT permisos FROM roles WHERE id = $1', [req.user.rol_id]);
  return Array.isArray(roleResult.rows[0]?.permisos) ? roleResult.rows[0].permisos : [];
};

module.exports = {
  getAll: async (req, res) => {
    try {
      // excludeClientes default true: la lista de "Usuarios" SOLO muestra usuarios
      // operativos del sistema (no clientes). Para incluir clientes pasar exclude_clientes=false.
      const excludeClientesFlag = req.query?.exclude_clientes;
      const excludeClientes =
        excludeClientesFlag === undefined || String(excludeClientesFlag).toLowerCase() === 'true';

      const filters = {
        includeDeleted: String(req.query?.include_deleted ?? 'false') === 'true',
        excludeClientes,
        globalQuery: typeof req.query?.q === 'string' ? req.query.q : '',
        rolId: req.query?.rol_id ? Number(req.query.rol_id) : null,
        estados: typeof req.query?.estados === 'string'
          ? req.query.estados.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
        tiposDocumento: typeof req.query?.tipos_documento === 'string'
          ? req.query.tipos_documento.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
        fechaDesde: typeof req.query?.fecha_desde === 'string' ? req.query.fecha_desde : null,
        fechaHasta: typeof req.query?.fecha_hasta === 'string' ? req.query.fecha_hasta : null,
        limit: req.query?.limit ? Number(req.query.limit) : undefined,
      };

      // Producción / entregas: listar solo productores sin conceder gestión completa de usuarios.
      if (req.user?.rol !== 'Administrador') {
        const permisos = await getRolePermissions(req);
        if (!roleGrantsPermission(permisos, 'Ver Usuarios')) {
          const prodRole = await pool.query(
            `SELECT id FROM roles WHERE LOWER(TRIM(nombre)) = 'productor' LIMIT 1`
          );
          const prodRolId = Number(prodRole.rows[0]?.id);
          if (Number.isFinite(prodRolId) && prodRolId > 0) {
            filters.rolId = prodRolId;
          }
        }
      }

      const usuarios = await models.Usuarios.getAll(filters);
      res.json({ success: true, data: usuarios });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const usuario = await models.Usuarios.getById(req.params.id);
      if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      res.json({ success: true, data: usuario });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByEmail: async (req, res) => {
    try {
      const usuario = await models.Usuarios.getByEmail(req.params.email);
      if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      res.json({ success: true, data: usuario });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByDocumento: async (req, res) => {
    try {
      const usuario = await models.Usuarios.getByDocumento(req.params.documento);
      if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      res.json({ success: true, data: usuario });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByTelefono: async (req, res) => {
    try {
      const telefono = String(req.params.telefono || '').replace(/\D/g, '');
      const usuario = await models.Usuarios.getByTelefono(telefono);
      if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      res.json({ success: true, data: usuario });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getActivityById: async (req, res) => {
    try {
      const usuario = await models.Usuarios.getById(req.params.id);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      const limit = Number(req.query?.limit || 80);
      const activity = await models.Usuarios.getActivityById(req.params.id, limit);
      return res.json({ success: true, data: activity });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getFullDetailById: async (req, res) => {
    try {
      const limit = Number(req.query?.limit || 120);
      const detail = await models.Usuarios.getFullDetailById(req.params.id, { limit });
      if (!detail) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      return res.json({ success: true, data: detail });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getDeleteImpactById: async (req, res) => {
    try {
      const detail = await models.Usuarios.getDeletionImpact(req.params.id);
      if (!detail) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      return res.json({ success: true, data: detail });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const normalized = normalizeUsuarioPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const payload = normalized.data;

      const existingEmail = await models.Usuarios.getByEmail(payload.email);
      if (existingEmail) {
        return res.status(409).json({ success: false, message: 'El correo ya esta registrado' });
      }

      const existingDoc = await models.Usuarios.getByDocumento(payload.documento);
      if (existingDoc) {
        return res.status(409).json({ success: false, message: 'El documento ya esta registrado' });
      }

      if (payload.telefono) {
        const existingPhone = await models.Usuarios.getByTelefono(payload.telefono);
        if (existingPhone) {
          return res.status(409).json({ success: false, message: 'El telefono ya esta registrado' });
        }
      }

      const rawPassword = typeof payload.password === 'string' ? payload.password.trim() : '';
      const useManualPassword = Boolean(rawPassword);

      if (useManualPassword && !isStrongPassword(rawPassword)) {
        return res.status(400).json({
          success: false,
          message: 'La contrasena debe tener minimo 8 caracteres, una mayuscula, una minuscula, un numero y un caracter especial',
        });
      }

      const tempPassword = useManualPassword ? null : generateTempPassword();
      const passwordToHash = useManualPassword ? rawPassword : tempPassword;
      const password_hash = await bcrypt.hash(passwordToHash, 10);
      const id = await models.Usuarios.create({ ...payload, password_hash, actor_id: req.user?.id || null });
      await models.Usuarios.storePasswordHistory(id, password_hash);

      // Correo de bienvenida con credenciales (siempre que el alta sea correcta).
      // - Para alta hecha por admin se envian Email + Contrasena para iniciar sesion.
      try {
        await sendWelcomeEmail({
          to: payload.email,
          name: `${payload.nombre} ${payload.apellido}`.trim(),
          email: payload.email,
          password: passwordToHash,
        });
      } catch (error) {
        console.error('Error enviando correo de bienvenida (usuario):', error);
      }

      res.status(201).json({
        success: true,
        id,
        message: useManualPassword
          ? 'Usuario creado exitosamente. Se envio un correo de bienvenida con las credenciales al correo registrado.'
          : 'Usuario creado exitosamente. Se envio un correo de bienvenida con la contrasena temporal al correo registrado.',
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const normalized = normalizeUsuarioPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const currentUsuario = await models.Usuarios.getById(req.params.id);
      if (!currentUsuario) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      if (isClienteUser(req) && Number(req.params.id) !== Number(req.user?.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      if (isClienteUser(req)) {
        delete normalized.data.rol_id;
        delete normalized.data.estado;
        delete normalized.data.password;
      }

      const previousEmail = currentUsuario.email;
      const normalizedEmail =
        typeof normalized.data.email === 'string' ? normalized.data.email.trim().toLowerCase() : null;
      const emailChanged =
        typeof normalized.data.email === 'string' &&
        normalized.data.email.trim() &&
        normalized.data.email.trim().toLowerCase() !== String(previousEmail || '').trim().toLowerCase();

      if (normalizedEmail) {
        const emailTaken = await models.Usuarios.existsEmailExcept(normalizedEmail, Number(req.params.id));
        if (emailTaken) {
          return res.status(409).json({ success: false, message: 'El correo ya esta registrado' });
        }
      }

      if (typeof normalized.data.documento === 'string' && normalized.data.documento.trim()) {
        const docTaken = await models.Usuarios.existsDocumentoExcept(
          normalized.data.documento.trim(),
          Number(req.params.id)
        );
        if (docTaken) {
          return res.status(409).json({ success: false, message: 'El documento ya esta registrado' });
        }
      }

      if (typeof normalized.data.telefono === 'string' && normalized.data.telefono.trim()) {
        const phoneTaken = await models.Usuarios.existsTelefonoExcept(
          normalized.data.telefono.trim(),
          Number(req.params.id)
        );
        if (phoneTaken) {
          return res.status(409).json({ success: false, message: 'El telefono ya esta registrado' });
        }
      }

      if (normalized.data.estado && normalized.data.estado !== currentUsuario.estado) {
        return res.status(400).json({
          success: false,
          message: 'El cambio de estado debe realizarse desde la opcion Cambiar Estado',
        });
      }

      const passwordChanged =
        normalized.data.password && typeof normalized.data.password === 'string' && normalized.data.password.trim();

      await models.Usuarios.update(req.params.id, { ...normalized.data, actor_id: req.user?.id || null });
      if (passwordChanged) {
        const newHash = await bcrypt.hash(normalized.data.password.trim(), 10);
        await models.Usuarios.updatePasswordHash(req.params.id, newHash);
        await models.Usuarios.storePasswordHistory(req.params.id, newHash);
      }

      const userName = `${normalized.data.nombre || currentUsuario.nombre || ''} ${normalized.data.apellido || currentUsuario.apellido || ''}`.trim();

      if (emailChanged) {
        void sendEmailChangeNotification({
          to: normalized.data.email.trim(),
          name: userName,
          previousEmail,
          currentEmail: normalized.data.email,
        }).catch((error) => {
          console.error('Error notificando cambio de correo:', error);
        });
      }

      if (passwordChanged) {
        const notifyEmail = (normalized.data.email || currentUsuario.email || '').trim();
        if (notifyEmail) {
          void sendPasswordChangeNotification({
            to: notifyEmail,
            name: userName,
          }).catch((error) => {
            console.error('Error notificando cambio de contraseña:', error);
          });
        }
      }

      res.json({ success: true, message: 'Usuario actualizado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      const estado = typeof req.body?.estado === 'string' ? req.body.estado.trim() : '';
      if (!['Activo', 'Inactivo'].includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'El estado seleccionado no es válido. Valores permitidos: Activo o Inactivo.',
        });
      }

      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo del cambio de estado es obligatorio y debe tener entre 10 y 50 caracteres.',
        });
      }

      const usuario = await models.Usuarios.getById(req.params.id);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'No se encontró el usuario que intenta modificar.' });
      }

      const notificar =
        req.body?.notificar === undefined ||
        req.body?.notificar === true ||
        req.body?.notificar === 'true';

      if (notificar && !usuario.email) {
        return res.status(400).json({
          success: false,
          message: 'El usuario no tiene un correo electrónico configurado para recibir la notificación.',
        });
      }

      const updatedUser = await models.Usuarios.updateStatus(req.params.id, {
        estado,
        force: req.body?.force,
        motivo,
        actor_id: req.user?.id || null,
      });

      if (notificar && updatedUser?.email) {
        try {
          await sendUserStatusChangeNotification({
            to: updatedUser.email,
            name: `${updatedUser.nombre || ''} ${updatedUser.apellido || ''}`.trim(),
            estado,
            motivo,
            changedBy: req.user?.email || null,
          });
        } catch (notifyError) {
          console.error('No se pudo enviar la notificación de cambio de estado:', notifyError.message);
        }
      }

      return res.json({
        success: true,
        message: `Estado del usuario actualizado exitosamente a "${estado}".`,
        data: updatedUser,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'No fue posible actualizar el estado del usuario.',
        details: error.details,
      });
    }
  },
  assignRole: async (req, res) => {
    try {
      const { rol_id } = req.body;
      if (!rol_id) {
        return res.status(400).json({ success: false, message: 'rol_id es obligatorio' });
      }

      const usuario = await models.Usuarios.getById(req.params.id);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      const rol = await models.Roles.getById(rol_id);
      if (!rol) {
        return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      }

      await models.Usuarios.assignRole(req.params.id, rol_id);
      res.json({ success: true, message: 'Rol asignado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }

      const usuario = await models.Usuarios.getById(req.params.id);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      const result = await models.Usuarios.delete(req.params.id, {
        actor_id: req.user?.id || null,
        reason: motivo,
      });

      if (usuario.email) {
        void sendAccountDeletedNotification({
          to: usuario.email,
          name: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim(),
          motivo,
          changedBy: req.user?.email || null,
          accountType: 'cuenta de usuario',
        }).catch((notifyError) => {
          console.error('No se pudo enviar la notificación de eliminación de usuario:', notifyError.message);
        });
      }

      res.json({
        success: true,
        message: 'Usuario eliminado exitosamente de la base de datos',
        data: result,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  forceResetPassword: async (req, res) => {
    try {
      const reason = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : 'Reset forzado por administrador';
      const result = await models.Usuarios.forceResetPassword(req.params.id, {
        actor_id: req.user?.id || null,
        reason,
      });

      if (result?.user?.email) {
        await sendTemporaryPasswordEmail({
          to: result.user.email,
          name: `${result.user.nombre || ''} ${result.user.apellido || ''}`.trim(),
          tempPassword: result.tempPassword,
        });
      }

      return res.json({
        success: true,
        message: 'Contraseña reseteada de forma forzada y enviada al correo del usuario',
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
      });
    }
  }
};

