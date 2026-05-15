const express = require('express');
const controller = require('../controllers/domicilios.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/cliente/:clienteId', authorizePermissions('Ver Domicilios'), controller.getByCliente);
router.get('/', authorizePermissions('Ver Domicilios'), controller.getAll);
router.get('/pedido/:pedidoId', authorizePermissions('Ver Domicilios'), controller.getByPedido);
router.put('/:id/estado', authorizePermissions('Editar Domicilios'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Domicilios'), controller.updateStatus);
router.get('/:id', authorizePermissions('Ver Domicilios'), controller.getById);
router.post('/', authorizePermissions('Crear Domicilios'), controller.create);
router.put('/:id', authorizePermissions('Editar Domicilios'), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Domicilios'), controller.delete);

module.exports = router;
