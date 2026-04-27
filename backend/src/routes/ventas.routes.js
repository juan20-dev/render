const express = require('express');
const controller = require('../controllers/ventas.controllers');

const router = express.Router();
router.get('/cliente/:clienteId', controller.getByCliente);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.post('/producto', controller.addProducto);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
