const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/ventas.controllers'));
const { authorizePermissions, simpleRateLimit } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { clienteIdParam, idParam } = require('../validators/params.schema');
const {
  createVentaBody,
  updateVentaBody,
  updateVentaEstadoBody,
  addProductoVentaBody,
} = require('../validators/ventas.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));

router.get(
  '/cliente/:clienteId',
  authorizePermissions('Ver Ventas'),
  validate(clienteIdParam, 'params'),
  controller.getByCliente
);
router.get('/', authorizePermissions('Ver Ventas'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Ventas'), validate(idParam, 'params'), controller.getById);
router.post(
  '/',
  simpleRateLimit(10, 2000, 'create-venta'),
  authorizePermissions('Crear Ventas'),
  validate(createVentaBody),
  controller.create
);
router.post('/producto', authorizePermissions('Editar Ventas'), validate(addProductoVentaBody), controller.addProducto);
router.put('/:id', authorizePermissions('Editar Ventas'), validate(idParam, 'params'), validate(updateVentaBody), controller.update);
router.patch('/:id/estado', authorizePermissions('Editar Ventas'), validate(idParam, 'params'), validate(updateVentaEstadoBody), controller.updateStatus);
router.put('/:id/estado', authorizePermissions('Editar Ventas'), validate(idParam, 'params'), validate(updateVentaEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Ventas'), validate(idParam, 'params'), controller.delete);

module.exports = router;
