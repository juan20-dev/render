const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/roles.controllers'));
const { authorizePermissions } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { idParam } = require('../validators/params.schema');
const { z } = require('zod');

const createRoleBody = z
  .object({
    nombre: z.string().trim().min(1),
    descripcion: z.string().optional(),
    permisos: z.array(z.string()).optional(),
  })
  .passthrough();

const updateRoleBody = createRoleBody.partial().passthrough();
const updateRolePermissionsBody = z.object({
  permisos: z.array(z.string()),
});

const router = express.Router();
router.get('/', authorizePermissions('Ver Roles'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Roles'), validate(idParam, 'params'), controller.getById);
router.get('/:id/auditoria', authorizePermissions('Ver Roles'), validate(idParam, 'params'), controller.getAuditByRole);
router.post('/', authorizePermissions('Crear Roles'), validate(createRoleBody), controller.create);
router.put('/:id', authorizePermissions('Editar Roles'), validate(idParam, 'params'), validate(updateRoleBody), controller.update);
router.put('/:id/permisos', authorizePermissions('Editar Roles'), validate(idParam, 'params'), validate(updateRolePermissionsBody), controller.updatePermissions);
router.delete('/:id', authorizePermissions('Eliminar Roles'), validate(idParam, 'params'), controller.delete);

module.exports = router;
