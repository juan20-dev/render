const nodemailer = require('nodemailer');
const config = require('../../config');

let cachedTransporter = null;
let cachedTransporterMode = null;

const hasSmtpConfig = () =>
  Boolean(config.mail.host && config.mail.user && config.mail.password);

const createTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  if (hasSmtpConfig()) {
    cachedTransporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: {
        user: config.mail.user,
        pass: config.mail.password,
      },
    });
    cachedTransporterMode = 'smtp';
    console.log(
      `[mail] SMTP configurado -> host=${config.mail.host} port=${config.mail.port} secure=${config.mail.secure} user=${config.mail.user} from=${config.mail.from}`
    );
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({ jsonTransport: true });
  cachedTransporterMode = 'json';
  console.warn(
    '[mail] AVISO: No hay credenciales SMTP en .env (MAIL_HOST/MAIL_USER/MAIL_PASSWORD). ' +
      'Los correos NO se entregaran a los destinatarios; solo se imprimiran en consola. ' +
      'Configura las variables MAIL_* en backend/.env y reinicia el backend.'
  );
  return cachedTransporter;
};

/**
 * Envuelve transporter.sendMail para registrar siempre el destinatario y el
 * modo (smtp real vs jsonTransport) y, en caso de error, dejar trazado el
 * problema sin reventar el flujo del controller (los catch del controller
 * siguen funcionando igual).
 */
const sendWithLogging = async (message, label) => {
  const transporter = createTransporter();
  try {
    const result = await transporter.sendMail(message);
    if (cachedTransporterMode === 'json') {
      console.warn(
        `[mail] (${label}) NO ENVIADO (jsonTransport activo). Destinatario: ${message.to}. ` +
          'Configura MAIL_* en backend/.env para entregar correos reales.'
      );
    } else {
      console.log(
        `[mail] (${label}) Enviado a ${message.to} (messageId=${result?.messageId || 'n/d'})`
      );
    }
    return result;
  } catch (error) {
    console.error(
      `[mail] (${label}) Fallo al enviar a ${message.to}: ${error?.message || error}`
    );
    throw error;
  }
};

const sendTemporaryPasswordEmail = async ({ to, name, tempPassword }) => {
  const message = {
    from: config.mail.from,
    to,
    subject: 'Acceso temporal a Grandma\'s Liquors',
    text: [
      `Hola ${name || ''}`.trim(),
      '',
      `Tu contraseña temporal es: ${tempPassword}`,
      '',
      'Debes cambiar la contraseña al ingresar por primera vez.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 16px;">Acceso temporal a Grandma's Liquors</h2>
        <p>Hola ${name || ''}</p>
        <p>Tu contraseña temporal es: <strong>${tempPassword}</strong></p>
        <p>Debes cambiar la contraseña al ingresar por primera vez.</p>
      </div>
    `,
  };

  return sendWithLogging(message, 'temporaryPassword');
};

const sendEmailChangeNotification = async ({ to, name, previousEmail, currentEmail }) => {
  const message = {
    from: config.mail.from,
    to,
    subject: 'Tu correo de acceso fue actualizado',
    text: [
      `Hola ${name || ''}`.trim(),
      '',
      'Te informamos que el correo asociado a tu cuenta fue actualizado.',
      `Correo anterior: ${previousEmail || 'No disponible'}`,
      `Correo actual: ${currentEmail || to}`,
      '',
      'Si no realizaste este cambio, contacta al administrador de inmediato.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 16px;">Tu correo de acceso fue actualizado</h2>
        <p>Hola ${name || ''}</p>
        <p>Te informamos que el correo asociado a tu cuenta fue actualizado.</p>
        <ul>
          <li><strong>Correo anterior:</strong> ${previousEmail || 'No disponible'}</li>
          <li><strong>Correo actual:</strong> ${currentEmail || to}</li>
        </ul>
        <p>Si no realizaste este cambio, contacta al administrador de inmediato.</p>
      </div>
    `,
  };

  return sendWithLogging(message, 'emailChange');
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Envia un correo de bienvenida a la plataforma Grandma's Liquors.
 *
 * - Si se recibe `password`, el cuerpo incluye las credenciales (correo + contrasena)
 *   para que el destinatario pueda iniciar sesion. Caso de uso: alta hecha por
 *   un administrador desde Gestion Usuarios o Gestion Clientes.
 * - Si NO se recibe `password`, solo envia el saludo de bienvenida con la
 *   informacion del registro. Caso de uso: cliente que se auto-registra y ya
 *   conoce su contrasena.
 */
const sendWelcomeEmail = async ({ to, name, email, password = null }) => {
  const safeName = String(name || '').trim() || 'usuario';
  const loginEmail = String(email || to || '').trim();
  const includesCreds = Boolean(password);

  const subject = includesCreds
    ? "Bienvenido(a) a Grandma's Liquors - Datos de acceso"
    : "Bienvenido(a) a Grandma's Liquors";

  const credentialsTextBlock = includesCreds
    ? [
        '',
        'Estas son tus credenciales para iniciar sesion:',
        `  - Correo (login): ${loginEmail}`,
        `  - Contrasena: ${password}`,
        '',
        'Te recomendamos cambiar la contrasena despues del primer ingreso.',
      ].join('\n')
    : [
        '',
        `Tu correo registrado para iniciar sesion es: ${loginEmail}`,
        'Recuerda usar la contrasena que definiste durante el registro.',
      ].join('\n');

  const text = [
    `Hola ${safeName},`,
    '',
    "Te damos la bienvenida a Grandma's Liquors.",
    'Tu registro en la plataforma se completo correctamente.',
    credentialsTextBlock,
    '',
    'Si no reconoces este registro, contacta al administrador de la plataforma.',
    '',
    "El equipo de Grandma's Liquors",
  ].join('\n');

  const credentialsHtmlBlock = includesCreds
    ? `
      <div style="margin-top:16px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <p style="margin:0 0 8px 0;color:#0f172a"><strong>Datos de acceso</strong></p>
        <p style="margin:4px 0;color:#0f172a"><strong>Correo (login):</strong> ${escapeHtml(loginEmail)}</p>
        <p style="margin:4px 0;color:#0f172a"><strong>Contrase&ntilde;a:</strong> ${escapeHtml(password)}</p>
        <p style="margin:10px 0 0 0;color:#475569;font-size:13px">
          Te recomendamos cambiar la contrase&ntilde;a despu&eacute;s del primer ingreso.
        </p>
      </div>
    `
    : `
      <div style="margin-top:16px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <p style="margin:0 0 4px 0;color:#0f172a">
          Tu correo registrado para iniciar sesi&oacute;n es:
          <strong>${escapeHtml(loginEmail)}</strong>
        </p>
        <p style="margin:6px 0 0 0;color:#475569;font-size:13px">
          Recuerda usar la contrase&ntilde;a que definiste durante el registro.
        </p>
      </div>
    `;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color:#1f2937; max-width:560px; margin:0 auto;">
      <h2 style="margin-bottom:12px; color:#0f172a;">Bienvenido(a) a Grandma's Liquors</h2>
      <p>Hola <strong>${escapeHtml(safeName)}</strong>,</p>
      <p>Te damos la bienvenida a la plataforma. Tu registro se complet&oacute; correctamente.</p>
      ${credentialsHtmlBlock}
      <p style="margin-top:18px; color:#475569; font-size:13px;">
        Si no reconoces este registro, contacta al administrador de la plataforma.
      </p>
      <p style="margin-top:18px; color:#0f172a;">El equipo de Grandma's Liquors</p>
    </div>
  `;

  return sendWithLogging(
    {
      from: config.mail.from,
      to,
      subject,
      text,
      html,
    },
    includesCreds ? 'welcome+credentials' : 'welcome'
  );
};

const sendUserStatusChangeNotification = async ({ to, name, estado, motivo, changedBy }) => {
  const message = {
    from: config.mail.from,
    to,
    subject: 'Cambio de estado de tu cuenta',
    text: [
      `Hola ${name || ''}`.trim(),
      '',
      `El estado de tu cuenta fue actualizado a: ${estado}`,
      changedBy ? `Realizado por: ${changedBy}` : null,
      motivo ? `Motivo: ${motivo}` : null,
      '',
      'Si no reconoces este cambio, contacta inmediatamente al administrador.',
    ]
      .filter(Boolean)
      .join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 16px;">Cambio de estado de tu cuenta</h2>
        <p>Hola ${name || ''}</p>
        <p>El estado de tu cuenta fue actualizado a: <strong>${estado}</strong></p>
        <ul>
          ${changedBy ? `<li><strong>Realizado por:</strong> ${changedBy}</li>` : ''}
          ${motivo ? `<li><strong>Motivo:</strong> ${motivo}</li>` : ''}
        </ul>
        <p>Si no reconoces este cambio, contacta inmediatamente al administrador.</p>
      </div>
    `,
  };

  return sendWithLogging(message, 'statusChange');
};

module.exports = {
  sendTemporaryPasswordEmail,
  sendEmailChangeNotification,
  sendUserStatusChangeNotification,
  sendWelcomeEmail,
};
