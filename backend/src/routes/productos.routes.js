const express = require('express');
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

router.get('/', authorizePermissions('Ver Productos'), controller.getAll);
router.get('/categoria/:categoryId', authorizePermissions('Ver Productos'), controller.getByCategory);
router.get('/:id', authorizePermissions('Ver Productos'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Crear Productos'), validate(createProductoBody), controller.create);
router.put('/:id', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoBody), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Productos'), validate(idParam, 'params'), validate(updateProductoEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Productos'), validate(idParam, 'params'), controller.delete);

module.exports = router;
