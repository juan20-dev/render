const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const config = require('../../config');

let cachedTransporter = null;
let cachedTransporterMode = null;
let cachedLogoDataUri = null;
let cachedLogoFilePath;
const PRIORITY_HEADERS = {
  'X-Priority': '1',
  'X-MSMail-Priority': 'High',
  Importance: 'High',
};

const hasSmtpConfig = () =>
  Boolean(config.mail.host && config.mail.user && config.mail.password);

const LOGO_RELATIVE_PATH = path.join('assets', 'brand', 'logo.png');
const BACKEND_ROOT = path.join(__dirname, '..', '..');

/** Logo oficial del proyecto (PNG, sin reescalar en disco). */
const getLogoCandidatePaths = () => {
  const fromEnv = process.env.MAIL_LOGO_PATH
    ? path.isAbsolute(process.env.MAIL_LOGO_PATH)
      ? path.normalize(process.env.MAIL_LOGO_PATH)
      : path.join(BACKEND_ROOT, process.env.MAIL_LOGO_PATH)
    : null;
  const appRoot = process.cwd();
  const candidates = [
    fromEnv,
    path.join(BACKEND_ROOT, LOGO_RELATIVE_PATH),
    path.join(appRoot, LOGO_RELATIVE_PATH),
    path.join(appRoot, 'backend', LOGO_RELATIVE_PATH),
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
  const buf = readLogoPngBuffer();
  if (buf) {
    cachedLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
    return cachedLogoDataUri;
  }
  const candidates = getLogoCandidatePaths();
  for (const logoPath of candidates) {
    try {
      if (!fs.existsSync(logoPath)) continue;
      const fallbackBuf = fs.readFileSync(logoPath);
      if (!fallbackBuf.length || !isValidPngBuffer(fallbackBuf)) continue;
      cachedLogoDataUri = `data:image/png;base64,${fallbackBuf.toString('base64')}`;
      console.log(`[mail] Logo de correo cargado: ${logoPath} (${fallbackBuf.length} bytes)`);
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

const isValidPngBuffer = (buf) =>
  Buffer.isBuffer(buf) &&
  buf.length > 8 &&
  buf[0] === 0x89 &&
  buf[1] === 0x50 &&
  buf[2] === 0x4e &&
  buf[3] === 0x47;

let cachedLogoBuffer = null;

const readLogoPngBuffer = () => {
  if (cachedLogoBuffer !== null) return cachedLogoBuffer;
  for (const logoPath of getLogoCandidatePaths()) {
    try {
      if (!fs.existsSync(logoPath) || !fs.statSync(logoPath).isFile()) continue;
      const buf = fs.readFileSync(logoPath);
      if (!isValidPngBuffer(buf)) {
        console.warn(`[mail] Archivo no es PNG valido: ${logoPath}`);
        continue;
      }
      cachedLogoBuffer = buf;
      cachedLogoFilePath = logoPath;
      console.log(`[mail] Logo PNG listo para correo: ${logoPath} (${buf.length} bytes)`);
      return cachedLogoBuffer;
    } catch (err) {
      console.warn(`[mail] No se pudo leer logo en ${logoPath}:`, err.message);
    }
  }
  cachedLogoBuffer = false;
  cachedLogoFilePath = '';
  return null;
};

const resolveLogoFilePath = () => {
  if (cachedLogoFilePath !== undefined && cachedLogoFilePath) return cachedLogoFilePath;
  readLogoPngBuffer();
  return cachedLogoFilePath || '';
};

const getLogoAttachments = () => {
  const buf = readLogoPngBuffer();
  if (!buf) return [];
  return [
    {
      filename: 'grandmas-liquors-logo.png',
      content: buf,
      contentType: 'image/png',
      cid: 'brand-logo@grandmas',
      contentDisposition: 'inline',
    },
  ];
};

const buildEmailLogoHtml = () => {
  if (readLogoPngBuffer()) {
    return (
      '<div style="margin:0 0 20px 0;text-align:center">' +
      '<img src="cid:brand-logo@grandmas" alt="Grandma\'s Liquors" width="140" style="display:block;margin:0 auto;max-width:140px;width:140px;height:auto;border:0;outline:none;text-decoration:none" />' +
      '</div>'
    );
  }
  const dataUri = getLogoDataUri();
  return (
    '<div style="margin:0 0 20px 0;text-align:center">' +
    '<img src="' +
    dataUri +
    '" alt="Grandma\'s Liquors" width="120" style="display:block;margin:0 auto;max-width:120px;height:auto;border-radius:10px" />' +
    '</div>'
  );
};

const createTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  if (hasSmtpConfig()) {
    cachedTransporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
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
  const fromAddress = config.mail.from || config.mail.user;
  const toAddress = message.to;
  const logoAttachments = getLogoAttachments();
  const existingAttachments = Array.isArray(message.attachments) ? message.attachments : [];
  const prioritizedMessage = {
    ...message,
    from: message.from || fromAddress,
    priority: 'high',
    attachments: [...existingAttachments, ...logoAttachments],
    headers: {
      ...PRIORITY_HEADERS,
      ...(message?.headers || {}),
    },
  };
  if (!prioritizedMessage.from) {
    throw new Error('Remitente de correo no configurado (MAIL_FROM / MAIL_USER)');
  }
  try {
    const result = await transporter.sendMail(prioritizedMessage);
    if (cachedTransporterMode === 'json') {
      console.warn(
        `[mail] (${label}) NO ENVIADO (jsonTransport activo). Destinatario: ${prioritizedMessage.to}. ` +
          'Configura MAIL_* en backend/.env para entregar correos reales.'
      );
    } else {
      console.log(
        `[mail] (${label}) Enviado a ${prioritizedMessage.to} (messageId=${result?.messageId || 'n/d'})`
      );
    }
    return result;
  } catch (error) {
    console.error(
      `[mail] (${label}) Fallo al enviar a ${prioritizedMessage.to}: ${error?.message || error}`
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
  const statusLabel = String(estado || '').trim() || 'Actualizado';
  const isInactive = statusLabel.toLowerCase() === 'inactivo';
  const title = isInactive ? 'Cuenta inactivada' : 'Estado de cuenta actualizado';
  const inner = `
    <p style="margin:0 0 12px 0">Hola <strong>${String(name || '').trim() || 'usuario'}</strong>,</p>
    <p style="margin:0 0 12px 0">
      ${
        isInactive
          ? 'Le informamos que su cuenta en <strong>Grandma\'s Liquors</strong> fue inactivada.'
          : 'El estado de su cuenta en <strong>Grandma\'s Liquors</strong> fue actualizado.'
      }
    </p>
    <p style="margin:0 0 8px 0"><strong>Nuevo estado:</strong> ${escapeHtml(statusLabel)}</p>
    <ul style="margin:0;padding-left:20px;color:#334155">
      ${changedBy ? `<li style="margin:6px 0"><strong>Registrado por:</strong> ${escapeHtml(changedBy)}</li>` : ''}
      ${motivo ? `<li style="margin:6px 0"><strong>Motivo:</strong> ${escapeHtml(motivo)}</li>` : ''}
    </ul>
    <p style="margin:16px 0 0 0">
      ${
        isInactive
          ? 'Si necesita más información o considera que hubo un error, comuníquese con los administradores de la aplicación.'
          : 'Si no reconoce este cambio, contacte de inmediato al administrador.'
      }
    </p>
  `;
  const message = {
    from: config.mail.from,
    to,
    subject: isInactive
      ? "Grandma's Liquors — Cuenta inactivada"
      : "Grandma's Liquors — Estado de cuenta actualizado",
    text: [
      `Hola ${name || ''}`.trim(),
      '',
      isInactive
        ? 'Su cuenta en Grandma\'s Liquors fue inactivada.'
        : `El estado de su cuenta fue actualizado a: ${statusLabel}`,
      changedBy ? `Realizado por: ${changedBy}` : null,
      motivo ? `Motivo: ${motivo}` : null,
      '',
      isInactive
        ? 'Si necesita más información, contacte a los administradores de la aplicación.'
        : 'Si no reconoce este cambio, contacte al administrador.',
    ]
      .filter(Boolean)
      .join('\n'),
    html: wrapBrandedHtml(title, inner),
  };

  return sendWithLogging(message, 'statusChange');
};

const sendAccountDeletedNotification = async ({ to, name, motivo, changedBy, accountType = 'cuenta' }) => {
  const safeName = String(name || '').trim() || 'usuario';
  const safeAccountType = String(accountType || 'cuenta').trim().toLowerCase();
  const inner = `
    <p style="margin:0 0 12px 0">Hola <strong>${escapeHtml(safeName)}</strong>,</p>
    <p style="margin:0 0 12px 0">
      Le informamos que su ${escapeHtml(safeAccountType)} en <strong>Grandma's Liquors</strong> fue eliminada del sistema.
    </p>
    <ul style="margin:0;padding-left:20px;color:#334155">
      ${changedBy ? `<li style="margin:6px 0"><strong>Registrado por:</strong> ${escapeHtml(changedBy)}</li>` : ''}
      ${motivo ? `<li style="margin:6px 0"><strong>Motivo:</strong> ${escapeHtml(motivo)}</li>` : ''}
    </ul>
    <p style="margin:16px 0 0 0">
      Si no reconoce esta acción o necesita más información, contacte de inmediato al administrador.
    </p>
  `;
  const message = {
    from: config.mail.from,
    to,
    subject: "Grandma's Liquors — Notificación de eliminación de cuenta",
    text: [
      `Hola ${safeName},`,
      '',
      `Su ${safeAccountType} en Grandma's Liquors fue eliminada del sistema.`,
      changedBy ? `Registrado por: ${changedBy}` : null,
      motivo ? `Motivo: ${motivo}` : null,
      '',
      'Si no reconoce esta acción, contacte al administrador.',
    ]
      .filter(Boolean)
      .join('\n'),
    html: wrapBrandedHtml('Cuenta eliminada', inner),
  };

  return sendWithLogging(message, 'accountDeleted');
};

const formatMoneyCop = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '$ 0 COP';
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount);
  return `$ ${formatted} COP`;
};

/** Mismo formato que Pedidos.tsx / Abonos.tsx (Intl currency COP). */
const formatCurrency = (value) => {
  const amount = Number(value || 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(safe);
};

const formatEntityCode = (prefix, value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return `${prefix}000`;
  }
  return `${prefix}${String(Math.trunc(numericValue)).padStart(3, '0')}`;
};

const formatDateOnly = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.split('T')[0] || raw;
};

const metodoPagoUi = (value) => {
  const t = String(value || '').trim().toLowerCase();
  if (t === 'transferencia') return 'transferencia';
  return 'efectivo';
};

const pedidoEstadoUi = (value) => {
  const t = String(value || '').trim().toLowerCase();
  if (!t) return 'pendiente';
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('complet')) return 'completado';
  if (t.includes('proceso')) return 'en proceso';
  if (t.includes('pendiente')) return 'pendiente';
  return 'pendiente';
};

const pedidoEstadoPdfLabel = (estadoUi) => {
  if (estadoUi === 'completado') return 'Completado';
  if (estadoUi === 'en proceso') return 'En Proceso';
  if (estadoUi === 'pendiente') return 'Pendiente';
  return 'Cancelado';
};

const abonoEstadoUi = (value) => {
  const t = String(value || '').trim().toLowerCase();
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('finaliz')) return 'finalizado';
  if (t.includes('aplic')) return 'aplicado';
  if (t.includes('verific')) return 'verificado';
  return 'registrado';
};

const labelEstadoAbonoPdf = (estadoUi) => {
  if (estadoUi === 'verificado') return 'Verificado';
  if (estadoUi === 'cancelado') return 'Cancelado';
  if (estadoUi === 'aplicado') return 'Aplicado';
  if (estadoUi === 'finalizado') return 'Finalizado';
  return 'Registrado';
};

/**
 * Plantilla HTML idéntica a buildPrintablePdfHtml en frontend/src/app/components/DataTable.tsx
 * (misma estructura que la acción «Ver PDF» del pedido y del abono).
 */
const buildPrintablePdfHtml = (opts, options = {}) => {
  const logoUrl = options.logoUrl || getLogoDataUri();
  const includeToolbar = options.includeToolbar !== false;

  const logoHeader = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0">
    <img src="${logoUrl}" alt="Grandma's Liquors" width="56" height="56" style="border-radius:10px;object-fit:contain" onerror="this.style.display='none'" />
    <div>
      <p style="margin:0;font-size:11px;color:#64748b;letter-spacing:.04em;text-transform:uppercase">Grandma's Liquors</p>
      <p style="margin:2px 0 0 0;font-size:13px;color:#475569">Comprobante oficial</p>
    </div>
  </div>`;

  const sectionsHtml = (opts.sections || [])
    .map((sec) => {
      const head = sec.title
        ? `<h3 style="margin:0 0 8px 0;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px">${escapeHtml(
            sec.title
          )}</h3>`
        : '';
      const rowsHtml = (sec.rows || [])
        .map(
          (r) =>
            `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px dashed #f1f5f9"><span style="color:#475569">${escapeHtml(
              r.label
            )}</span><strong style="color:#0f172a;text-align:right">${escapeHtml(
              r.value
            )}</strong></div>`
        )
        .join('');
      const textHtml = sec.text
        ? `<p style="margin:8px 0;color:#334155;white-space:pre-line">${escapeHtml(sec.text)}</p>`
        : '';
      const tableHtml = sec.table
        ? `<table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr>${sec.table.headers
            .map(
              (h) =>
                `<th style="text-align:left;padding:6px;border-bottom:2px solid #cbd5e1;background:#f8fafc;color:#334155">${escapeHtml(
                  h
                )}</th>`
            )
            .join('')}</tr></thead><tbody>${sec.table.rows
            .map(
              (row) =>
                `<tr>${row
                  .map(
                    (cell) =>
                      `<td style="padding:6px;border-bottom:1px solid #e2e8f0;color:#0f172a">${escapeHtml(
                        cell
                      )}</td>`
                  )
                  .join('')}</tr>`
            )
            .join('')}</tbody></table>`
        : '';
      return `<section style="margin:18px 0">${head}${rowsHtml}${textHtml}${tableHtml}</section>`;
    })
    .join('');

  const toolbarHtml = includeToolbar
    ? `<div class="toolbar">
  <button onclick="window.close()">Cerrar</button>
  <button class="primary" onclick="window.print()">Descargar PDF</button>
</div>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>${escapeHtml(opts.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}
  .toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;background:#ffffffee;border-bottom:1px solid #e2e8f0;backdrop-filter:blur(6px);z-index:10}
  .toolbar button{cursor:pointer;border:1px solid #cbd5e1;background:#ffffff;border-radius:8px;padding:8px 16px;font-size:14px;color:#0f172a}
  .toolbar button.primary{background:#0f172a;color:#ffffff;border-color:#0f172a}
  .page{max-width:780px;margin:24px auto;padding:32px;background:#ffffff;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06)}
  h1{margin:0 0 4px 0;font-size:20px}
  .sub{color:#64748b;margin:0 0 16px 0;font-size:13px}
  .footer{margin-top:24px;color:#94a3b8;font-size:12px;border-top:1px dashed #e2e8f0;padding-top:12px}
  @media print{
    .toolbar{display:none}
    body{background:#ffffff}
    .page{box-shadow:none;border-radius:0;margin:0;max-width:100%}
  }
</style>
</head><body>
${toolbarHtml}
<div class="page">
  ${logoHeader}
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''}
  ${sectionsHtml}
  ${opts.footer ? `<p class="footer">${escapeHtml(opts.footer)}</p>` : ''}
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus()}catch(e){}},200)});</script>
</body></html>`;
};

/** Convierte el HTML imprimible (igual que «Ver PDF») a PDF binario mediante Chromium. */
const htmlToPdfBuffer = async (html) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
};

const buildPedidoReportOpts = ({
  pedidoId,
  clienteNombre,
  clienteDocumento,
  fechaPedido,
  fechaEntrega,
  direccion,
  telefono,
  metodoPago,
  estado,
  esquemaAbono,
  productos,
  total,
  montoAbonado,
}) => {
  const lineas = Array.isArray(productos) ? productos : [];
  const totalNum = Number(total || 0);
  const montoAbonadoNum = Number(montoAbonado || 0);
  const porcentajeAbono = String(esquemaAbono || '').includes('50') ? 50 : 100;
  const estadoUi = pedidoEstadoUi(estado);

  return {
    title: `Pedido ${formatEntityCode('P', pedidoId)}`,
    subtitle: `Generado el ${new Date().toLocaleString('es-CO')}`,
    sections: [
      {
        title: 'Datos generales',
        rows: [
          { label: 'Cliente', value: clienteNombre || 'N/D' },
          ...(clienteDocumento ? [{ label: 'Documento cliente', value: clienteDocumento }] : []),
          { label: 'Fecha del pedido', value: formatDateOnly(fechaPedido) },
          { label: 'Fecha de entrega', value: formatDateOnly(fechaEntrega) },
          { label: 'Dirección de entrega', value: direccion || 'No especificada' },
          { label: 'Teléfono de contacto', value: telefono || 'No especificado' },
          { label: 'Método de pago', value: metodoPagoUi(metodoPago) },
          { label: 'Estado', value: pedidoEstadoPdfLabel(estadoUi) },
        ],
      },
      {
        title: 'Productos',
        table: {
          headers: ['Producto', 'Cantidad', 'Precio unit.', 'Subtotal'],
          rows: lineas.map((item, index) => {
            const nombre = String(item?.nombre || '').trim() || `Producto ${item?.productoId ?? index + 1}`;
            const cantidad = Number(item?.cantidad || 0);
            const precioUnitario = Number(item?.precioUnitario ?? item?.precio ?? 0);
            const subtotal = Number(
              item?.subtotal ?? (Number.isFinite(precioUnitario) ? precioUnitario * cantidad : 0)
            );
            return [nombre, cantidad, formatCurrency(precioUnitario), formatCurrency(subtotal)];
          }),
        },
      },
      {
        title: 'Totales y abono',
        rows: [
          { label: 'Total', value: formatCurrency(totalNum) },
          {
            label: 'Abono',
            value: `${porcentajeAbono}% (${formatCurrency(montoAbonadoNum)})`,
          },
          {
            label: 'Saldo pendiente',
            value: formatCurrency(Math.max(0, totalNum - montoAbonadoNum)),
          },
        ],
      },
    ],
    footer:
      'Comprobante generado por Grandma\u2019s Liquors. Use "Descargar PDF" para guardar o imprimir.',
  };
};

const buildAbonoReportOpts = ({
  abonoId,
  pedidoId,
  clienteNombre,
  fecha,
  metodoPago,
  estado,
  valorTotal,
  montoAbonado,
  porcentajeAbonado,
  detalle,
}) => {
  const totalPedido = Number(valorTotal || 0);
  const monto = Number(montoAbonado || 0);
  const pctRaw = Number(porcentajeAbonado ?? NaN);
  const pct =
    Number.isFinite(pctRaw) && pctRaw > 0
      ? Math.round(pctRaw)
      : totalPedido > 0 && monto >= 0
        ? Math.round((monto / totalPedido) * 100)
        : 0;
  const estadoUi = abonoEstadoUi(estado);
  const pedidoLabel = pedidoId ? formatEntityCode('P', pedidoId) : 'N/D';

  return {
    title: `Abono ${formatEntityCode('A', abonoId)}`,
    subtitle: `Generado el ${new Date().toLocaleString('es-CO')}`,
    sections: [
      {
        title: 'Datos generales',
        rows: [
          { label: 'Pedido', value: pedidoLabel },
          { label: 'Cliente', value: clienteNombre || 'Desconocido' },
          { label: 'Fecha', value: formatDateOnly(fecha) },
          { label: 'Método de pago', value: metodoPagoUi(metodoPago) },
          { label: 'Estado', value: labelEstadoAbonoPdf(estadoUi) },
        ],
      },
      {
        title: 'Importes',
        rows: [
          { label: 'Valor total del pedido', value: formatCurrency(totalPedido) },
          { label: 'Monto abonado', value: formatCurrency(monto) },
          { label: 'Porcentaje abonado', value: `${pct}%` },
          {
            label: 'Saldo pendiente',
            value: formatCurrency(Math.max(0, totalPedido - monto)),
          },
        ],
      },
      ...(detalle
        ? [
            {
              title: 'Detalles del abono (consolidado)',
              text: String(detalle),
            },
          ]
        : []),
    ],
    footer:
      'Comprobante generado por Grandma\u2019s Liquors. Use "Descargar PDF" para guardar o imprimir.',
  };
};

const buildPedidoPdfBuffer = async (data) => {
  const html = buildPrintablePdfHtml(buildPedidoReportOpts(data), { logoUrl: getLogoDataUri() });
  return htmlToPdfBuffer(html);
};

const buildAbonoPdfBuffer = async (data) => {
  const html = buildPrintablePdfHtml(buildAbonoReportOpts(data), { logoUrl: getLogoDataUri() });
  return htmlToPdfBuffer(html);
};

const formatFechaCorreo = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'N/D';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return raw.split('T')[0] || raw;
};

const sendPedidoCreatedEmail = async ({
  to,
  clienteNombre,
  numeroPedido,
  pedidoId,
  clienteDocumento,
  fechaPedido,
  fechaEntrega,
  estado,
  metodoPago,
  esquemaAbono,
  total,
  montoAbonado,
  saldoPendiente,
  direccion,
  telefono,
  detalles,
  productos = [],
  abono = null,
}) => {
  const safeName = String(clienteNombre || '').trim() || 'cliente';
  const safePedido = String(numeroPedido || '').trim() || 'N/D';
  const safeFechaPedido = formatFechaCorreo(fechaPedido);
  const safeFechaEntrega = formatFechaCorreo(fechaEntrega);
  const safeEstado = String(estado || '').trim() || 'Pendiente';
  const safeMetodoPago = String(metodoPago || '').trim() || 'Efectivo';
  const safeEsquemaAbono = String(esquemaAbono || '').trim() || '100%';
  const safeDireccion = String(direccion || '').trim() || 'Sin dirección registrada';
  const safeTelefono = String(telefono || '').trim() || 'Sin teléfono registrado';
  const safeDetalles = String(detalles || '').trim();
  const lineas = Array.isArray(productos) ? productos : [];
  const totalNum = Number(total || 0);
  const montoAbonadoNum = Number(montoAbonado ?? 0);
  const saldoNum = Number.isFinite(Number(saldoPendiente))
    ? Number(saldoPendiente)
    : Math.max(0, totalNum - montoAbonadoNum);

  const productosText = lineas.length
    ? lineas
        .map((item, index) => {
          const nombre = String(item?.nombre || '').trim() || `Producto #${index + 1}`;
          const cantidad = Number(item?.cantidad || 0);
          const precioUnitario = Number(item?.precioUnitario ?? item?.precio ?? 0);
          const subtotal = Number(
            item?.subtotal ?? (Number.isFinite(precioUnitario) ? precioUnitario * cantidad : 0)
          );
          return `${index + 1}. ${nombre} | Cant: ${cantidad} | Unit: ${formatMoneyCop(
            precioUnitario
          )} | Subtotal: ${formatMoneyCop(subtotal)}`;
        })
        .join('\n')
    : 'Sin productos detallados.';

  const productosHtml = lineas.length
    ? lineas
        .map((item, index) => {
          const nombre = String(item?.nombre || '').trim() || `Producto #${index + 1}`;
          const cantidad = Number(item?.cantidad || 0);
          const precioUnitario = Number(item?.precioUnitario ?? item?.precio ?? 0);
          const subtotal = Number(
            item?.subtotal ?? (Number.isFinite(precioUnitario) ? precioUnitario * cantidad : 0)
          );
          return `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0">${index + 1}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(nombre)}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${cantidad}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(
                formatMoneyCop(precioUnitario)
              )}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(
                formatMoneyCop(subtotal)
              )}</td>
            </tr>
          `;
        })
        .join('')
    : '<tr><td colspan="5" style="padding:8px;color:#64748b">Sin productos detallados.</td></tr>';

  const inner = `
    <p style="margin:0 0 12px 0">Hola <strong>${escapeHtml(safeName)}</strong>,</p>
    <p style="margin:0 0 12px 0">
      Su pedido fue creado correctamente en <strong>Grandma's Liquors</strong>. A continuación encontrará el resumen completo:
    </p>
    <ul style="margin:0;padding-left:20px;color:#334155">
      <li style="margin:6px 0"><strong>Pedido:</strong> ${escapeHtml(safePedido)}</li>
      <li style="margin:6px 0"><strong>Fecha del pedido:</strong> ${escapeHtml(safeFechaPedido)}</li>
      <li style="margin:6px 0"><strong>Fecha de entrega:</strong> ${escapeHtml(safeFechaEntrega)}</li>
      <li style="margin:6px 0"><strong>Estado:</strong> ${escapeHtml(safeEstado)}</li>
      <li style="margin:6px 0"><strong>Método de pago:</strong> ${escapeHtml(safeMetodoPago)}</li>
      <li style="margin:6px 0"><strong>Esquema de abono:</strong> ${escapeHtml(safeEsquemaAbono)}</li>
      <li style="margin:6px 0"><strong>Total del pedido:</strong> ${escapeHtml(formatMoneyCop(totalNum))}</li>
      <li style="margin:6px 0"><strong>Monto abonado:</strong> ${escapeHtml(formatMoneyCop(montoAbonadoNum))}</li>
      <li style="margin:6px 0"><strong>Saldo pendiente:</strong> ${escapeHtml(formatMoneyCop(saldoNum))}</li>
      <li style="margin:6px 0"><strong>Dirección de entrega:</strong> ${escapeHtml(safeDireccion)}</li>
      <li style="margin:6px 0"><strong>Teléfono de contacto:</strong> ${escapeHtml(safeTelefono)}</li>
      ${
        safeDetalles
          ? `<li style="margin:6px 0"><strong>Observaciones:</strong> ${escapeHtml(safeDetalles)}</li>`
          : ''
      }
    </ul>

    <h2 style="margin:18px 0 10px 0;font-size:16px;color:#0f172a">Productos del pedido</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f8fafc;color:#0f172a">
          <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">#</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Producto</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Cantidad</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Precio</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${productosHtml}
      </tbody>
    </table>
  `;

  const text = [
    `Hola ${safeName},`,
    '',
    'Su pedido fue creado correctamente en Grandma\'s Liquors.',
    '',
    `Pedido: ${safePedido}`,
    `Fecha del pedido: ${safeFechaPedido}`,
    `Fecha de entrega: ${safeFechaEntrega}`,
    `Estado: ${safeEstado}`,
    `Método de pago: ${safeMetodoPago}`,
    `Esquema de abono: ${safeEsquemaAbono}`,
    `Total del pedido: ${formatMoneyCop(totalNum)}`,
    `Monto abonado: ${formatMoneyCop(montoAbonadoNum)}`,
    `Saldo pendiente: ${formatMoneyCop(saldoNum)}`,
    `Dirección de entrega: ${safeDireccion}`,
    `Teléfono de contacto: ${safeTelefono}`,
    safeDetalles ? `Observaciones: ${safeDetalles}` : null,
    '',
    'Adjuntos: comprobante PDF del pedido (y del abono si aplica), idéntico al de la acción «Ver PDF» en el sistema.',
    '',
    'Productos:',
    productosText,
  ]
    .filter(Boolean)
    .join('\n');

  const porcentajeAbonoNum =
    String(safeEsquemaAbono).trim() === '50%' ? 50 : String(safeEsquemaAbono).trim() === '100%' ? 100 : 0;

  const pedidoCode = formatEntityCode('P', pedidoId);
  let pedidoPdfBuffer;
  let abonoPdfBuffer;
  try {
    pedidoPdfBuffer = await buildPedidoPdfBuffer({
      pedidoId,
      clienteNombre: safeName,
      clienteDocumento,
      fechaPedido,
      fechaEntrega,
      direccion: safeDireccion,
      telefono: safeTelefono,
      metodoPago: safeMetodoPago,
      estado: safeEstado,
      esquemaAbono: safeEsquemaAbono,
      productos: lineas,
      total: totalNum,
      montoAbonado: montoAbonadoNum,
    });
  } catch (pdfError) {
    console.error('[mail] No se pudo generar PDF de pedido para correo:', pdfError?.message || pdfError);
    throw new Error('No se pudo generar el comprobante PDF del pedido para el correo de confirmación.');
  }

  const attachments = [
    {
      filename: `Pedido-${pedidoCode}.pdf`,
      content: pedidoPdfBuffer,
      contentType: 'application/pdf',
    },
  ];

  if (abono && Number(abono.monto) > 0 && abono.id) {
    try {
      abonoPdfBuffer = await buildAbonoPdfBuffer({
        abonoId: abono.id,
        pedidoId,
        clienteNombre: safeName,
        fecha: abono.fecha,
        metodoPago: abono.metodo_pago || safeMetodoPago,
        estado: abono.estado,
        valorTotal: totalNum,
        montoAbonado: abono.monto,
        porcentajeAbonado: abono.porcentaje_abonado ?? porcentajeAbonoNum,
        detalle: abono.detalle,
      });
      attachments.push({
        filename: `Abono-${formatEntityCode('A', abono.id)}.pdf`,
        content: abonoPdfBuffer,
        contentType: 'application/pdf',
      });
    } catch (pdfError) {
      console.error('[mail] No se pudo generar PDF de abono para correo:', pdfError?.message || pdfError);
      throw new Error('No se pudo generar el comprobante PDF del abono para el correo de confirmación.');
    }
  }

  return sendWithLogging(
    {
      from: config.mail.from,
      to,
      subject: `Grandma's Liquors — Confirmación de pedido ${safePedido}`,
      text,
      html: wrapBrandedHtml('Confirmación de pedido', inner),
      attachments,
    },
    'pedidoCreated'
  );
};

module.exports = {
  sendTemporaryPasswordEmail,
  sendEmailChangeNotification,
  sendPasswordChangeNotification,
  sendUserStatusChangeNotification,
  sendAccountDeletedNotification,
  sendWelcomeEmail,
  sendPedidoCreatedEmail,
};
