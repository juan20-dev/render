const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const config = require('../../config');

let cachedTransporter = null;
let cachedTransporterMode = null;
let cachedLogoDataUri = null;

const hasSmtpConfig = () =>
  Boolean(config.mail.host && config.mail.user && config.mail.password);

const LOGO_RELATIVE_PATH = path.join('assets', 'brand', 'logo.png');

/** Rutas probadas en orden: env, raíz del app (Beanstalk /var/app/current), relativa al servicio. */
const getLogoCandidatePaths = () => {
  const fromEnv = process.env.MAIL_LOGO_PATH ? path.resolve(process.env.MAIL_LOGO_PATH) : null;
  const appRoot = process.cwd();
  const candidates = [
    fromEnv,
    path.join(appRoot, LOGO_RELATIVE_PATH),
    path.join(__dirname, '..', '..', 'assets', 'brand', 'logo.png'),
    path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'favicon', 'android-chrome-192x192.png'),
    path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'favicon', 'apple-touch-icon.png'),
  ].filter(Boolean);
  return [...new Set(candidates.map((p) => path.normalize(p)))];
};

const buildFallbackLogoDataUri = () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="12" fill="#5b21b6"/>' +
    '<text x="32" y="40" text-anchor="middle" fill="#ffffff" font-family="Segoe UI,Arial,sans-serif" font-size="18" font-weight="700">GL</text>' +
    '</svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

const getLogoDataUri = () => {
  if (cachedLogoDataUri !== null) return cachedLogoDataUri;
  const candidates = getLogoCandidatePaths();
  for (const logoPath of candidates) {
    try {
      if (!fs.existsSync(logoPath)) continue;
      const buf = fs.readFileSync(logoPath);
      if (!buf.length) continue;
      const ext = path.extname(logoPath).toLowerCase();
      const mime =
        ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      cachedLogoDataUri = `data:${mime};base64,${buf.toString('base64')}`;
      console.log(`[mail] Logo de correo cargado: ${logoPath} (${buf.length} bytes)`);
      return cachedLogoDataUri;
    } catch (err) {
      console.warn(`[mail] No se pudo leer logo en ${logoPath}:`, err.message);
    }
  }
  console.warn(
    '[mail] Logo no encontrado. Incluya assets/brand/logo.png en el ZIP de despliegue. Rutas probadas:',
    candidates.join(' | ')
  );
  cachedLogoDataUri = buildFallbackLogoDataUri();
  return cachedLogoDataUri;
};

const buildEmailLogoHtml = () => {
  const dataUri = getLogoDataUri();
  return '<div style="margin:0 0 20px 0;text-align:center"><img src="' + dataUri + '" alt="Grandma\'s Liquors" width="64" height="64" style="display:block;margin:0 auto;border-radius:10px" /></div>';
};

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

const wrapBrandedHtml = (title, innerBodyHtml) => {
  const logoHtml = buildEmailLogoHtml();
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.55; color: #1e293b; max-width: 560px; margin: 0 auto;">
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:24px 28px;background:#ffffff">
        ${logoHtml}
        <h1 style="margin:0 0 12px 0;font-size:20px;color:#0f172a;font-weight:600">${title}</h1>
        ${innerBodyHtml}
        <p style="margin:28px 0 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
          Este mensaje fue generado de forma automática. Si no solicitó esta acción, ignore este correo o comuníquese con soporte.
        </p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8">Grandma's Liquors · Medellín</p>
      </div>
    </div>
  `;
};

const sendTemporaryPasswordEmail = async ({ to, name, tempPassword }) => {
  const safeName = String(name || '').trim() || 'estimado cliente';
  const inner = `
    <p style="margin:0 0 12px 0">Hola <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 12px 0">
      Hemos recibido una solicitud para restablecer el acceso a su cuenta en <strong>Grandma's Liquors</strong>.
      Utilice el siguiente <strong>código de verificación</strong> únicamente en el formulario de restablecimiento de contraseña de la aplicación:
    </p>
    <div style="margin:18px 0;padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center">
      <span style="font-size:22px;letter-spacing:3px;font-weight:700;color:#0f172a">${String(tempPassword)}</span>
    </div>
    <p style="margin:0 0 8px 0;color:#475569;font-size:14px">
      <strong>Vigencia:</strong> este código expira a las <strong>2 horas</strong> desde el envío de este correo. Pasado ese plazo deberá solicitar uno nuevo.
    </p>
    <p style="margin:0;color:#475569;font-size:14px">
      Por seguridad, no comparta este código. Nuestro equipo nunca le pedirá su contraseña ni este código por teléfono o mensaje.
    </p>
  `;
  const message = {
    from: config.mail.from,
    to,
    subject: "Grandma's Liquors — Código para restablecer su acceso",
    text: [
      `Hola ${safeName},`,
      '',
      'Ha solicitado restablecer su acceso a Grandma\'s Liquors.',
      `Su código de verificación (válido 2 horas): ${tempPassword}`,
      '',
      'Ingrese este código en el formulario de restablecimiento de contraseña de la aplicación.',
      'Si usted no realizó esta solicitud, puede ignorar este mensaje.',
    ].join('\n'),
    html: wrapBrandedHtml('Restablecimiento de acceso', inner),
  };

  return sendWithLogging(message, 'temporaryPassword');
};

const sendEmailChangeNotification = async ({ to, name, previousEmail, currentEmail }) => {
  const inner = `
    <p style="margin:0 0 12px 0">Hola <strong>${String(name || '').trim() || 'usuario'}</strong>,</p>
    <p style="margin:0 0 12px 0">Le informamos que el correo electrónico asociado a su cuenta en <strong>Grandma's Liquors</strong> fue actualizado.</p>
    <ul style="margin:0;padding-left:20px;color:#334155">
      <li style="margin:6px 0"><strong>Correo anterior:</strong> ${previousEmail || 'No disponible'}</li>
      <li style="margin:6px 0"><strong>Correo actual:</strong> ${currentEmail || to}</li>
    </ul>
    <p style="margin:16px 0 0 0">Si usted no autorizó este cambio, contacte de inmediato al administrador del sistema.</p>
  `;
  const message = {
    from: config.mail.from,
    to,
    subject: "Grandma's Liquors — Actualización de correo de acceso",
    text: [
      `Hola ${name || ''}`.trim(),
      '',
      'El correo asociado a su cuenta fue actualizado.',
      `Correo anterior: ${previousEmail || 'No disponible'}`,
      `Correo actual: ${currentEmail || to}`,
      '',
      'Si no realizó este cambio, contacte al administrador.',
    ].join('\n'),
    html: wrapBrandedHtml('Correo de acceso actualizado', inner),
  };

  return sendWithLogging(message, 'emailChange');
};

const sendPasswordChangeNotification = async ({ to, name }) => {
  const safeName = String(name || '').trim() || 'usuario';
  const inner = `
    <p style="margin:0 0 12px 0">Hola <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 12px 0">
      Le informamos que la contraseña de su cuenta en <strong>Grandma's Liquors</strong> fue actualizada correctamente.
    </p>
    <p style="margin:0;color:#475569;font-size:14px">
      Si usted no realizó este cambio, contacte de inmediato al administrador del sistema.
    </p>
  `;
  const message = {
    from: config.mail.from,
    to,
    subject: "Grandma's Liquors — Contraseña actualizada",
    text: [
      `Hola ${safeName},`,
      '',
      'La contraseña de su cuenta en Grandma\'s Liquors fue actualizada.',
      'Si no realizó este cambio, contacte al administrador de inmediato.',
    ].join('\n'),
    html: wrapBrandedHtml('Contraseña actualizada', inner),
  };

  return sendWithLogging(message, 'passwordChange');
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendWelcomeEmail = async ({ to, name, email, password = null, emailCredentialExpiresHours = null }) => {
  const safeName = String(name || '').trim() || 'usuario';
  const loginEmail = String(email || to || '').trim();
  const includesCreds = Boolean(password);

  const expiryNoteText =
    includesCreds && Number(emailCredentialExpiresHours) > 0
      ? `\nPor política de seguridad, debe usar estas credenciales para iniciar sesión dentro de las ${Number(
          emailCredentialExpiresHours
        )} horas posteriores a este correo.`
      : '';

  const subject = includesCreds
    ? "Grandma's Liquors — Bienvenido(a) y datos de acceso"
    : "Grandma's Liquors — Registro confirmado";

  const credentialsTextBlock = includesCreds
    ? [
        '',
        'Datos de acceso:',
        `  Correo (inicio de sesión): ${loginEmail}`,
        `  Contraseña: ${password}`,
        '',
        'Le recomendamos iniciar sesión a la brevedad y cambiar su contraseña desde su perfil.',
        expiryNoteText.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    : [
        '',
        `Correo registrado: ${loginEmail}`,
        'Utilice la contraseña que definió al completar su registro.',
      ].join('\n');

  const text = [
    `Hola ${safeName},`,
    '',
    'Gracias por registrarse en Grandma\'s Liquors.',
    'Le confirmamos que su cuenta fue creada correctamente.',
    credentialsTextBlock,
    '',
    'Si no reconoce esta actividad, responda a este correo o contacte a soporte.',
    '',
    'Atentamente,',
    'Grandma\'s Liquors',
  ].join('\n');

  const credentialsHtmlBlock = includesCreds
    ? `
      <div style="margin-top:16px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <p style="margin:0 0 10px 0;color:#0f172a;font-weight:600">Datos de acceso</p>
        <p style="margin:6px 0;color:#334155"><strong>Correo:</strong> ${escapeHtml(loginEmail)}</p>
        <p style="margin:6px 0;color:#334155"><strong>Contraseña:</strong> ${escapeHtml(password)}</p>
        <p style="margin:12px 0 0 0;color:#475569;font-size:13px">
          Por seguridad, inicie sesión lo antes posible y actualice su contraseña desde el apartado correspondiente en la plataforma.
        </p>
        ${
          Number(emailCredentialExpiresHours) > 0
            ? `<p style="margin:10px 0 0 0;color:#b45309;font-size:13px"><strong>Vigencia del primer acceso:</strong> ${Number(
                emailCredentialExpiresHours
              )} horas desde el envío de este correo.</p>`
            : ''
        }
      </div>
    `
    : `
      <div style="margin-top:16px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <p style="margin:0;color:#334155">Correo registrado: <strong>${escapeHtml(loginEmail)}</strong></p>
        <p style="margin:10px 0 0 0;color:#475569;font-size:13px">Inicie sesión con la contraseña que definió en el formulario de registro.</p>
      </div>
    `;

  const innerBody = `
    <p style="margin:0 0 12px 0">Hola <strong>${escapeHtml(safeName)}</strong>,</p>
    <p style="margin:0 0 12px 0">
      Es un gusto darle la bienvenida a <strong>Grandma's Liquors</strong>. Su registro quedó registrado en nuestro sistema.
    </p>
    ${credentialsHtmlBlock}
    <p style="margin:18px 0 0 0;color:#475569;font-size:14px">
      Ante cualquier duda, nuestro equipo está a su disposición.
    </p>
  `;

  return sendWithLogging(
    {
      from: config.mail.from,
      to,
      subject,
      text,
      html: wrapBrandedHtml('Bienvenido(a)', innerBody),
    },
    includesCreds ? 'welcome+credentials' : 'welcome'
  );
};

const sendUserStatusChangeNotification = async ({ to, name, estado, motivo, changedBy }) => {
  const inner = `
    <p style="margin:0 0 12px 0">Hola <strong>${String(name || '').trim() || 'usuario'}</strong>,</p>
    <p style="margin:0 0 12px 0">El estado de su cuenta en <strong>Grandma's Liquors</strong> fue actualizado.</p>
    <p style="margin:0 0 8px 0"><strong>Nuevo estado:</strong> ${escapeHtml(estado)}</p>
    <ul style="margin:0;padding-left:20px;color:#334155">
      ${changedBy ? `<li style="margin:6px 0"><strong>Registrado por:</strong> ${escapeHtml(changedBy)}</li>` : ''}
      ${motivo ? `<li style="margin:6px 0"><strong>Observación:</strong> ${escapeHtml(motivo)}</li>` : ''}
    </ul>
    <p style="margin:16px 0 0 0">Si no reconoce este cambio, contacte de inmediato al administrador.</p>
  `;
  const message = {
    from: config.mail.from,
    to,
    subject: "Grandma's Liquors — Notificación de cuenta",
    text: [
      `Hola ${name || ''}`.trim(),
      '',
      `El estado de su cuenta fue actualizado a: ${estado}`,
      changedBy ? `Realizado por: ${changedBy}` : null,
      motivo ? `Motivo: ${motivo}` : null,
      '',
      'Si no reconoce este cambio, contacte al administrador.',
    ]
      .filter(Boolean)
      .join('\n'),
    html: wrapBrandedHtml('Estado de cuenta', inner),
  };

  return sendWithLogging(message, 'statusChange');
};

module.exports = {
  sendTemporaryPasswordEmail,
  sendEmailChangeNotification,
  sendPasswordChangeNotification,
  sendUserStatusChangeNotification,
  sendWelcomeEmail,
};
