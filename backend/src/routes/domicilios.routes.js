const express = require('express');
const controller = require('../controllers/domicilios.controllers');

const router = express.Router();
router.get('/cliente/:clienteId', controller.getByCliente);
router.get('/', controller.getAll);
router.get('/pedido/:pedidoId', controller.getByPedido);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
