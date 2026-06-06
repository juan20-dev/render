const express = require('express');
const path = require('path');
const multer = require('multer');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/pedidos.controllers'));
const { authorizePermissions, simpleRateLimit } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { idParam, clienteIdParam } = require('../validators/params.schema');
const {
  createPedidoBody,
  updatePedidoBody,
  updatePedidoEstadoBody,
  addProductoPedidoBody,
} = require('../validators/pedidos.schema');

const router = express.Router();
const uploadComprobante = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Validación más robusta: aceptar por extensión si el MIME type es ambiguo
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    
    const extension = path.extname(file.originalname || '').toLowerCase();
    const isMimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    const isExtensionValid = allowedExtensions.includes(extension);
    
    // Aceptar si el MIME type es válido O si la extensión es válida
    if (isMimeTypeValid || isExtensionValid) {
      return cb(null, true);
    }
    
    // Log para debugging
    console.warn(`[Upload] Comprobante rechazado - Nombre: ${file.originalname}, MIME: ${file.mimetype}, Ext: ${extension}`);
    return cb(new Error('Formato de imagen no permitido. Usa JPG, PNG o WEBP.'));
  },
});

const uploadComprobanteHandler = (req, res, next) => {
  uploadComprobante.single('comprobante')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'La imagen no puede superar 2MB.' });
    }
    console.error('[Upload Error]', error?.message || error);
    return res.status(400).json({ success: false, message: error.message || 'No fue posible procesar la imagen.' });
  });
};

router.post(
  '/comprobante',
  simpleRateLimit(15, 2000, 'upload-comprobante'),
  authorizePermissions('Crear Pedidos', 'Ver Mis Pedidos'),
  uploadComprobanteHandler,
  controller.uploadComprobante
);

router.get(
  '/cliente/:clienteId',
  authorizePermissions('Ver Pedidos', 'Ver Mis Pedidos'),
  validate(clienteIdParam, 'params'),
  controller.getByCliente
);
router.post(
  '/producto',
  authorizePermissions('Editar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(addProductoPedidoBody),
  controller.addProducto
);
router.put(
  '/:id/estado',
  authorizePermissions('Editar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(idParam, 'params'),
  validate(updatePedidoEstadoBody),
  controller.updateStatus
);
router.patch(
  '/:id/estado',
  authorizePermissions('Editar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(idParam, 'params'),
  validate(updatePedidoEstadoBody),
  controller.updateStatus
);

router.get('/', authorizePermissions('Ver Pedidos', 'Ver Mis Pedidos'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Pedidos', 'Ver Mis Pedidos'), validate(idParam, 'params'), controller.getById);
router.post(
  '/',
  simpleRateLimit(10, 2000, 'create-pedido'),
  authorizePermissions('Crear Pedidos', 'Ver Mis Pedidos'),
  validate(createPedidoBody),
  controller.create
);
router.put(
  '/:id',
  authorizePermissions('Editar Pedidos', 'Ver Mis Pedidos'),
  validate(idParam, 'params'),
  validate(updatePedidoBody),
  controller.update
);
router.delete(
  '/:id',
  authorizePermissions('Eliminar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(idParam, 'params'),
  controller.delete
);

module.exports = router;
