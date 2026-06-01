const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/pedidos.controllers'));
const { authorizePermissions, simpleRateLimit } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { idParam, clienteIdParam } = require('../validators/params.schema');
const {
  createPedidoBody,
  updatePedidoBody,
  updatePedidoEstadoBody,
  addProductoPedidoBody,
} = require('../validators/pedidos.schema');

const router = express.Router();
router.get(
  '/cliente/:clienteId',
  authorizePermissions('Ver Pedidos', 'Ver Mis Pedidos'),
  validate(clienteIdParam, 'params'),
  controller.getByCliente
);
router.post(
  '/producto',
  authorizePermissions('Editar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(addProductoPedidoBody),
  controller.addProducto
);
router.put(
  '/:id/estado',
  authorizePermissions('Editar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(idParam, 'params'),
  validate(updatePedidoEstadoBody),
  controller.updateStatus
);
router.patch(
  '/:id/estado',
  authorizePermissions('Editar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(idParam, 'params'),
  validate(updatePedidoEstadoBody),
  controller.updateStatus
);

router.get('/', authorizePermissions('Ver Pedidos', 'Ver Mis Pedidos'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Pedidos', 'Ver Mis Pedidos'), validate(idParam, 'params'), controller.getById);
router.post(
  '/',
  simpleRateLimit(10, 2000, 'create-pedido'),
  authorizePermissions('Crear Pedidos', 'Ver Mis Pedidos'),
  validate(createPedidoBody),
  controller.create
);
router.put(
  '/:id',
  authorizePermissions('Editar Pedidos', 'Ver Mis Pedidos'),
  validate(idParam, 'params'),
  validate(updatePedidoBody),
  controller.update
);
router.delete(
  '/:id',
  authorizePermissions('Eliminar Pedidos'),
  denyRoles('Cliente', 'Repartidor', 'Productor'),
  validate(idParam, 'params'),
  controller.delete
);

module.exports = router;
