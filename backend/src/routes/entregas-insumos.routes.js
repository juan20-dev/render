const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/entregas-insumos.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createInsumoBody, updateInsumoBody } = require('../validators/catalog.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));
router.get('/', authorizePermissions('Entregar Insumos'), controller.getAll);
router.get('/:id', authorizePermissions('Entregar Insumos'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Entregar Insumos'), validate(createInsumoBody), controller.create);
router.put('/:id', authorizePermissions('Entregar Insumos'), validate(idParam, 'params'), validate(updateInsumoBody), controller.update);
router.delete('/:id', authorizePermissions('Entregar Insumos'), validate(idParam, 'params'), controller.delete);

module.exports = router;
