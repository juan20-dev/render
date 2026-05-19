const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/produccion.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { productorProduccionGuard, denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { idParam, productorIdParam } = require('../validators/params.schema');
const {
  createProduccionBody,
  updateProduccionEstadoBody,
  updateProduccionBody,
  sugerirConsumoBody,
} = require('../validators/produccion.schema');

const router = express.Router();
router.use(productorProduccionGuard);

router.get('/', authorizePermissions('Ver Producción'), controller.getAll);
router.get(
  '/insumos-disponibles/:productorId',
  authorizePermissions('Ver Producción'),
  validate(productorIdParam, 'params'),
  controller.getInsumosByProductor
);
router.get(
  '/insumos-resumen/:productorId',
  authorizePermissions('Ver Producción'),
  validate(productorIdParam, 'params'),
  controller.getInsumosResumenByProductor
);
router.get(
  '/debug-insumos/:productorId',
  authorizePermissions('Ver Producción'),
  validate(productorIdParam, 'params'),
  controller.debugInsumosByProductor
);
router.post(
  '/sugerir-consumo',
  authorizePermissions('Registrar Producción'),
  denyRoles('Productor'),
  validate(sugerirConsumoBody),
  controller.sugerirConsumo
);
router.get('/:id', authorizePermissions('Ver Producción'), validate(idParam, 'params'), controller.getById);
router.post(
  '/',
  authorizePermissions('Registrar Producción'),
  denyRoles('Productor'),
  validate(createProduccionBody),
  controller.create
);
router.put(
  '/:id',
  authorizePermissions('Registrar Producción'),
  denyRoles('Productor'),
  validate(idParam, 'params'),
  validate(updateProduccionBody),
  controller.update
);
router.put(
  '/:id/estado',
  authorizePermissions('Ver Producción', 'Registrar Producción'),
  validate(idParam, 'params'),
  validate(updateProduccionEstadoBody),
  controller.updateStatus
);
router.patch(
  '/:id/estado',
  authorizePermissions('Ver Producción', 'Registrar Producción'),
  validate(idParam, 'params'),
  validate(updateProduccionEstadoBody),
  controller.updateStatus
);
router.delete(
  '/:id',
  authorizePermissions('Ver Producción'),
  denyRoles('Productor'),
  validate(idParam, 'params'),
  controller.delete
);

module.exports = router;
