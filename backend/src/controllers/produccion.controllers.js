// Rewire: el modelo Produccion viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Produccion: require('../models/produccion/produccion'),
};

const isProductorUser = (req) => String(req.user?.rol || '').trim().toLowerCase() === 'productor';

module.exports = {
  getAll: async (req, res) => {
    try {
      const pid = isProductorUser(req) ? req.user.id : null;
      const produccion = await models.Produccion.getAll(pid ? { productorUserId: pid } : {});
      res.json({ success: true, data: produccion });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const produccion = await models.Produccion.getById(req.params.id);
      if (!produccion) return res.status(404).json({ success: false, message: 'Registro de produccion no encontrado' });
      
      // Productor solo puede ver su producción asignada
      if (isProductorUser(req) && Number(produccion.productor_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      
      res.json({ success: true, data: produccion });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const id = await models.Produccion.create(req.body);
      res.status(201).json({ success: true, id, message: 'Produccion creada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const produccion = await models.Produccion.getById(req.params.id);
      
      // Productor solo puede actualizar su producción asignada
      if (isProductorUser(req) && Number(produccion.productor_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      
      await models.Produccion.update(req.params.id, req.body);
      res.json({ success: true, message: 'Produccion actualizada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      const produccion = await models.Produccion.getById(req.params.id);
      
      // Productor solo puede cambiar estado de su producción asignada
      if (isProductorUser(req) && Number(produccion.productor_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      
      const updated = await models.Produccion.updateStatus(req.params.id, req.body);
      res.json({ success: true, data: updated, message: 'Estado de produccion actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message, details: error.details });
    }
  },
  delete: async (req, res) => {
    try {
      await models.Produccion.delete(req.params.id);
      res.json({ success: true, message: 'Produccion eliminada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getInsumosByProductor: async (req, res) => {
    try {
      // Productor solo puede ver sus propios insumos
      if (isProductorUser(req) && Number(req.params.productorId) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      
      const data = await models.Produccion.getInsumosEntregadosByProductor(req.params.productorId);
      res.json({ success: true, data });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }
};

