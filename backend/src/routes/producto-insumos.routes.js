const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/producto-insumos.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { denyRoles } = require('../middlewares/scopeAccess');
const { validate } = require('../middlewares/validate.middleware');
const { OPERATIONAL_DENY_ROLES } = require('../middlewares/operationalRoles');
const { idParam } = require('../validators/params.schema');
const { createProductoInsumoBody, updateProductoInsumoBody } = require('../validators/catalog.schema');

const router = express.Router();
router.use(denyRoles(...OPERATIONAL_DENY_ROLES));
router.get('/', authorizePermissions('Ver Producto-Insumos'), controller.getAll);
router.get('/producto/:productoId', authorizePermissions('Ver Producto-Insumos'), controller.getByProducto);
router.get('/:id', authorizePermissions('Ver Producto-Insumos'), validate(idParam, 'params'), controller.getById);
router.post('/', authorizePermissions('Crear Producto-Insumos'), validate(createProductoInsumoBody), controller.create);
router.put('/:id', authorizePermissions('Editar Producto-Insumos'), validate(idParam, 'params'), validate(updateProductoInsumoBody), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Producto-Insumos'), validate(idParam, 'params'), controller.delete);

module.exports = router;
