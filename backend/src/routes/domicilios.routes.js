const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/domicilios.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { repartidorDomiciliosGuard, denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { clienteIdParam, pedidoIdParam, idParam } = require('../validators/params.schema');
const {
  createDomicilioBody,
  updateDomicilioEstadoBody,
  updateDomicilioBody,
} = require('../validators/domicilios.schema');

const router = express.Router();
router.use(repartidorDomiciliosGuard);

router.get(
  '/cliente/:clienteId',
  authorizePermissions('Ver Domicilios'),
  validate(clienteIdParam, 'params'),
  controller.getByCliente
);
router.get('/', authorizePermissions('Ver Domicilios'), controller.getAll);
router.get(
  '/pedido/:pedidoId',
  authorizePermissions('Ver Domicilios'),
  validate(pedidoIdParam, 'params'),
  controller.getByPedido
);
router.put(
  '/:id/estado',
  authorizePermissions('Ver Domicilios', 'Editar Domicilios'),
  validate(idParam, 'params'),
  validate(updateDomicilioEstadoBody),
  controller.updateStatus
);
router.patch(
  '/:id/estado',
  authorizePermissions('Ver Domicilios', 'Editar Domicilios'),
  validate(idParam, 'params'),
  validate(updateDomicilioEstadoBody),
  controller.updateStatus
);
router.get('/:id', authorizePermissions('Ver Domicilios'), validate(idParam, 'params'), controller.getById);
router.post(
  '/',
  authorizePermissions('Crear Domicilios'),
  denyRoles('Cliente'),
  validate(createDomicilioBody),
  controller.create
);
router.put(
  '/:id',
  authorizePermissions('Editar Domicilios'),
  denyRoles('Cliente'),
  validate(idParam, 'params'),
  validate(updateDomicilioBody),
  controller.update
);
router.delete(
  '/:id',
  authorizePermissions('Eliminar Domicilios'),
  denyRoles('Cliente'),
  validate(idParam, 'params'),
  controller.delete
);

module.exports = router;
