// Rewire: el modelo Compras viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Compras: require('../models/compras/compras'),
};

module.exports = {
  getAll: async (req, res) => {
    try {
      const compras = await models.Compras.getAll();
      res.json({ success: true, data: compras });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const compra = await models.Compras.getById(req.params.id);
      if (!compra) return res.status(404).json({ success: false, message: 'Compra no encontrada' });
      const detalles = await models.Compras.getDetalles(req.params.id);
      const historial_estados = await models.Compras.getEstadoHistorial(req.params.id);
      res.json({ success: true, data: { ...compra, detalles, historial_estados } });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const id = await models.Compras.create(req.body, { usuarioId: req.user?.id || null });
      res.status(201).json({ success: true, id, message: 'Compra creada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message, details: error.details });
    }
  },
  addProducto: async (req, res) => {
    try {
      const { compraId, productoId, cantidad, precioUnitario, porcentajeGanancia, permisoExtraordinario, motivoPermiso } =
        req.body;
      await models.Compras.addDetalle(compraId, productoId, cantidad, precioUnitario, {
        porcentajeGanancia,
        permisoExtraordinario,
        motivoPermiso,
      });
      res.status(201).json({ success: true, message: 'Producto agregado a la compra' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message, details: error.details });
    }
  },
  update: async (req, res) => {
    try {
      await models.Compras.update(req.params.id, req.body);
      res.json({ success: true, message: 'Compra actualizada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message, details: error.details });
    }
  },
  updateStatus: async (req, res) => {
    try {
      const rol = String(req.user?.rol || '');
      if (!['Administrador', 'Asesor', 'Productor'].includes(rol)) {
        return res.status(403).json({
          success: false,
          message: 'Solo administradores, asesores o productores pueden cambiar el estado de la compra',
        });
      }

      const updatedCompra = await models.Compras.updateStatus(req.params.id, req.body, {
        usuarioId: req.user?.id || null,
      });
      return res.json({
        success: true,
        data: updatedCompra,
        message: 'Estado de compra actualizado exitosamente',
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
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
      await models.Compras.delete(req.params.id, { usuarioId: req.user?.id || null, reason: motivo });
      res.json({ success: true, message: 'Compra eliminada exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message, details: error.details });
    }
  }
};

