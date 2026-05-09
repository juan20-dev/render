const models = require('../models/entities.models');
const { isClienteUser } = require('../utils/selfServiceAccess');

module.exports = {
  getAll: async (req, res) => {
    try {
      const productos = await models.Productos.getAll();
      res.json({ success: true, data: productos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const producto = await models.Productos.getById(req.params.id);
      if (!producto) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
      res.json({ success: true, data: producto });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByCategory: async (req, res) => {
    try {
      const productos = await models.Productos.getByCategory(req.params.categoryId);
      res.json({ success: true, data: productos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const id = await models.Productos.create({ ...req.body, actor_id: req.user?.id || null });
      res.status(201).json({ success: true, id, message: 'Producto creado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      await models.Productos.update(req.params.id, { ...req.body, actor_id: req.user?.id || null });
      res.json({ success: true, message: 'Producto actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const estado = typeof req.body?.estado === 'string' ? req.body.estado.trim() : '';
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';

      if (!estado) {
        return res.status(400).json({ success: false, message: 'Estado es obligatorio' });
      }

      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de cambio de estado es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }

      const producto = await models.Productos.updateStatus(req.params.id, {
        estado,
        motivo,
        actor_id: req.user?.id || null,
      });
      res.json({ success: true, data: producto, message: 'Estado del producto actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      await models.Productos.delete(req.params.id, { actor_id: req.user?.id || null });
      res.json({ success: true, message: 'Producto eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

