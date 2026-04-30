const express = require('express');
const controller = require('../controllers/pedidos.controllers');

const router = express.Router();
// Las rutas específicas deben ir ANTES de las dinámicas
router.get('/cliente/:clienteId', controller.getByCliente);
router.post('/producto', controller.addProducto);
router.put('/:id/estado', controller.updateStatus);

// Luego las rutas dinámicas
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
