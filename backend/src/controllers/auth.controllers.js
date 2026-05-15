// Rewire: el modelo Clientes, Roles, Usuarios viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Clientes: require('../models/ventas/clientes'),
  Roles: require('../models/usuarios/roles'),
  Usuarios: require('../models/usuarios/usuarios'),
};
const pool = require('../../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { normalizeAuthRegisterPayload } = require('./normalizador-http');
const { generateTempPassword, isStrongPassword } = require('../utils/credentials');
const { sendTemporaryPasswordEmail, sendWelcomeEmail } = require('../services/email.service');
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
  rol: roleName,
  rol_id: usuario.rol_id,
  cliente_id: clienteId,
  permisos: permissions,
});

const buildSessionMetadata = (sessionExpiresAtMs) => {
  if (!sessionExpiresAtMs) return {};

  return {
    session_expires_at: new Date(sessionExpiresAtMs).toISOString(),
    session_remaining_ms: Math.max(0, sessionExpiresAtMs - Date.now()),
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
  login: async (req, res) => {
    try {
      const { email, password, rememberMe } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Correo y contrasena son obligatorios' });
      }

      const identifier = getLoginIdentifier(email);
      const MAX_INTENTOS = models.Usuarios.MAX_LOGIN_ATTEMPTS || 6;
      const BLOQUEO_MIN = Math.round((models.Usuarios.LOGIN_BLOCK_DURATION_MS || 5 * 60 * 1000) / 60000);

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

      const usuario = await models.Usuarios.getByEmailLogin(identifier);
      if (!usuario) {
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
          message: `Credenciales incorrectas. Te quedan ${intentosRestantes} intento${intentosRestantes === 1 ? '' : 's'} antes de bloquear el acceso por ${BLOQUEO_MIN} minutos.`,
          details: { attemptsUsed: intentosUsados, attemptsRemaining: intentosRestantes, maxAttempts: MAX_INTENTOS },
        });
      }

      if (usuario.estado !== 'Activo') {
        return res.status(403).json({ success: false, message: 'La cuenta se encuentra inactiva y no puede iniciar sesion' });
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
          message: `Credenciales incorrectas. Te quedan ${intentosRestantes} intento${intentosRestantes === 1 ? '' : 's'} antes de bloquear el acceso por ${BLOQUEO_MIN} minutos.`,
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
        return res.status(401).json({ success: false, message: 'Sesion invalida' });
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

      const passwordHistory = await models.Usuarios.getPasswordHistory(userId, 3);
      for (const storedHash of passwordHistory) {
        if (await bcrypt.compare(newPassword, storedHash)) {
          return res.status(409).json({ success: false, message: 'La nueva contraseña no puede ser igual a las ultimas 3 utilizadas' });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await models.Usuarios.updatePasswordHash(userId, newHash);
      await models.Usuarios.storePasswordHistory(userId, newHash);

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

      const passwordHistory = await models.Usuarios.getPasswordHistory(usuario.id, 3);
      for (const storedHash of passwordHistory) {
        if (await bcrypt.compare(newPassword, storedHash)) {
          return res.status(409).json({ success: false, message: 'La nueva contraseña no puede ser igual a las ultimas 3 utilizadas' });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await models.Usuarios.updatePasswordHash(usuario.id, newHash);
      await models.Usuarios.storePasswordHistory(usuario.id, newHash);

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
    const client = await pool.connect();

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

      if (clienteByEmail && clienteByDocumento && Number(clienteByEmail.id) !== Number(clienteByDocumento.id)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El correo y el documento ya existen en clientes, pero corresponden a registros distintos.',
        });
      }

      if (clienteByEmail?.usuario_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El correo ya está asociado a una cuenta existente.' });
      }
      if (clienteByDocumento?.usuario_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'El documento ya está asociado a una cuenta existente.' });
      }

      const clienteRole = await client.query('SELECT id FROM roles WHERE nombre = $1', ['Cliente']);
      if (clienteRole.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: 'No existe el rol Cliente en la base de datos' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        `INSERT INTO usuarios
        (nombre, apellido, tipo_documento, documento, direccion, email, telefono, password_hash, rol_id, estado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Activo')
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
          clienteRole.rows[0].id,
        ]
      );

      let clienteResult;
      const existingClienteForNewUser = await client.query(
        'SELECT id FROM clientes WHERE usuario_id = $1 LIMIT 1',
        [userResult.rows[0].id]
      );

      // Si existe un trigger/proceso que crea el cliente al insertar usuario, actualizamos ese registro.
      if (existingClienteForNewUser.rows.length > 0) {
        clienteResult = await client.query(
          `UPDATE clientes
           SET nombre = $1,
               apellido = $2,
               tipo_documento = $3,
               documento = $4,
               telefono = $5,
               email = $6,
               direccion = $7,
               estado = $8,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $9
           RETURNING id`,
          [
            normalizedNombre,
            normalizedApellido,
            tipoDocumento,
            normalizedDocumento,
            normalizedTelefono,
            normalizedEmail,
            normalizedDireccion,
            estado || 'Activo',
            existingClienteForNewUser.rows[0].id,
          ]
        );
      } else if (clienteByEmail && !clienteByDocumento) {
        clienteResult = await client.query(
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
            userResult.rows[0].id,
            normalizedNombre,
            normalizedApellido,
            tipoDocumento,
            normalizedDocumento,
            normalizedTelefono,
            normalizedEmail,
            normalizedDireccion,
            estado || 'Activo',
            clienteByEmail.id,
          ]
        );
      } else {
        clienteResult = await client.query(
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
          [
            userResult.rows[0].id,
            normalizedNombre,
            normalizedApellido,
            tipoDocumento,
            normalizedDocumento,
            normalizedTelefono,
            normalizedEmail,
            normalizedDireccion,
            estado || 'Activo',
          ]
        );
        if (!clienteResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: 'El documento ya está asociado a una cuenta existente.',
          });
        }
      }

      await client.query('COMMIT');

      // Auto-registro del cliente: enviar SOLO correo de bienvenida con la
      // informacion del registro (sin credenciales, ya que el cliente eligio
      // su propia contrasena en el formulario de registro).
      void sendWelcomeEmail({
        to: normalizedEmail,
        name: `${normalizedNombre} ${normalizedApellido}`.trim(),
        email: normalizedEmail,
      }).catch((error) => {
        console.error('Error enviando correo de bienvenida (auto-registro):', error);
      });

      res.status(201).json({
        success: true,
        message: 'Cliente registrado exitosamente',
        data: {
          cliente_id: clienteResult.rows[0].id,
          usuario_id: userResult.rows[0].id,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') {
        const constraint = String(error?.constraint || '').toLowerCase();
        if (constraint.includes('usuarios_documento') || constraint.includes('documento')) {
          return res.status(409).json({ success: false, message: 'El documento ya se encuentra registrado.' });
        }
        if (constraint.includes('usuarios_email') || constraint.includes('clientes_email') || constraint.includes('email')) {
          return res.status(409).json({ success: false, message: 'El correo ya se encuentra registrado.' });
        }
        if (constraint.includes('clientes_usuario_id')) {
          return res.status(409).json({ success: false, message: 'Este cliente ya está vinculado a un usuario.' });
        }
        return res.status(409).json({
          success: false,
          message: 'El correo o documento ya se encuentra registrado.',
        });
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
    } finally {
      client.release();
    }
  },
};

