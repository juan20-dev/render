const models = require('../models/entities.models');

module.exports = {
  getAll: async (req, res) => {
    try {
      const categorias = await models.Categorias.getAll();
      res.json({ success: true, data: categorias });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const categoria = await models.Categorias.getById(req.params.id);
      if (!categoria) return res.status(404).json({ success: false, message: 'Categoria no encontrada' });
      res.json({ success: true, data: categoria });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const id = await models.Categorias.create({ ...req.body, actor_id: req.user?.id || null });
      res.status(201).json({ success: true, id, message: 'Categoria creada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      await models.Categorias.update(req.params.id, { ...req.body, actor_id: req.user?.id || null });
      res.json({ success: true, message: 'Categoria actualizada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
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

      const categoria = await models.Categorias.updateStatus(req.params.id, {
        estado,
        motivo,
        actor_id: req.user?.id || null,
      });
      res.json({ success: true, data: categoria, message: 'Estado de la categoria actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      const raw = req.body?.reubicarEnCategoriaId;
      const reubicarEnCategoriaId =
        raw === undefined || raw === null || raw === ''
          ? null
          : parseInt(String(raw), 10);
      await models.Categorias.delete(req.params.id, {
        reubicarEnCategoriaId: Number.isFinite(reubicarEnCategoriaId) ? reubicarEnCategoriaId : null,
        actor_id: req.user?.id || null,
      });
      res.json({ success: true, message: 'Categoria eliminada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }
};

