// Rewire: el modelo Productos viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const models = {
  Productos: require('../models/compras/productos'),
};
const { isClienteUser } = require('../utils/selfServiceAccess');
const { normalizeProductoTipoValue } = require('../models/shared/auditoria');

const mergeTipoProductoDesdeTypoUi = (body) => {
  const payload = { ...body };
  const typoRaw = payload.typo;
  if (typoRaw !== undefined && typoRaw !== null && String(typoRaw).trim() !== '') {
    payload.tipo_producto = normalizeProductoTipoValue(typoRaw);
  } else if (payload.tipo_producto !== undefined && payload.tipo_producto !== null && String(payload.tipo_producto).trim() !== '') {
    payload.tipo_producto = normalizeProductoTipoValue(payload.tipo_producto);
  }
  return payload;
};

module.exports = {
  getAll: async (req, res) => {
    try {
      let productos = await models.Productos.getAll();
      if (isClienteUser(req)) {
        productos = productos.filter(
          (p) => String(p.tipo_producto || 'terminado').toLowerCase() !== 'insumo'
        );
      }
      res.json({ success: true, data: productos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const producto = await models.Productos.getById(req.params.id);
      if (!producto) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
      if (isClienteUser(req) && String(producto.tipo_producto || '').toLowerCase() === 'insumo') {
        return res.status(404).json({ success: false, message: 'Producto no encontrado' });
      }
      res.json({ success: true, data: producto });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getByCategory: async (req, res) => {
    try {
      let productos = await models.Productos.getByCategory(req.params.categoryId);
      if (isClienteUser(req)) {
        productos = productos.filter(
          (p) => String(p.tipo_producto || 'terminado').toLowerCase() !== 'insumo'
        );
      }
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
      const id = await models.Productos.create({
        ...mergeTipoProductoDesdeTypoUi(req.body),
        actor_id: req.user?.id || null,
      });
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
      await models.Productos.update(req.params.id, {
        ...mergeTipoProductoDesdeTypoUi(req.body),
        actor_id: req.user?.id || null,
      });
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
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  uploadImage: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Debes seleccionar una imagen.' });
      }

      const producto = await models.Productos.getById(req.params.id);
      if (!producto) {
        return res.status(404).json({ success: false, message: 'Producto no encontrado' });
      }

      const uploadsDir = path.join(__dirname, '../../uploads/productos');
      fs.mkdirSync(uploadsDir, { recursive: true });

      const extension = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
      const filename = `producto_${req.params.id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${extension}`;
      const absolutePath = path.join(uploadsDir, filename);
      const relativeUrl = `/uploads/productos/${filename}`;

      fs.writeFileSync(absolutePath, req.file.buffer);

      await models.Productos.update(req.params.id, {
        nombre: producto.nombre,
        categoria_id: producto.categoria_id,
        descripcion: producto.descripcion,
        precio: producto.precio,
        imagen_url: relativeUrl,
        actor_id: req.user?.id || null,
      });

      return res.json({
        success: true,
        message: 'Imagen del producto actualizada exitosamente',
        data: { imagen_url: relativeUrl },
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
};

