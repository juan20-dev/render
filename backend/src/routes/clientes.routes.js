const express = require('express');
const multer = require('multer');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/clientes.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createClienteBody, updateClienteBody, updateClienteEstadoBody } = require('../validators/clientes.schema');

const router = express.Router();
const upload = multer({
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

const uploadProfilePhotoHandler = (req, res, next) => {
  upload.single('foto')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'La imagen no puede superar 2MB.' });
    }
    return res.status(400).json({ success: false, message: error.message || 'No fue posible procesar la imagen.' });
  });
};

router.get('/', authorizePermissions('Ver Clientes'), denyRoles(...OPERATIONAL_DENY_ROLES), controller.getAll);
router.get('/documento/:documento', authorizePermissions('Ver Clientes'), denyRoles(...OPERATIONAL_DENY_ROLES), controller.getByDocumento);
router.get('/email/:email', authorizePermissions('Ver Clientes'), denyRoles(...OPERATIONAL_DENY_ROLES), controller.getByEmail);
router.get('/usuario/:usuarioId', authorizePermissions('Ver Clientes'), controller.getByUsuarioId);
router.post('/perfil/foto', uploadProfilePhotoHandler, authorizePermissions('Editar Clientes'), controller.uploadProfilePhoto);
router.get('/:id', authorizePermissions('Ver Clientes'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Crear Clientes'), denyRoles(...OPERATIONAL_DENY_ROLES), validate(createClienteBody), controller.create);
router.put('/:id', authorizePermissions('Editar Clientes'), validate(idParam, 'params'), validate(updateClienteBody), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Clientes'), denyRoles(...OPERATIONAL_DENY_ROLES), validate(idParam, 'params'), validate(updateClienteEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Clientes'), denyRoles(...OPERATIONAL_DENY_ROLES), validate(idParam, 'params'), validate(updateClienteEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Clientes'), denyRoles(...OPERATIONAL_DENY_ROLES), validate(idParam, 'params'), controller.delete);

module.exports = router;
