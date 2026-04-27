const models = require('../models/entities.models');

const isClienteUser = (req) => String(req.user?.rol || '').trim() === 'Cliente';

const getOwnClienteId = (req) => {
  const raw = req.user?.cliente_id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const forbidden = (res, message = 'No autorizado') =>
  res.status(403).json({ success: false, message });

const assertOwnClienteParam = (req, res, clienteIdFromParam) => {
  if (!isClienteUser(req)) return null;
  const own = getOwnClienteId(req);
  if (!own) return forbidden(res, 'Perfil cliente no vinculado');
  const requested = Number(clienteIdFromParam);
  if (!Number.isFinite(requested) || requested !== own) {
    return forbidden(res);
  }
  return null;
};

const assertOwnPedidoId = async (req, res, pedidoId) => {
  if (!isClienteUser(req)) return null;
  const own = getOwnClienteId(req);
  if (!own) return forbidden(res, 'Perfil cliente no vinculado');
  const pedido = await models.Pedidos.getById(pedidoId);
  if (!pedido) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
  if (Number(pedido.cliente_id) !== own) return forbidden(res);
  return null;
};

const assertOwnVentaId = async (req, res, ventaId) => {
  if (!isClienteUser(req)) return null;
  const own = getOwnClienteId(req);
  if (!own) return forbidden(res, 'Perfil cliente no vinculado');
  const venta = await models.Ventas.getById(ventaId);
  if (!venta) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
  if (!venta.cliente_id || Number(venta.cliente_id) !== own) return forbidden(res);
  return null;
};

const assertOwnDomicilioId = async (req, res, domicilioId) => {
  if (!isClienteUser(req)) return null;
  const own = getOwnClienteId(req);
  if (!own) return forbidden(res, 'Perfil cliente no vinculado');
  const domicilio = await models.Domicilios.getById(domicilioId);
  if (!domicilio) return res.status(404).json({ success: false, message: 'Domicilio no encontrado' });
  if (Number(domicilio.cliente_id) !== own) return forbidden(res);
  return null;
};

module.exports = {
  isClienteUser,
  getOwnClienteId,
  assertOwnClienteParam,
  assertOwnPedidoId,
  assertOwnVentaId,
  assertOwnDomicilioId,
};
