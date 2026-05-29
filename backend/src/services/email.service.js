const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
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
  if (!Number.isFinite(amount)) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
};

const sendPedidoCreatedEmail = async ({
  to,
  clienteNombre,
  numeroPedido,
  fechaPedido,
  fechaEntrega,
  estado,
  metodoPago,
  esquemaAbono,
  total,
  direccion,
  telefono,
  detalles,
  productos = [],
}) => {
  const safeName = String(clienteNombre || '').trim() || 'cliente';
  const safePedido = String(numeroPedido || '').trim() || 'N/D';
  const safeFechaPedido = String(fechaPedido || '').trim() || 'N/D';
  const safeFechaEntrega = String(fechaEntrega || '').trim() || 'N/D';
  const safeEstado = String(estado || '').trim() || 'Pendiente';
  const safeMetodoPago = String(metodoPago || '').trim() || 'Efectivo';
  const safeEsquemaAbono = String(esquemaAbono || '').trim() || '100%';
  const safeDireccion = String(direccion || '').trim() || 'Sin dirección registrada';
  const safeTelefono = String(telefono || '').trim() || 'Sin teléfono registrado';
  const safeDetalles = String(detalles || '').trim();
  const lineas = Array.isArray(productos) ? productos : [];

  const productosText = lineas.length
    ? lineas
        .map((item, index) => {
          const nombre = String(item?.nombre || '').trim() || `Producto #${index + 1}`;
          const cantidad = Number(item?.cantidad || 0);
          const precioUnitario = Number(item?.precioUnitario || 0);
          const subtotal = Number(item?.subtotal || precioUnitario * cantidad);
          return `${index + 1}. ${nombre} | Cantidad: ${cantidad} | Precio: ${formatMoneyCop(
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
          const precioUnitario = Number(item?.precioUnitario || 0);
          const subtotal = Number(item?.subtotal || precioUnitario * cantidad);
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
      <li style="margin:6px 0"><strong>Total:</strong> ${escapeHtml(formatMoneyCop(total))}</li>
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
    `Total: ${formatMoneyCop(total)}`,
    `Dirección de entrega: ${safeDireccion}`,
    `Teléfono de contacto: ${safeTelefono}`,
    safeDetalles ? `Observaciones: ${safeDetalles}` : null,
    '',
    'Productos:',
    productosText,
  ]
    .filter(Boolean)
    .join('\n');

  return sendWithLogging(
    {
      from: config.mail.from,
      to,
      subject: `Grandma's Liquors — Confirmación de pedido ${safePedido}`,
      text,
      html: wrapBrandedHtml('Confirmación de pedido', inner),
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
