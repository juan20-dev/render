const models = require('../models/entities.models');
const { normalizeVentaPayload } = require('./normalizador-http');
const { isClienteUser, assertOwnClienteParam, assertOwnVentaId } = require('../utils/selfServiceAccess');

module.exports = {
  getAll: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const ventas = await models.Ventas.getAll();
      return res.json({ success: true, data: ventas });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getByCliente: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.clienteId);
      if (denied) return denied;

      const filters = {
        numero_venta: req.query?.numero_venta,
        fecha_desde: req.query?.fecha_desde,
        fecha_hasta: req.query?.fecha_hasta,
      };
      const ventas = await models.Ventas.getByCliente(req.params.clienteId, filters);
      return res.json({ success: true, data: ventas });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const denied = await assertOwnVentaId(req, res, req.params.id);
      if (denied) return denied;

      const venta = await models.Ventas.getById(req.params.id);
      if (!venta) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
      const detalles = await models.Ventas.getDetalles(req.params.id);
      return res.json({ success: true, data: { ...venta, detalles } });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const normalized = normalizeVentaPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const id = await models.Ventas.create(normalized.data);
      return res.status(201).json({ success: true, id, message: 'Venta creada exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  addProducto: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const { ventaId, productoId, cantidad, precioUnitario } = req.body;
      await models.Ventas.addDetalle(ventaId, productoId, cantidad, precioUnitario);
      return res.status(201).json({ success: true, message: 'Producto agregado a la venta' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const normalized = normalizeVentaPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      await models.Ventas.update(req.params.id, normalized.data);
      return res.json({ success: true, message: 'Venta actualizada exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      await models.Ventas.delete(req.params.id);
      return res.json({ success: true, message: 'Venta eliminada exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
