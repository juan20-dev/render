const express = require('express');
const path = require('path');
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
    console.warn(`[Upload] Imagen producto rechazada - Nombre: ${file.originalname}, MIME: ${file.mimetype}, Ext: ${extension}`);
    return cb(new Error('Formato de imagen no permitido. Usa JPG, PNG o WEBP.'));
  },
});

const uploadProductoImagenHandler = (req, res, next) => {
  uploadProductoImagen.single('imagen')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'La imagen no puede superar 2MB.' });
    }
    if (error) {
      console.error('[Upload Error]', error?.message || error);
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
  authorizePermissions('Editar Productos', 'Crear Productos'),
  validate(idParam, 'params'),
  uploadProductoImagenHandler,
  controller.uploadImage,
);
router.put('/:id', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoBody), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Productos'), validate(idParam, 'params'), controller.delete);

module.exports = router;
