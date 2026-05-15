const express = require('express');
const controller = require('../controllers/compras.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Compras'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Compras'), controller.getById);
router.post('/', authorizePermissions('Crear Compras'), controller.create);
router.post('/producto', authorizePermissions('Editar Compras'), controller.addProducto);
router.put('/:id', authorizePermissions('Editar Compras'), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Compras'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Compras'), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Compras'), controller.delete);

module.exports = router;

