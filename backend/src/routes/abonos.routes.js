const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/abonos.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam, pedidoIdParam } = require('../validators/params.schema');
const { createAbonoBody, updateAbonoBody, updateAbonoEstadoBody } = require('../validators/abonos.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));

router.get('/', authorizePermissions('Ver Abonos'), controller.getAll);
router.get('/pedido/:pedidoId', authorizePermissions('Ver Abonos'), validate(pedidoIdParam, 'params'), controller.getByPedido);
router.put('/:id/estado', authorizePermissions('Editar Abonos'), validate(idParam, 'params'), validate(updateAbonoEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Abonos'), validate(idParam, 'params'), validate(updateAbonoEstadoBody), controller.updateStatus);
router.get('/:id', authorizePermissions('Ver Abonos'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Crear Abonos'), validate(createAbonoBody), controller.create);
router.put('/:id', authorizePermissions('Editar Abonos'), validate(idParam, 'params'), validate(updateAbonoBody), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Abonos'), validate(idParam, 'params'), controller.delete);

module.exports = router;
