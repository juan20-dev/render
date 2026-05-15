const express = require('express');
const controller = require('../controllers/productos.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Productos'), controller.getAll);
router.get('/categoria/:categoryId', authorizePermissions('Ver Productos'), controller.getByCategory);
router.get('/:id', authorizePermissions('Ver Productos'), controller.getById);
router.post('/', authorizePermissions('Crear Productos'), controller.create);
router.put('/:id', authorizePermissions('Editar Productos'), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Productos'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Productos'), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Productos'), controller.delete);

module.exports = router;

