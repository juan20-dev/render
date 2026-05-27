const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/compras.controllers'));
const { authorizePermissions, simpleRateLimit } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const {
  createCompraBody,
  updateCompraBody,
  updateCompraEstadoBody,
  addProductoCompraBody,
} = require('../validators/catalog.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));

router.get('/', authorizePermissions('Ver Compras'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Compras'), validate(idParam, 'params'), controller.getById);
router.post(
  '/',
  simpleRateLimit(10, 2000, 'create-compra'),
  authorizePermissions('Crear Compras'),
  validate(createCompraBody),
  controller.create
);
router.post('/producto', authorizePermissions('Editar Compras'), validate(addProductoCompraBody), controller.addProducto);
router.put('/:id', authorizePermissions('Editar Compras'), validate(idParam, 'params'), validate(updateCompraBody), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Compras'), validate(idParam, 'params'), validate(updateCompraEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Compras'), validate(idParam, 'params'), validate(updateCompraEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Compras'), validate(idParam, 'params'), controller.delete);

module.exports = router;
