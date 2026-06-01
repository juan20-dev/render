const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/entregas-insumos.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles, productorEntregasGuard } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createEntregaInsumoBody, updateEntregaInsumoBody } = require('../validators/catalog.schema');
const { motivoCancelacionBody } = require('../validators/common.schema');

const router = express.Router();
router.use(productorEntregasGuard);
router.use(denyRoles('Cliente'));

const permisoEntregar = authorizePermissions('Entregar Insumos', 'Ver Insumos');
const validarId = validate(idParam, 'params');
const validarMotivoAnulacion = validate(motivoCancelacionBody);

/** Rutas de anulación antes de /:id genérico para evitar conflictos de matching. */
const anularHandlers = [
  permisoEntregar,
  validarId,
  validarMotivoAnulacion,
  controller.anular,
];

router.get('/', permisoEntregar, controller.getAll);
router.post('/', permisoEntregar, validate(createEntregaInsumoBody), controller.create);

router.patch('/:id/anular', ...anularHandlers);
router.put('/:id/anular', ...anularHandlers);
router.delete('/:id', ...anularHandlers);

router.get('/:id', permisoEntregar, validarId, controller.getById);
router.put('/:id', permisoEntregar, validarId, validate(updateEntregaInsumoBody), controller.update);

module.exports = router;
