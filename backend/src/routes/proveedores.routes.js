const express = require('express');
const controller = require('../controllers/proveedores.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Proveedores'), controller.getAll);
router.get('/nit/:nit', authorizePermissions('Ver Proveedores'), controller.getByNit);
router.get('/email/:email', authorizePermissions('Ver Proveedores'), controller.getByEmail);
router.get('/telefono/:telefono', authorizePermissions('Ver Proveedores'), controller.getByTelefono);
router.get('/:id', authorizePermissions('Ver Proveedores'), controller.getById);
router.get('/:id/historial', authorizePermissions('Ver Proveedores'), controller.getHistory);
router.get('/:id/pendientes', authorizePermissions('Ver Proveedores'), controller.getPendingPurchases);
router.post('/', authorizePermissions('Crear Proveedores'), controller.create);
router.put('/:id', authorizePermissions('Editar Proveedores'), controller.update);
router.put('/:id/estado', authorizePermissions('Editar Proveedores'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Editar Proveedores'), controller.updateStatus);
router.delete('/:id', authorizePermissions('Eliminar Proveedores'), controller.delete);

module.exports = router;

