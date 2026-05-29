// Rewire: el modelo EntregasInsumos viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const { ensureMotivoEstado } = require('../models/shared/auditoria');
const models = {
  EntregasInsumos: require('../models/produccion/entregas-insumos'),
};

const isProductorUser = (req) => String(req.user?.rol || '').trim().toLowerCase() === 'productor';

module.exports = {
  getAll: async (req, res) => {
    try {
      const operarioId = isProductorUser(req) ? Number(req.user.id) : null;
      const entregas = await models.EntregasInsumos.getAll(
        operarioId && Number.isFinite(operarioId) ? { operarioId } : {}
      );
      res.json({ success: true, data: entregas });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const entrega = await models.EntregasInsumos.getById(req.params.id);
      if (!entrega) return res.status(404).json({ success: false, message: 'Entrega no encontrada' });
      if (isProductorUser(req) && Number(entrega.operario_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      res.json({ success: true, data: entrega });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const id = await models.EntregasInsumos.create(req.body);
      res.status(201).json({ success: true, id, message: 'Entrega creada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      await models.EntregasInsumos.update(req.params.id, req.body);
      res.json({ success: true, message: 'Entrega actualizada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  anular: async (req, res) => {
    try {
      const motivo = ensureMotivoEstado(req.body?.motivo, 10, 50);
      await models.EntregasInsumos.anular(req.params.id, motivo);
      res.json({ success: true, message: 'Entrega anulada correctamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      const motivo = ensureMotivoEstado(req.body?.motivo, 10, 50);
      await models.EntregasInsumos.anular(req.params.id, motivo);
      res.json({ success: true, message: 'Entrega anulada correctamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
};

