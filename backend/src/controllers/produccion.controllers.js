const models = {
  Produccion: require('../models/produccion/produccion'),
};
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/AppError');

const isProductorUser = (req) => String(req.user?.rol || '').trim().toLowerCase() === 'productor';

const throwIfProductorForbidden = (req) => {
  if (isProductorUser(req)) {
    throw AppError.forbidden();
  }
};

const assertProductorCanViewOrden = (req, productorId) => {
  // Productores solo pueden ver sus propios insumos
  // Admins, Asesores y otros pueden ver insumos de cualquier productor
  if (isProductorUser(req) && Number(productorId) !== Number(req.user.id)) {
    console.warn(`[Auth] Productor ${req.user.id} intentó acceder a insumos de productor ${productorId}`);
    throw AppError.forbidden();
  }
};

const assertProductorOwnsOrden = (req, productorId) => {
  if (isProductorUser(req) && Number(productorId) !== Number(req.user.id)) {
    throw AppError.forbidden();
  }
};

const throwIfModelError = (error) => {
  if (error?.statusCode) {
    const err = new AppError(error.message, error.statusCode, 'BUSINESS_RULE', error.details);
    throw err;
  }
  throw error;
};

exports.getAll = asyncHandler(async (req, res) => {
  const pid = isProductorUser(req) ? req.user.id : null;
  const produccion = await models.Produccion.getAll(pid ? { productorUserId: pid } : {});
  res.json({ success: true, data: produccion });
});

exports.getById = asyncHandler(async (req, res) => {
  const produccion = await models.Produccion.getById(req.params.id);
  if (!produccion) {
    throw AppError.notFound('Registro de produccion no encontrado');
  }
  assertProductorOwnsOrden(req, produccion.productor_id);
  res.json({ success: true, data: produccion });
});

exports.create = asyncHandler(async (req, res) => {
  throwIfProductorForbidden(req);
  try {
    const id = await models.Produccion.create(req.body);
    res.status(201).json({ success: true, id, message: 'Produccion creada exitosamente' });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.update = asyncHandler(async (req, res) => {
  throwIfProductorForbidden(req);
  const produccion = await models.Produccion.getById(req.params.id);
  if (!produccion) {
    throw AppError.notFound('Registro de produccion no encontrado');
  }
  try {
    await models.Produccion.update(req.params.id, req.body);
    res.json({ success: true, message: 'Produccion actualizada exitosamente' });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const produccion = await models.Produccion.getById(req.params.id);
  if (!produccion) {
    throw AppError.notFound('Registro de produccion no encontrado');
  }
  assertProductorOwnsOrden(req, produccion.productor_id);

  const payload = isProductorUser(req)
    ? {
        estado: req.body.estado,
        motivo_cancelacion: req.body.motivo_cancelacion ?? req.body.motivoCancelacion,
      }
    : req.body;

  try {
    const updated = await models.Produccion.updateStatus(req.params.id, payload);
    res.json({ success: true, data: updated, message: 'Estado de produccion actualizado exitosamente' });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.delete = asyncHandler(async (req, res) => {
  throwIfProductorForbidden(req);
  try {
    await models.Produccion.delete(req.params.id);
    res.json({ success: true, message: 'Produccion eliminada exitosamente' });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.getInsumosByProductor = asyncHandler(async (req, res) => {
  const productorId = req.params.productorId;
  console.log(`[getInsumosByProductor] productorId=${productorId}, user.id=${req.user?.id}, user.rol=${req.user?.rol}`);
  assertProductorOwnsOrden(req, productorId);
  const data = await models.Produccion.getInsumosEntregadosByProductor(productorId);
  console.log(`[getInsumosByProductor] Returned ${data.length} entregas`);
  res.json({ success: true, data });
});

exports.getInsumosResumenByProductor = asyncHandler(async (req, res) => {
  const productorId = req.params.productorId;
  console.log(`[getInsumosResumenByProductor] productorId=${productorId}, user.id=${req.user?.id}, user.rol=${req.user?.rol}`);
  assertProductorCanViewOrden(req, productorId);
  
  // Debug: obtener entregas sin filtrar
  const todasLasEntregas = await models.Produccion.getInsumosEntregadosByProductor(productorId);
  console.log(`[getInsumosResumenByProductor] Entregas totales para productor ${productorId}: ${todasLasEntregas.length}`);
  if (todasLasEntregas.length > 0) {
    console.log(`[getInsumosResumenByProductor] Primera entrega:`, JSON.stringify(todasLasEntregas[0]));
  }
  
  const data = await models.Produccion.getInsumosAgregadosByProductor(productorId);
  console.log(`[getInsumosResumenByProductor] Insumos agregados para productor ${productorId}: ${data.length}`);
  if (data.length > 0) {
    console.log(`[getInsumosResumenByProductor] Primero agregado:`, JSON.stringify(data[0]));
  }
  res.json({ success: true, data });
});

exports.sugerirConsumo = asyncHandler(async (req, res) => {
  throwIfProductorForbidden(req);
  const pedidoId = Number(req.body.pedido_id ?? req.body.pedidoId);
  const productorId = Number(req.body.productor_id ?? req.body.productorId);
  try {
    const data = await models.Produccion.sugerirConsumoInsumos(pedidoId, productorId);
    res.json({ success: true, data });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.debugInsumosByProductor = asyncHandler(async (req, res) => {
  const productorId = Number(req.params.productorId);
  if (!Number.isFinite(productorId) || productorId <= 0) {
    throw AppError.badRequest('productorId inválido');
  }
  
  const insumos = await models.Produccion.getInsumosEntregadosByProductor(productorId);
  const agregados = await models.Produccion.getInsumosAgregadosByProductor(productorId);
  
  res.json({ 
    success: true, 
    productorId,
    entregas_totales: insumos.length,
    insumos_agregados: agregados.length,
    entregas_detalle: insumos,
    insumos_resumido: agregados
  });
});
