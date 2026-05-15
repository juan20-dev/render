const express = require('express');
const controller = require('../controllers/ventas.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/cliente/:clienteId', authorizePermissions('Ver Ventas'), controller.getByCliente);
router.get('/', authorizePermissions('Ver Ventas'), controller.getAll);
router.get('/:id', authorizePermissions('Ver Ventas'), controller.getById);
router.post('/', authorizePermissions('Crear Ventas'), controller.create);
router.post('/producto', authorizePermissions('Editar Ventas'), controller.addProducto);
router.put('/:id', authorizePermissions('Editar Ventas'), controller.update);
router.patch('/:id/estado', authorizePermissions('Editar Ventas'), controller.updateStatus);
router.put('/:id/estado', authorizePermissions('Editar Ventas'), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Ventas'), controller.delete);

module.exports = router;
