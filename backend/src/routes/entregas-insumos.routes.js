const express = require('express');
const controller = require('../controllers/entregas-insumos.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Entregar Insumos'), controller.getAll);
router.get('/:id', authorizePermissions('Entregar Insumos'), controller.getById);
router.post('/', authorizePermissions('Entregar Insumos'), controller.create);
router.put('/:id', authorizePermissions('Entregar Insumos'), controller.update);
router.delete('/:id', authorizePermissions('Entregar Insumos'), controller.delete);

module.exports = router;
