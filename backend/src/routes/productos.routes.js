const express = require('express');
const multer = require('multer');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/productos.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createProductoBody, updateProductoBody, updateProductoEstadoBody } = require('../validators/catalog.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));

const uploadProductoImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Formato de imagen no permitido. Usa JPG, PNG o WEBP.'));
  },
});

const uploadProductoImagenHandler = (req, res, next) => {
  uploadProductoImagen.single('imagen')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'La imagen no puede superar 2MB.' });
    }
    if (error) {
      return res.status(400).json({ success: false, message: error.message || 'No fue posible procesar la imagen.' });
    }
    return next();
  });
};

router.get('/', authorizePermissions('Ver Productos'), controller.getAll);
router.get('/categoria/:categoryId', authorizePermissions('Ver Productos'), controller.getByCategory);
router.get('/:id', authorizePermissions('Ver Productos'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Crear Productos'), validate(createProductoBody), controller.create);
router.post(
  '/:id/imagen',
  authorizePermissions('Editar Productos'),
  validate(idParam, 'params'),
  uploadProductoImagenHandler,
  controller.uploadImage,
);
router.put('/:id', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoBody), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Productos'), validate(idParam, 'params'), controller.delete);

module.exports = router;
