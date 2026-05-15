const express = require('express');
const controller = require('../controllers/pedidos.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
// Las rutas específicas deben ir ANTES de las dinámicas
router.get('/cliente/:clienteId', authorizePermissions('Ver Pedidos'), controller.getByCliente);
router.post('/producto', authorizePermissions('Editar Pedidos'), controller.addProducto);
router.put('/:id/estado', authorizePermissions('Editar Pedidos'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Pedidos'), controller.updateStatus);

// Luego las rutas dinámicas
router.get('/', authorizePermissions('Ver Pedidos'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Pedidos'), controller.getById);
router.post('/', authorizePermissions('Crear Pedidos'), controller.create);
router.put('/:id', authorizePermissions('Editar Pedidos'), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Pedidos'), controller.delete);

module.exports = router;

