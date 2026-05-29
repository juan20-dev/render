const TIPO_DOCUMENTO_MAP = {
  cc: 'CC',
  ce: 'CE',
  pp: 'Pasaporte',
  pasaporte: 'Pasaporte',
};

const VENTA_ESTADO_MAP = {
  pendiente: 'Pendiente',
  completada: 'Completada',
  completado: 'Completada',
  cancelada: 'Cancelada',
  cancelado: 'Cancelada',
  anulada: 'Cancelada',
  anulado: 'Cancelada',
};

const ABONO_ESTADO_MAP = {
  registrado: 'Registrado',
  activo: 'Registrado',
  verificado: 'Verificado',
  verificada: 'Verificado',
  aplicado: 'Aplicado',
  aplica: 'Aplicado',
  cancelado: 'Cancelado',
  cancelada: 'Cancelado',
  anulado: 'Cancelado',
  anulada: 'Cancelado',
};

const BASE_ESTADO_MAP = {
  activo: 'Activo',
  activa: 'Activo',
  inactivo: 'Inactivo',
  inactiva: 'Inactivo',
};

const TIPO_PERSONA_MAP = {
  natural: 'Natural',
  juridica: 'Juridica',
  'jurídica': 'Juridica',
};

const parseBooleanValue = (value) => {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  return false;
};

const parseNumberValue = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const METODO_PAGO_MAP = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  'transferencia bancaria': 'Transferencia',
  contraentrega: 'Contraentrega',
  'contra entrega': 'Contraentrega',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
};

const canonicalizeWithMap = (value, map) => {
  if (value === undefined || value === null) return undefined;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  return map[key] || null;
};

const normalizeTipoDocumento = (value) => canonicalizeWithMap(value, TIPO_DOCUMENTO_MAP);

const normalizeProveedorIdentifier = (value) => {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^0-9:\/*,-]/g, '')
    .replace(/([:\/*,-]){2,}/g, '$1')
    .replace(/^[:\/*,-]+|[:\/*,-]+$/g, '');
  return {
    cleaned,
    digits: cleaned.replace(/\D/g, ''),
  };
};

const normalizeMetodoPago = (value) => {
  if (value === undefined || value === null) return undefined;
  return canonicalizeWithMap(String(value), METODO_PAGO_MAP);
};

/** Montos en COP: número o texto con puntos como separador de miles (ej. "2.500.000" → 2500000). */
const MONEY_MAX_COP = 100_000_000;

const parseMoneyCO = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let s = String(value).trim().replace(/\s/g, '');
  if (!s) return undefined;
  const hasCommaAsDecimal = /,\d{1,2}$/.test(s);
  if (hasCommaAsDecimal) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeVentaPayload = (payload = {}) => {
  const data = { ...payload };

  if (payload.total !== undefined) {
    const total = parseMoneyCO(payload.total);
    if (total === undefined) {
      return { error: 'Total de venta invalido. Use un numero o formato COP (ej. 2500000 o 2.500.000).' };
    }
    if (total < 0) {
      return { error: 'Total de venta no puede ser negativo.' };
    }
    if (total > MONEY_MAX_COP) {
      return {
        error: `El total de la venta no puede superar $${MONEY_MAX_COP.toLocaleString('es-CO')} COP.`,
      };
    }
    data.total = total;
  }

  if (payload.estado !== undefined) {
    const estado = canonicalizeWithMap(payload.estado, VENTA_ESTADO_MAP);
    if (!estado) {
      return {
        error: 'Estado de venta invalido. Valores permitidos: Pendiente, Completada, Cancelada.',
      };
    }
    data.estado = estado;
  }

  const rawMetodoPago = payload.metodopago ?? payload.metodoPago ?? payload.metodo_pago;
  if (rawMetodoPago !== undefined) {
    const metodoPago = normalizeMetodoPago(rawMetodoPago);
    if (!metodoPago) {
      return {
        error: 'Metodo de pago invalido. Valores permitidos: Efectivo, Tarjeta, Transferencia, Contraentrega, Nequi, Daviplata.',
      };
    }
    data.metodopago = metodoPago;
    data.metodo_pago = metodoPago;
  }

  return { data };
};

const normalizeAbonoPayload = (payload = {}) => {
  const data = { ...payload };

  if (payload.estado !== undefined) {
    const estado = canonicalizeWithMap(payload.estado, ABONO_ESTADO_MAP);
    if (!estado) {
      return {
        error: 'Estado de abono invalido. Valores permitidos: Registrado, Verificado, Cancelado, Aplicado.',
      };
    }
    data.estado = estado;
  }

  const rawMetodoPago = payload.metodo_pago ?? payload.metodoPago ?? payload.metodopago;
  if (rawMetodoPago !== undefined) {
    const metodoPago = normalizeMetodoPago(rawMetodoPago);
    if (!metodoPago) {
      return {
        error: 'Metodo de pago invalido. Valores permitidos: Efectivo, Tarjeta, Transferencia, Contraentrega, Nequi, Daviplata.',
      };
    }
    data.metodo_pago = metodoPago;
  }

  return { data };
};

const normalizeClientePayload = (payload = {}) => {
  const data = { ...payload };
  if (
    data.documento === undefined &&
    (payload.numeroDocumento !== undefined || payload.numero_documento !== undefined)
  ) {
    data.documento = payload.numeroDocumento ?? payload.numero_documento;
  }
  const rawTipoDocumento = payload.tipoDocumento ?? payload.tipo_documento;

  if (rawTipoDocumento !== undefined) {
    const tipoDocumento = normalizeTipoDocumento(rawTipoDocumento);
    if (!tipoDocumento) {
      return {
        error: 'Tipo de documento invalido. Valores permitidos: CC, CE, Pasaporte.',
      };
    }
    data.tipoDocumento = tipoDocumento;
  }

  if (
    payload.documento !== undefined ||
    payload.numeroDocumento !== undefined ||
    payload.numero_documento !== undefined
  ) {
    const rawDoc = data.documento ?? payload.numeroDocumento ?? payload.numero_documento ?? '';
    const docDigits = String(rawDoc).replace(/\D/g, '');
    if (docDigits.length < 6 || docDigits.length > 12) {
      return {
        error: 'Numero de documento invalido. Debe tener entre 6 y 12 digitos.',
      };
    }
    data.documento = docDigits;
  }

  if (payload.telefono !== undefined) {
    const telefono = String(payload.telefono).replace(/\D/g, '');
    if (telefono.length !== 10) {
      return {
        error: 'Telefono invalido. Debe tener exactamente 10 digitos.',
      };
    }
    data.telefono = telefono;
  }

  return { data };
};

const normalizeAuthRegisterPayload = (payload = {}) => {
  const data = { ...payload };
  const tipoDocumento = normalizeTipoDocumento(payload.tipoDocumento ?? payload.tipo_documento ?? 'CC');

  if (!tipoDocumento) {
    return {
      error: 'Tipo de documento invalido. Valores permitidos: CC, CE, Pasaporte.',
    };
  }

  data.tipoDocumento = tipoDocumento;
  data.documento = payload.documento ?? payload.numeroDocumento;

  const docDigitsReg = String(data.documento ?? '').replace(/\D/g, '');
  if (docDigitsReg.length < 6 || docDigitsReg.length > 12) {
    return {
      error: 'Numero de documento invalido. Debe tener entre 6 y 12 digitos.',
    };
  }
  data.documento = docDigitsReg;

  if (payload.estado !== undefined) {
    const estado = canonicalizeWithMap(payload.estado, BASE_ESTADO_MAP);
    if (!estado) {
      return {
        error: 'Estado invalido. Valores permitidos: Activo, Inactivo.',
      };
    }
    data.estado = estado;
  } else {
    data.estado = 'Activo';
  }

  if (payload.telefono !== undefined) {
    const telefono = String(payload.telefono).replace(/\D/g, '');
    if (telefono.length !== 10) {
      return {
        error: 'Telefono invalido. Debe tener exactamente 10 digitos.',
      };
    }
    data.telefono = telefono;
  }

  return { data };
};

const normalizeUsuarioPayload = (payload = {}) => {
  const data = { ...payload };

  const rawTipoDocumento = payload.tipo_documento ?? payload.tipoDocumento;
  if (rawTipoDocumento !== undefined) {
    const tipoDocumento = normalizeTipoDocumento(rawTipoDocumento);
    if (!tipoDocumento) {
      return {
        error: 'Tipo de documento invalido. Valores permitidos: CC, CE, Pasaporte.',
      };
    }
    data.tipo_documento = tipoDocumento;
  }

  if (payload.estado !== undefined) {
    const estado = canonicalizeWithMap(payload.estado, BASE_ESTADO_MAP);
    if (!estado) {
      return {
        error: 'Estado invalido. Valores permitidos: Activo, Inactivo.',
      };
    }
    data.estado = estado;
  }

  if (payload.telefono !== undefined) {
    const telefono = String(payload.telefono).replace(/\D/g, '');
    if (telefono.length !== 10) {
      return {
        error: 'Telefono invalido. Debe tener exactamente 10 digitos.',
      };
    }
    data.telefono = telefono;
  }

  if (payload.documento !== undefined && payload.documento !== null && String(payload.documento).trim() !== '') {
    const doc = String(payload.documento).replace(/\D/g, '');
    if (doc.length < 6 || doc.length > 12) {
      return {
        error: 'Documento invalido. Debe tener entre 6 y 12 digitos.',
      };
    }
    data.documento = doc;
  }

  return { data };
};

const normalizeProveedorPayload = (payload = {}) => {
  const data = { ...payload };

  const rawTipoDocumento = payload.tipoDocumento ?? payload.tipo_documento;
  if (rawTipoDocumento !== undefined) {
    const tipoDocumento = normalizeTipoDocumento(rawTipoDocumento);
    if (!tipoDocumento) {
      return {
        error: 'Tipo de documento invalido. Valores permitidos: CC, CE, Pasaporte.',
      };
    }
    data.tipoDocumento = tipoDocumento;
  }

  const rawTipoPersona =
    payload.tipoPersona ?? payload.tipo_persona ?? payload.tipo;
  if (rawTipoPersona !== undefined) {
    const tipoPersona = canonicalizeWithMap(String(rawTipoPersona), TIPO_PERSONA_MAP);
    if (!tipoPersona) {
      return {
        error: 'Tipo de persona invalido. Valores permitidos: Natural, Juridica.',
      };
    }
    data.tipoPersona = tipoPersona;
  }

  if (payload.estado !== undefined) {
    const estado = canonicalizeWithMap(payload.estado, BASE_ESTADO_MAP);
    if (!estado) {
      return {
        error: 'Estado invalido. Valores permitidos: Activo, Inactivo.',
      };
    }
    data.estado = estado;
  }

  if (payload.telefono !== undefined) {
    const telefono = String(payload.telefono).replace(/\D/g, '');
    if (telefono.length !== 10) {
      return {
        error: 'Telefono invalido. Debe tener exactamente 10 digitos.',
      };
    }
    data.telefono = telefono;
  }

  if (payload.preferente !== undefined) {
    data.preferente = parseBooleanValue(payload.preferente);
  }

  if (payload.rating !== undefined) {
    const rating = parseNumberValue(payload.rating);
    if (rating === null || rating < 0 || rating > 5) {
      return {
        error: 'Rating invalido. Debe ser un numero entre 0 y 5.',
      };
    }
    data.rating = rating;
  }

  if (payload.observaciones !== undefined) {
    data.observaciones = String(payload.observaciones).trim();
  }

  /* Mapear campos del formulario UI (Proveedores.tsx) al modelo proveedores */
  if (data.tipoPersona) {
    if (data.tipoPersona === 'Juridica') {
      const rzs =
        payload.nombreRazonSocial ?? payload.nombre_razon_social ?? undefined;
      if (rzs !== undefined && rzs !== null && String(rzs).trim()) {
        const trimmed = String(rzs).trim();
        if (
          payload.nombreEmpresa === undefined &&
          payload.nombre_empresa === undefined
        ) {
          data.nombreEmpresa = trimmed;
        }
      }
    } else if (payload.nombre !== undefined || payload.apellido !== undefined) {
      data.nombre = String(payload.nombre ?? '').trim();
      data.apellido = String(payload.apellido ?? '').trim();
    } else {
      const rzs =
        payload.nombreRazonSocial ?? payload.nombre_razon_social ?? undefined;
      if (rzs !== undefined && rzs !== null && String(rzs).trim()) {
        data.nombre = String(rzs).trim();
        data.apellido = '';
      }
    }

    const docRaw =
      payload.nit !== undefined && payload.nit !== null
        ? String(payload.nit).trim()
        : '';
    if (docRaw) {
      const { cleaned: formattedIdentifier, digits: docDigits } = normalizeProveedorIdentifier(docRaw);
      if (docDigits.length < 6 || docDigits.length > 15) {
        return {
          error: 'El NIT/Documento debe tener entre 6 y 15 digitos.',
        };
      }
      if (data.tipoPersona === 'Juridica') {
        data.nit = formattedIdentifier;
      } else {
        data.numeroDocumento = docDigits;
        data.nit = null;
      }
    }

    if (
      data.tipoPersona === 'Natural' &&
      data.tipoDocumento === undefined &&
      payload.tipoDocumento === undefined &&
      payload.tipo_documento === undefined
    ) {
      data.tipoDocumento = 'CC';
    }
  }

  delete data.tipo;
  delete data.nombreRazonSocial;
  delete data.nombre_razon_social;

  return { data };
};

module.exports = {
  normalizeTipoDocumento,
  normalizeMetodoPago,
  parseMoneyCO,
  normalizeVentaPayload,
  normalizeAbonoPayload,
  normalizeClientePayload,
  normalizeAuthRegisterPayload,
  normalizeUsuarioPayload,
  normalizeProveedorPayload,
};
