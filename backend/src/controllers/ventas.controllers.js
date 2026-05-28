// Rewire: el modelo Ventas viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Ventas: require('../models/ventas/ventas'),
};
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
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
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

      const { items: itemsRaw, ...ventaPayload } = req.body || {};
      const normalized = normalizeVentaPayload(ventaPayload);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      let id;
      if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
        id = await models.Ventas.createCompleta(normalized.data, itemsRaw);
      } else {
        id = await models.Ventas.create(normalized.data);
      }

      return res.status(201).json({ success: true, id, message: 'Venta creada exitosamente' });
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
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
      const statusCode = Number(error.statusCode) || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
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
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }
      await models.Ventas.delete(req.params.id, { actor_id: req.user?.id || null, reason: motivo });
      return res.json({ success: true, message: 'Venta eliminada exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }

      const raw = String(req.body?.estado || '').trim();
      const lower = raw.toLowerCase();
      let normalized = null;
      if (lower === 'pendiente') normalized = 'Pendiente';
      else if (lower === 'completada' || lower === 'completado') normalized = 'Completada';
      else if (lower === 'cancelada' || lower === 'cancelado') normalized = 'Cancelada';
      else if (['Pendiente', 'Completada', 'Cancelada'].includes(raw)) normalized = raw;

      if (!normalized) {
        return res.status(400).json({
          success: false,
          message: 'Estado inválido. Valores permitidos: Pendiente, Completada, Cancelada',
        });
      }

      const venta = await models.Ventas.getById(req.params.id);
      if (!venta) return res.status(404).json({ success: false, message: 'Venta no encontrada' });

      const cur = String(venta.estado || '').trim();
      if (['Completada', 'Cancelada'].includes(cur)) {
        return res.status(409).json({
          success: false,
          message: 'La venta ya está en estado final y no puede modificarse',
        });
      }

      if (cur !== 'Pendiente') {
        return res.status(400).json({ success: false, message: 'Solo se puede cambiar el estado desde Pendiente' });
      }

      if (normalized === 'Pendiente') {
        return res.status(400).json({ success: false, message: 'Seleccione un estado distinto al actual' });
      }

      await models.Ventas.update(req.params.id, { estado: normalized });
      return res.json({ success: true, message: 'Estado de venta actualizado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
};
