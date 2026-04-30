const models = require('../models/entities.models');
const { normalizeAbonoPayload } = require('./normalizador-http');

module.exports = {
  getAll: async (req, res) => {
    try {
      const abonos = await models.Abonos.getAll();
      res.json({ success: true, data: abonos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const abono = await models.Abonos.getById(req.params.id);
      if (!abono) return res.status(404).json({ success: false, message: 'Abono no encontrado' });
      res.json({ success: true, data: abono });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByPedido: async (req, res) => {
    try {
      const abonos = await models.Abonos.getByPedido(req.params.pedidoId);
      res.json({ success: true, data: abonos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const normalized = normalizeAbonoPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const id = await models.Abonos.create(normalized.data);
      res.status(201).json({ success: true, id, message: 'Abono creado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const normalized = normalizeAbonoPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      await models.Abonos.update(req.params.id, normalized.data);
      res.json({ success: true, message: 'Abono actualizado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      await models.Abonos.delete(req.params.id);
      res.json({ success: true, message: 'Abono eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      const { estado, motivo } = req.body;
      if (!estado) {
        return res.status(400).json({ success: false, message: 'Estado es requerido' });
      }

      const estadosValidos = ['Registrado', 'Verificado', 'Cancelado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ success: false, message: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
      }

      const abonoActual = await models.Abonos.getById(req.params.id);
      if (!abonoActual) {
        return res.status(404).json({ success: false, message: 'Abono no encontrado' });
      }

      // Validar transiciones de estado permitidas
      const transicionesPermitidas = {
        'Registrado': ['Verificado', 'Cancelado'],
        'Verificado': ['Cancelado'],
        'Cancelado': []
      };

      if (!transicionesPermitidas[abonoActual.estado]?.includes(estado)) {
        return res.status(400).json({ 
          success: false, 
          message: `No se puede cambiar de ${abonoActual.estado} a ${estado}` 
        });
      }

      await models.Abonos.update(req.params.id, { estado });
      return res.json({ success: true, message: 'Estado actualizado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

