// Rewire: el modelo Proveedores viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Proveedores: require('../models/compras/proveedores'),
};
const { normalizeProveedorPayload } = require('./normalizador-http');

module.exports = {
  getAll: async (req, res) => {
    try {
      const proveedores = await models.Proveedores.getAll();
      res.json({ success: true, data: proveedores });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const proveedor = await models.Proveedores.getById(req.params.id);
      if (!proveedor) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
      res.json({ success: true, data: proveedor });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getByNit: async (req, res) => {
    try {
      const nit = String(req.params.nit || '').trim();
      const proveedor = await models.Proveedores.getByNitOrDocumento(nit);
      if (!proveedor) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
      res.json({ success: true, data: proveedor });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getByEmail: async (req, res) => {
    try {
      const email = String(req.params.email || '').trim().toLowerCase();
      const proveedor = await models.Proveedores.getByEmail(email);
      if (!proveedor) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
      res.json({ success: true, data: proveedor });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getByTelefono: async (req, res) => {
    try {
      const telefono = String(req.params.telefono || '').replace(/\D/g, '');
      const proveedor = await models.Proveedores.getByTelefono(telefono);
      if (!proveedor) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
      res.json({ success: true, data: proveedor });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const normalized = normalizeProveedorPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const id = await models.Proveedores.create(normalized.data, { usuarioId: req.user?.id || null });
      res.status(201).json({ success: true, id, message: 'Proveedor creado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  update: async (req, res) => {
    try {
      const normalized = normalizeProveedorPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      await models.Proveedores.update(req.params.id, normalized.data, { usuarioId: req.user?.id || null });
      res.json({ success: true, message: 'Proveedor actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  updateStatus: async (req, res) => {
    try {
      const normalized = normalizeProveedorPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      if (!normalized.data.estado) {
        return res.status(400).json({ success: false, message: 'Estado es obligatorio' });
      }

      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de cambio de estado es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }

      const proveedor = await models.Proveedores.updateStatus(
        req.params.id,
        { estado: normalized.data.estado, motivo },
        { usuarioId: req.user?.id || null }
      );

      res.json({ success: true, data: proveedor, message: 'Estado del proveedor actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  delete: async (req, res) => {
    try {
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }

      await models.Proveedores.delete(req.params.id, {
        usuarioId: req.user?.id || null,
        reason: motivo,
      });
      res.json({ success: true, message: 'Proveedor eliminado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  getHistory: async (req, res) => {
    try {
      const historial = await models.Proveedores.getAuditByProveedor(req.params.id);
      res.json({ success: true, data: historial });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getPendingPurchases: async (req, res) => {
    try {
      const total = await models.Proveedores.getPendingPurchases(req.params.id);
      res.json({ success: true, data: { total } });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }
};

