const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/insumos.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createInsumoBody, updateInsumoBody } = require('../validators/catalog.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));
router.get('/', authorizePermissions('Ver Insumos'), controller.getAll);
router.get('/resumen-gestion', authorizePermissions('Ver Insumos'), controller.getResumenGestion);
router.get('/:id', authorizePermissions('Ver Insumos'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Crear Insumos'), validate(createInsumoBody), controller.create);
router.put('/:id', authorizePermissions('Editar Insumos'), validate(idParam, 'params'), validate(updateInsumoBody), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Insumos'), validate(idParam, 'params'), controller.delete);

module.exports = router;
