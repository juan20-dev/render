const express = require('express');
const controller = require('../controllers/abonos.controllers');

const router = express.Router();
router.get('/', controller.getAll);
router.get('/pedido/:pedidoId', controller.getByPedido);
router.put('/:id/estado', controller.updateStatus);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
