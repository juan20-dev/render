const express = require('express');
const controller = require('../controllers/abonos.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Abonos'), controller.getAll);
router.get('/pedido/:pedidoId', authorizePermissions('Ver Abonos'), controller.getByPedido);
router.put('/:id/estado', authorizePermissions('Editar Abonos'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Abonos'), controller.updateStatus);
router.get('/:id', authorizePermissions('Ver Abonos'), controller.getById);
router.post('/', authorizePermissions('Crear Abonos'), controller.create);
router.put('/:id', authorizePermissions('Editar Abonos'), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Abonos'), controller.delete);

module.exports = router;

