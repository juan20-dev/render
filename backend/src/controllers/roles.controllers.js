const models = require('../models/entities.models');

module.exports = {
  getAll: async (req, res) => {
    try {
      const roles = await models.Roles.getAll();
      res.json({ success: true, data: roles });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const rol = await models.Roles.getById(req.params.id);
      if (!rol) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      res.json({ success: true, data: rol });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const id = await models.Roles.create(req.body, { usuarioId: req.user?.id || null });
      res.status(201).json({ success: true, id, message: 'Rol creado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      await models.Roles.update(req.params.id, req.body, { usuarioId: req.user?.id || null });
      res.json({ success: true, message: 'Rol actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  updatePermissions: async (req, res) => {
    try {
      await models.Roles.updatePermissions(req.params.id, req.body?.permisos, {
        usuarioId: req.user?.id || null,
        reason: req.body?.motivo,
      });
      res.json({ success: true, message: 'Permisos actualizados exitosamente' });
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
      await models.Roles.delete(req.params.id, {
        usuarioId: req.user?.id || null,
        reason: req.body?.motivo,
      });
      res.json({ success: true, message: 'Rol eliminado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
  },
  getAuditByRole: async (req, res) => {
    try {
      const audit = await models.Roles.getAuditByRole(req.params.id);
      res.json({ success: true, data: audit });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

