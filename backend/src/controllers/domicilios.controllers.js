const models = require('../models/entities.models');
const {
  isClienteUser,
  assertOwnClienteParam,
  assertOwnDomicilioId,
  assertOwnPedidoId,
} = require('../utils/selfServiceAccess');

const normalizeEstado = (value) => String(value || '').trim().toLowerCase();

const buildVentaNumber = () => `VEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const ensureVentaForDeliveredDomicilio = async (domicilioId) => {
  try {
    const domicilio = await models.Domicilios.getById(domicilioId);
    if (!domicilio) return;
    if (normalizeEstado(domicilio.estado) !== 'entregado') return;

    const pedido = await models.Pedidos.getById(domicilio.pedido_id);
    if (!pedido) return;

    const ventaExistente = await models.Ventas.getByPedido(domicilio.pedido_id);
    if (ventaExistente?.id) return;

    const ventaId = await models.Ventas.create({
      numero_venta: buildVentaNumber(),
      tipo: 'Por Pedido',
      cliente_id: pedido.cliente_id,
      pedido_id: pedido.id,
      fecha: new Date().toISOString().split('T')[0],
      metodopago: 'Contraentrega',
      total: Number(pedido.total || 0),
      estado: 'Pendiente', // ✅ CORRECTO: Venta inicia en Pendiente, no Completada
    });

    const detalles = await models.Pedidos.getDetalles(pedido.id);
    await Promise.all(
      (Array.isArray(detalles) ? detalles : []).map((item) =>
        models.Ventas.addDetalle(
          ventaId,
          Number(item.producto_id),
          Number(item.cantidad || 0),
          Number(item.precio_unitario || 0)
        )
      )
    );
  } catch (error) {
    console.error('Error creando venta automática desde domicilio entregado:', error.message);
    // No lanzar error para no afectar el flujo del domicilio
  }
};

module.exports = {
  getAll: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const domicilios = await models.Domicilios.getAll();
      return res.json({ success: true, data: domicilios });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getByCliente: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.clienteId);
      if (denied) return denied;

      const domicilios = await models.Domicilios.getByCliente(req.params.clienteId);
      return res.json({ success: true, data: domicilios });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const denied = await assertOwnDomicilioId(req, res, req.params.id);
      if (denied) return denied;

      const domicilio = await models.Domicilios.getById(req.params.id);
      if (!domicilio) return res.status(404).json({ success: false, message: 'Domicilio no encontrado' });
      return res.json({ success: true, data: domicilio });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getByPedido: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        const denied = await assertOwnPedidoId(req, res, req.params.pedidoId);
        if (denied) return denied;
      }
      const domicilio = await models.Domicilios.getByPedido(req.params.pedidoId);
      return res.json({ success: true, data: domicilio });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const id = await models.Domicilios.create(req.body);
      return res.status(201).json({ success: true, id, message: 'Domicilio creado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      await models.Domicilios.update(req.params.id, req.body);
      await ensureVentaForDeliveredDomicilio(req.params.id);
      return res.json({ success: true, message: 'Domicilio actualizado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      await models.Domicilios.delete(req.params.id);
      return res.json({ success: true, message: 'Domicilio eliminado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
