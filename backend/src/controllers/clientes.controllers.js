const models = require('../models/entities.models');
const { normalizeClientePayload } = require('./normalizador-http');
const { isClienteUser, assertOwnClienteParam } = require('../utils/selfServiceAccess');

module.exports = {
  getAll: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const clientes = await models.Clientes.getAll();
      res.json({ success: true, data: clientes });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.id);
      if (denied) return denied;

      const cliente = await models.Clientes.getById(req.params.id);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByDocumento: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const cliente = await models.Clientes.getByDocumento(req.params.documento);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByEmail: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const cliente = await models.Clientes.getByEmail(req.params.email);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByUsuarioId: async (req, res) => {
    try {
      if (isClienteUser(req) && Number(req.params.usuarioId) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const cliente = await models.Clientes.getOrCreateByUsuarioId(req.params.usuarioId);
      if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado para el usuario indicado' });
      res.json({ success: true, data: cliente });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const normalized = normalizeClientePayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const id = await models.Clientes.create(normalized.data);
      res.status(201).json({ success: true, id, message: 'Cliente creado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.id);
      if (denied) return denied;

      const normalized = normalizeClientePayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const data = { ...normalized.data };
      if (isClienteUser(req)) {
        delete data.estado;
        delete data.usuario_id;
      }

      await models.Clientes.update(req.params.id, data);
      res.json({ success: true, message: 'Cliente actualizado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const deleted = await models.Clientes.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
      }
      res.json({ success: true, message: 'Cliente eliminado exitosamente' });
    } catch (error) {
      if (error?.code === '23503') {
        return res.status(409).json({
          success: false,
          message:
            'No se pudo eliminar el cliente por dependencias relacionadas. Contacta al administrador para revisar las relaciones restantes.',
        });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

