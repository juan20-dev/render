// Rewire: el modelo Clientes, Roles, Usuarios viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Clientes: require('../models/ventas/clientes'),
  Roles: require('../models/usuarios/roles'),
  Usuarios: require('../models/usuarios/usuarios'),
};
const bcrypt = require('bcryptjs');
const ClienteCuenta = require('../models/ventas/cliente-cuenta');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { normalizeAuthRegisterPayload } = require('./normalizador-http');
const { generateTempPassword, isStrongPassword } = require('../utils/credentials');
const {
  sendTemporaryPasswordEmail,
  sendWelcomeEmail,
  sendPasswordChangeNotification,
} = require('../services/email.service');
const { validators } = require('../middlewares/auth.middleware');

/** Validez del código de recuperación enviado por correo (confirmación en el flujo de restablecimiento). */
const passwordTokenExpiryMs = 2 * 60 * 60 * 1000;

const getLoginIdentifier = (value) => String(value || '').trim().toLowerCase();

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const getSessionTtlByRole = (roleName) => {
  return roleName === 'Cliente' ? config.auth.clienteTokenTtlMs : config.auth.staffTokenTtlMs;
};

const buildCookieOptions = (maxAge) => {
  const options = {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: '/',
  };

  if (typeof maxAge === 'number') {
    options.maxAge = maxAge;
  }

  if (config.auth.cookieDomain) {
    options.domain = config.auth.cookieDomain;
  }

  return options;
};

const mapUserForResponse = (usuario, roleName, clienteId, permissions = []) => ({
  id: usuario.id,
  email: usuario.email,
  nombre: usuario.nombre,
  apellido: usuario.apellido,
  tipo_documento: usuario.tipo_documento || null,
  documento: usuario.documento || null,
  telefono: usuario.telefono || null,
  direccion: usuario.direccion || null,
  rol: roleName,
  rol_id: usuario.rol_id,
  cliente_id: clienteId,
  estado: usuario.estado,
  permisos: permissions,
});

const buildSessionMetadata = (sessionExpiresAtMs) => {
  if (!sessionExpiresAtMs) {
    return { idle_timeout_ms: config.auth.idleTimeoutMs };
  }

  return {
    session_expires_at: new Date(sessionExpiresAtMs).toISOString(),
    session_remaining_ms: Math.max(0, sessionExpiresAtMs - Date.now()),
    idle_timeout_ms: config.auth.idleTimeoutMs,
  };
};

const resolveUserRoleAndClienteId = async (usuario) => {
  const rol = usuario.rol_id ? await models.Roles.getById(usuario.rol_id) : null;
  const roleName = rol?.nombre || usuario.rol || 'Cliente';
  const permissions = Array.isArray(rol?.permisos) ? rol.permisos : [];
  let clienteId = null;

  if (roleName === 'Cliente') {
    const cliente = await models.Clientes.getOrCreateByUsuarioId(usuario.id);
    clienteId = cliente?.id || null;
  }

  return { roleName, clienteId, permissions };
};

const headerValueToString = (value) => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  return null;
};

module.exports = {
  checkRegisterClienteAvailability: async (req, res) => {
    try {
      const documento = String(req.query?.documento || '').replace(/\D/g, '');
      const email = getLoginIdentifier(req.query?.email);
      const data = {
        documentoExists: false,
        emailExists: false,
      };

      if (documento) {
        const [usuarioByDocumento, clienteByDocumento] = await Promise.all([
          models.Usuarios.getByDocumento(documento),
          models.Clientes.getByDocumento(documento),
        ]);
        data.documentoExists = Boolean(usuarioByDocumento || clienteByDocumento);
      }

      if (email) {
        const [usuarioByEmail, clienteByEmail] = await Promise.all([
          models.Usuarios.getByEmailLogin(email),
          models.Clientes.getByEmail(email),
        ]);
        data.emailExists = Boolean(usuarioByEmail || clienteByEmail);
      }

      return res.json({ success: true, data });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  login: async (req, res) => {
    try {
      const { email, password, rememberMe } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Correo y contrasena son obligatorios' });
      }

      const identifier = getLoginIdentifier(email);
      const MAX_INTENTOS = models.Usuarios.MAX_LOGIN_ATTEMPTS || 6;
      const BLOQUEO_MIN = Math.round((models.Usuarios.LOGIN_BLOCK_DURATION_MS || 5 * 60 * 1000) / 60000);

      const usuario = await models.Usuarios.getByEmailLogin(identifier);
      if (!usuario) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'No encontramos un usuario activo con esas credenciales. Verifica el correo y la contraseña o regístrate en la aplicación.',
        });
      }

      const blockInfo = await models.Usuarios.getLoginBlockInfo(identifier);
      if (blockInfo?.blocked) {
        const minutosRestantes = Math.max(1, Math.ceil(blockInfo.remainingMs / 60000));
        return res.status(429).json({
          success: false,
          code: 'LOGIN_BLOCKED',
          message: `Demasiados intentos de inicio de sesión. Tu acceso está bloqueado temporalmente; vuelve a intentarlo en ${minutosRestantes} minuto${minutosRestantes === 1 ? '' : 's'}.`,
          details: {
            blocked: true,
            remainingMs: blockInfo.remainingMs,
            remainingMinutes: minutosRestantes,
            maxAttempts: MAX_INTENTOS,
            blockMinutes: BLOQUEO_MIN,
          },
        });
      }

      if (usuario.estado !== 'Activo') {
        const latestReason = await models.Usuarios.getLatestStatusReason(usuario.id, 'Inactivo').catch(() => null);
        return res.status(403).json({
          success: false,
          code: 'INACTIVE_ACCOUNT',
          message: latestReason
            ? `Tu cuenta está inactiva. Motivo: ${latestReason}. Comunícate con los administradores de la aplicación.`
            : 'Tu cuenta está inactiva. Comunícate con los administradores de la aplicación.',
        });
      }

      const isValid = await bcrypt.compare(password, usuario.password_hash || '');
      if (!isValid) {
        const failure = await models.Usuarios.registerLoginFailure(identifier);
        const intentosUsados = Number(failure?.attempts || 0);
        const intentosRestantes = Math.max(0, MAX_INTENTOS - intentosUsados);
        if (intentosRestantes === 0) {
          return res.status(429).json({
            success: false,
            code: 'LOGIN_BLOCKED',
            message: `Demasiados intentos de inicio de sesión. Tu acceso ha sido bloqueado temporalmente; vuelve a intentarlo en ${BLOQUEO_MIN} minutos.`,
            details: { blocked: true, remainingMinutes: BLOQUEO_MIN, maxAttempts: MAX_INTENTOS, blockMinutes: BLOQUEO_MIN },
          });
        }
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: `No encontramos un usuario activo con esas credenciales. Verifica el correo y la contraseña o regístrate en la aplicación. Te quedan ${intentosRestantes} intento${intentosRestantes === 1 ? '' : 's'} antes de bloquear el acceso por ${BLOQUEO_MIN} minutos.`,
          details: { attemptsUsed: intentosUsados, attemptsRemaining: intentosRestantes, maxAttempts: MAX_INTENTOS },
        });
      }

      await models.Usuarios.ensurePasswordEmailExpiryColumn();
      const pwdEmailExp = await models.Usuarios.getPasswordEmailExpiry(usuario.id);
      if (pwdEmailExp) {
        const expMs = new Date(pwdEmailExp).getTime();
        if (Number.isFinite(expMs) && Date.now() > expMs) {
          return res.status(401).json({
            success: false,
            code: 'EMAILED_CREDENTIALS_EXPIRED',
            message:
              'Las credenciales enviadas por correo ya no son válidas (han pasado más de 2 horas). Use «Olvidé mi contraseña» o solicite al administrador un nuevo acceso.',
          });
        }
      }

      await models.Usuarios.clearLoginAttempts(identifier);

      const { roleName, clienteId, permissions } = await resolveUserRoleAndClienteId(usuario);
      const sessionTtlMs = rememberMe ? config.auth.longSessionTtlMs || getSessionTtlByRole(roleName) : getSessionTtlByRole(roleName);
      const expiresInSeconds = Math.floor(sessionTtlMs / 1000);
      const sessionExpiresAtMs = Date.now() + sessionTtlMs;

      const sessionJti = crypto.randomUUID();
      const token = jwt.sign(
        {
          id: usuario.id,
          rol: roleName,
          rol_id: usuario.rol_id,
          cliente_id: clienteId,
          email: usuario.email,
        },
        config.auth.jwtSecret,
        {
          algorithm: 'HS256',
          subject: String(usuario.id),
          issuer: config.auth.jwtIssuer,
          audience: config.auth.jwtAudience,
          expiresIn: expiresInSeconds,
          jwtid: sessionJti,
        }
      );

      await models.Usuarios.registerSession({
        usuarioId: usuario.id,
        jti: sessionJti,
        expiresAt: sessionExpiresAtMs,
        ipAddress: headerValueToString(req.headers['x-forwarded-for']) || req.socket?.remoteAddress || null,
        userAgent: headerValueToString(req.headers['user-agent']),
      });

      res.cookie(config.auth.cookieName, token, buildCookieOptions(sessionTtlMs));

      res.json({
        success: true,
        message: 'Inicio de sesion exitoso',
        data: {
          ...mapUserForResponse(usuario, roleName, clienteId, permissions),
          expires_in_ms: sessionTtlMs,
          ...buildSessionMetadata(sessionExpiresAtMs),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  me: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const usuario = await models.Usuarios.getById(userId);
      if (!usuario || usuario.estado !== 'Activo') {
        const latestReason = usuario
          ? await models.Usuarios.getLatestStatusReason(userId, 'Inactivo').catch(() => null)
          : null;
        return res.status(401).json({
          success: false,
          message: latestReason
            ? `Tu cuenta fue desactivada y tu sesión se cerró. Motivo: ${latestReason}`
            : 'Sesion invalida',
        });
      }

      const { roleName, clienteId, permissions } = await resolveUserRoleAndClienteId(usuario);

      return res.json({
        success: true,
        data: {
          ...mapUserForResponse(usuario, roleName, clienteId, permissions),
          ...buildSessionMetadata(req.user?.session_expires_at_ms),
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  logout: async (req, res) => {
    try {
      const closeAll = req.body?.closeAll === true || req.body?.closeAll === 'true';
      if (closeAll && req.user?.id) {
        await models.Usuarios.revokeAllSessions(req.user.id);
      } else if (req.user?.session_jti) {
        await models.Usuarios.revokeSession(req.user.session_jti);
      }
      res.clearCookie(config.auth.cookieName, buildCookieOptions());
      return res.json({ success: true, message: 'Sesion cerrada', data: null });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  verifyCurrentPassword: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const currentPassword = String(req.body?.currentPassword ?? '');
      if (!currentPassword.trim()) {
        return res.json({ success: true, data: { valid: false } });
      }

      const usuario = await models.Usuarios.getById(userId);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      const valid = await bcrypt.compare(currentPassword, usuario.password_hash || '');
      return res.json({ success: true, data: { valid } });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  changePassword: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const currentPassword = String(req.body?.currentPassword || '').trim();
      const newPassword = String(req.body?.newPassword || '').trim();
      const confirmPassword = String(req.body?.confirmPassword || '').trim();

      // Validar que todos los campos estén presentes
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios' });
      }

      // Validar que las contraseñas coincidan
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Las contraseñas no coinciden' });
      }

      // Validar fortaleza de nueva contraseña
      const newPasswordVal = validators.password(newPassword);
      if (!newPasswordVal.valid || !isStrongPassword(newPassword)) {
        return res.status(400).json({
          success: false,
          message:
            'La nueva contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número',
        });
      }

      const usuario = await models.Usuarios.getById(userId);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      const currentValid = await bcrypt.compare(currentPassword, usuario.password_hash || '');
      if (!currentValid) {
        return res.status(401).json({ success: false, message: 'La contraseña actual es incorrecta' });
      }

      const sameAsCurrent = await bcrypt.compare(newPassword, usuario.password_hash || '');
      if (sameAsCurrent) {
        return res.status(409).json({
          success: false,
          message: 'La nueva contraseña debe ser diferente a la contraseña actual',
        });
      }

      const passwordHistory = await models.Usuarios.getPasswordHistory(userId, 3);
      for (const storedHash of passwordHistory) {
        if (await bcrypt.compare(newPassword, storedHash)) {
          return res.status(409).json({ success: false, message: 'La nueva contraseña no puede ser igual a las ultimas 3 utilizadas' });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await models.Usuarios.updatePasswordHash(userId, newHash);
      await models.Usuarios.storePasswordHistory(userId, newHash);

      if (usuario.email) {
        void sendPasswordChangeNotification({
          to: usuario.email,
          name: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim(),
        }).catch((error) => {
          console.error('Error notificando cambio de contraseña:', error);
        });
      }

      return res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  requestPasswordReset: async (req, res) => {
    try {
      const emailVal = validators.email(req.body?.email);
      if (!emailVal.valid) {
        return res.status(400).json({ success: false, message: emailVal.error });
      }
      const email = emailVal.value;

      const usuario = await models.Usuarios.getByEmailLogin(email);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'No existe una cuenta asociada a este correo' });
      }

      const token = generateTempPassword();
      const tokenHash = hashResetToken(token);
      const expiresAt = Date.now() + passwordTokenExpiryMs;

      // Hash the temporary password and set it as the user's password_hash
      const tempPasswordHash = await bcrypt.hash(token, 10);
      await models.Usuarios.updatePasswordHashWithExpiry(usuario.id, tempPasswordHash, expiresAt);
      await models.Usuarios.storePasswordHistory(usuario.id, tempPasswordHash);

      // Store reset token for audit trail
      await models.Usuarios.createPasswordResetToken({
        usuarioId: usuario.id,
        tokenHash,
        expiresAt,
      });

      await sendTemporaryPasswordEmail({
        to: usuario.email,
        name: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim(),
        tempPassword: token,
      });

      return res.json({ success: true, message: 'Se envió la contraseña temporal al correo registrado. Esta contraseña será válida por 2 horas.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  confirmPasswordReset: async (req, res) => {
    try {
      // Validar email
      const emailVal = validators.email(req.body?.email);
      if (!emailVal.valid) {
        return res.status(400).json({ success: false, message: emailVal.error });
      }
      const email = emailVal.value;

      // Validar token
      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({ success: false, message: 'El código es obligatorio' });
      }

      // Validar nueva contraseña
      const newPassword = String(req.body?.newPassword || '').trim();
      if (!newPassword) {
        return res.status(400).json({ success: false, message: 'La nueva contraseña es obligatoria' });
      }

      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
          success: false,
          message:
            'La nueva contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número',
        });
      }

      const resetRow = await models.Usuarios.consumePasswordResetToken({
        email,
        tokenHash: hashResetToken(token),
      });

      if (!resetRow) {
        return res.status(400).json({ success: false, message: 'Código inválido o expirado' });
      }

      const usuario = await models.Usuarios.getById(resetRow.usuario_id);
      if (!usuario) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      const sameAsCurrent = await bcrypt.compare(newPassword, usuario.password_hash || '');
      if (sameAsCurrent) {
        return res.status(409).json({
          success: false,
          message: 'La nueva contraseña debe ser diferente a la contraseña actual',
        });
      }

      const passwordHistory = await models.Usuarios.getPasswordHistory(usuario.id, 3);
      for (const storedHash of passwordHistory) {
        if (await bcrypt.compare(newPassword, storedHash)) {
          return res.status(409).json({ success: false, message: 'La nueva contraseña no puede ser igual a las ultimas 3 utilizadas' });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await models.Usuarios.updatePasswordHash(usuario.id, newHash);
      await models.Usuarios.storePasswordHistory(usuario.id, newHash);

      if (usuario.email) {
        void sendPasswordChangeNotification({
          to: usuario.email,
          name: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim(),
        }).catch((error) => {
          console.error('Error notificando restablecimiento de contraseña:', error);
        });
      }

      return res.json({ success: true, message: 'Contraseña restablecida exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  logoutAll: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      await models.Usuarios.revokeAllSessions(userId);
      res.clearCookie(config.auth.cookieName, buildCookieOptions());
      return res.json({ success: true, message: 'Todas las sesiones fueron cerradas' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  registerCliente: async (req, res) => {
    try {
      const normalizedRegister = normalizeAuthRegisterPayload(req.body);
      if (normalizedRegister.error) {
        return res.status(400).json({ success: false, message: normalizedRegister.error });
      }

      const {
        tipoDocumento,
        documento,
        nombre,
        apellido,
        telefono,
        direccion,
        email,
        estado,
        password,
      } = normalizedRegister.data;

      // Validar email
      const emailVal = validators.email(email);
      if (!emailVal.valid) {
        return res.status(400).json({ success: false, message: emailVal.error });
      }
      const normalizedEmail = emailVal.value;

      // Validar contraseña
      const passwordVal = validators.password(password);
      if (!passwordVal.valid || !isStrongPassword(password)) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número',
        });
      }

      const normalizedDocumento = String(documento || '').trim();
      const normalizedTelefono = String(telefono || '').replace(/\D/g, '');
      const normalizedNombre = String(nombre || '').trim();
      const normalizedApellido = String(apellido || '').trim();
      const normalizedDireccion = String(direccion || '').trim();

      const requiredFields = [
        { key: 'documento', value: normalizedDocumento, label: 'Número de Documento' },
        { key: 'nombre', value: normalizedNombre, label: 'Nombre' },
        { key: 'apellido', value: normalizedApellido, label: 'Apellido' },
        { key: 'telefono', value: normalizedTelefono, label: 'Teléfono' },
        { key: 'direccion', value: normalizedDireccion, label: 'Dirección' },
        { key: 'email', value: normalizedEmail, label: 'Correo Electrónico' },
        { key: 'password', value: password, label: 'Contraseña' },
      ];
      const missing = requiredFields.find((field) => {
        if (field.value === undefined || field.value === null) return true;
        return String(field.value).trim() === '';
      });
      if (missing) {
        return res.status(400).json({ success: false, message: `El campo "${missing.label}" es obligatorio.` });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      let clienteId;
      let usuarioId;
      try {
        const registered = await ClienteCuenta.registerWithUsuario({
          nombre: normalizedNombre,
          apellido: normalizedApellido,
          tipoDocumento,
          documento: normalizedDocumento,
          telefono: normalizedTelefono,
          email: normalizedEmail,
          direccion: normalizedDireccion,
          estado: estado || 'Activo',
          passwordHash,
        });
        clienteId = registered.clienteId;
        usuarioId = registered.usuarioId;
        await models.Usuarios.storePasswordHistory(usuarioId, passwordHash);
      } catch (error) {
        const mapped = ClienteCuenta.mapRegisterPgUniqueError(error);
        if (mapped) {
          return res.status(mapped.statusCode).json({ success: false, message: mapped.message });
        }
        if (error?.statusCode) {
          return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        throw error;
      }

      // Auto-registro del cliente: enviar SOLO correo de bienvenida con la
      // informacion del registro (sin credenciales, ya que el cliente eligio
      // su propia contrasena en el formulario de registro).
      try {
        await sendWelcomeEmail({
          to: normalizedEmail,
          name: `${normalizedNombre} ${normalizedApellido}`.trim(),
          email: normalizedEmail,
        });
      } catch (error) {
        console.error('Error enviando correo de bienvenida (auto-registro):', error);
      }

      res.status(201).json({
        success: true,
        message: 'Cliente registrado exitosamente',
        data: {
          cliente_id: clienteId,
          usuario_id: usuarioId,
        },
      });
    } catch (error) {
      if (error?.code === '23505') {
        const mapped = ClienteCuenta.mapRegisterPgUniqueError(error);
        if (mapped) {
          return res.status(mapped.statusCode).json({ success: false, message: mapped.message });
        }
      }
      if (error?.code === '22001') {
        return res.status(400).json({
          success: false,
          message: 'Uno de los campos excede la longitud permitida.',
        });
      }
      return res.status(500).json({
        success: false,
        message: 'No se pudo completar el registro en este momento.',
      });
    }
  },
};

