const express = require('express');
const controller = require('../controllers/roles.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Roles'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Roles'), controller.getById);
router.get('/:id/auditoria', authorizePermissions('Ver Roles'), controller.getAuditByRole);
router.post('/', authorizePermissions('Crear Roles'), controller.create);
router.put('/:id', authorizePermissions('Editar Roles'), controller.update);
router.put('/:id/permisos', authorizePermissions('Editar Roles'), controller.updatePermissions);
router.delete('/:id', authorizePermissions('Eliminar Roles'), controller.delete);

module.exports = router;
