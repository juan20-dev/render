const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/usuarios.controllers'));
const { authorizePermissions, simpleRateLimit } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { idParam } = require('../validators/params.schema');
const { createUsuarioBody, updateUsuarioBody, updateUsuarioEstadoBody } = require('../validators/usuarios.schema');

const router = express.Router();
router.get(
  '/',
  authorizePermissions('Ver Usuarios', 'Ver Producción', 'Entregar Insumos'),
  controller.getAll
);
router.get('/email/:email', authorizePermissions('Ver Usuarios'), controller.getByEmail);
router.get('/documento/:documento', authorizePermissions('Ver Usuarios'), controller.getByDocumento);
router.get('/telefono/:telefono', authorizePermissions('Ver Usuarios'), controller.getByTelefono);
router.post(
  '/',
  simpleRateLimit(10, 2000, 'create-usuario'),
  authorizePermissions('Crear Usuarios'),
  validate(createUsuarioBody),
  controller.create
);
router.put('/:id/estado', authorizePermissions('Editar Usuarios'), validate(idParam, 'params'), validate(updateUsuarioEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Usuarios'), validate(idParam, 'params'), validate(updateUsuarioEstadoBody), controller.updateStatus);
router.put('/:id/rol', authorizePermissions('Asignar Roles'), validate(idParam, 'params'), controller.assignRole);
router.get('/:id/impacto-eliminacion', authorizePermissions('Ver Usuarios'), validate(idParam, 'params'), controller.getDeleteImpactById);
router.get('/:id/detalle-completo', authorizePermissions('Ver Usuarios'), validate(idParam, 'params'), controller.getFullDetailById);
router.post('/:id/reset-password-forzado', authorizePermissions('Editar Usuarios'), validate(idParam, 'params'), controller.forceResetPassword);
router.get('/:id/historial', authorizePermissions('Ver Usuarios'), validate(idParam, 'params'), controller.getActivityById);
router.get('/:id', authorizePermissions('Ver Usuarios'), validate(idParam, 'params'), controller.getById);
router.put('/:id', authorizePermissions('Editar Usuarios'), validate(idParam, 'params'), validate(updateUsuarioBody), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Usuarios'), validate(idParam, 'params'), controller.delete);

module.exports = router;
