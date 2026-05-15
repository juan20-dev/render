const express = require('express');
const controller = require('../controllers/usuarios.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Usuarios'), controller.getAll);
router.get('/email/:email', authorizePermissions('Ver Usuarios'), controller.getByEmail);
router.get('/documento/:documento', authorizePermissions('Ver Usuarios'), controller.getByDocumento);
router.get('/telefono/:telefono', authorizePermissions('Ver Usuarios'), controller.getByTelefono);
router.post('/', authorizePermissions('Crear Usuarios'), controller.create);
// Rutas especÃ­ficas ANTES de rutas genÃ©ricas con parÃ¡metro /:id
router.put('/:id/estado', authorizePermissions('Editar Usuarios'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Usuarios'), controller.updateStatus);
router.put('/:id/rol', authorizePermissions('Asignar Roles'), controller.assignRole);
router.get('/:id/impacto-eliminacion', authorizePermissions('Ver Usuarios'), controller.getDeleteImpactById);
router.get('/:id/detalle-completo', authorizePermissions('Ver Usuarios'), controller.getFullDetailById);
router.post('/:id/reset-password-forzado', authorizePermissions('Editar Usuarios'), controller.forceResetPassword);
router.get('/:id/historial', authorizePermissions('Ver Usuarios'), controller.getActivityById);
router.get('/:id', authorizePermissions('Ver Usuarios'), controller.getById);
router.put('/:id', authorizePermissions('Editar Usuarios'), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Usuarios'), controller.delete);

module.exports = router;

