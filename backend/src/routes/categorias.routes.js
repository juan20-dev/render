const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/categorias.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createCategoriaBody, updateCategoriaBody, updateCategoriaEstadoBody } = require('../validators/catalog.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));

router.get('/', authorizePermissions('Ver Categorías'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Categorías'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Crear Categorías'), validate(createCategoriaBody), controller.create);
router.put('/:id', authorizePermissions('Editar Categorías'), validate(idParam, 'params'), validate(updateCategoriaBody), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Categorías'), validate(idParam, 'params'), validate(updateCategoriaEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Categorías'), validate(idParam, 'params'), validate(updateCategoriaEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Categorías'), validate(idParam, 'params'), controller.delete);

module.exports = router;
