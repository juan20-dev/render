// Rewire: el modelo Insumos viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Insumos: require('../models/produccion/insumos'),
};

module.exports = {
  getAll: async (req, res) => {
    try {
      const insumos = await models.Insumos.getAll();
      res.json({ success: true, data: insumos });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getResumenGestion: async (req, res) => {
    try {
      const rows = await models.Insumos.getResumenGestion();
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const insumo = await models.Insumos.getById(req.params.id);
      if (!insumo) return res.status(404).json({ success: false, message: 'Insumo no encontrado' });
      res.json({ success: true, data: insumo });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const id = await models.Insumos.create(req.body);
      res.status(201).json({ success: true, id, message: 'Insumo creado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      await models.Insumos.update(req.params.id, req.body);
      res.json({ success: true, message: 'Insumo actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
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
      await models.Insumos.delete(req.params.id, { reason: motivo, actor_id: req.user?.id || null });
      res.json({ success: true, message: 'Insumo eliminado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }
};

