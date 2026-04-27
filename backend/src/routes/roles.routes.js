const express = require('express');
const controller = require('../controllers/roles.controllers');

const router = express.Router();
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.get('/:id/auditoria', controller.getAuditByRole);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.put('/:id/permisos', controller.updatePermissions);
router.delete('/:id', controller.delete);

module.exports = router;
