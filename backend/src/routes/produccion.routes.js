const express = require('express');
const controller = require('../controllers/produccion.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Producción'), controller.getAll);
// Listar insumos entregados disponibles para un productor (ANTES de /:id para
// que la ruta no sea capturada por el patron parametrico).
router.get('/insumos-disponibles/:productorId', authorizePermissions('Ver Producción'), controller.getInsumosByProductor);
router.get('/:id', authorizePermissions('Ver Producción'), controller.getById);
router.post('/', authorizePermissions('Registrar Producción'), controller.create);
router.put('/:id', authorizePermissions('Registrar Producción'), controller.update);
router.put('/:id/estado', authorizePermissions('Registrar Producción'), controller.updateStatus);
router.patch('/:id/estado', authorizePermissions('Registrar Producción'), controller.updateStatus);
router.delete('/:id', authorizePermissions('Ver Producción'), controller.delete);

module.exports = router;

