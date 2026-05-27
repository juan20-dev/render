const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/proveedores.controllers'));
const { authorizePermissions, simpleRateLimit } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createProveedorBody, updateProveedorBody, updateProveedorEstadoBody } = require('../validators/catalog.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));

router.get('/', authorizePermissions('Ver Proveedores'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Proveedores'), validate(idParam, 'params'), controller.getById);
router.post(
  '/',
  simpleRateLimit(10, 2000, 'create-proveedor'),
  authorizePermissions('Crear Proveedores'),
  validate(createProveedorBody),
  controller.create
);
router.put('/:id', authorizePermissions('Editar Proveedores'), validate(idParam, 'params'), validate(updateProveedorBody), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Proveedores'), validate(idParam, 'params'), validate(updateProveedorEstadoBody), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Proveedores'), validate(idParam, 'params'), validate(updateProveedorEstadoBody), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Proveedores'), validate(idParam, 'params'), controller.delete);

module.exports = router;
