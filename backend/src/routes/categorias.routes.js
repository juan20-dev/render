const express = require('express');
const controller = require('../controllers/categorias.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Categorías'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Categorías'), controller.getById);
router.post('/', authorizePermissions('Crear Categorías'), controller.create);
router.put('/:id', authorizePermissions('Editar Categorías'), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Categorías'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Categorías'), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Categorías'), controller.delete);

module.exports = router;

