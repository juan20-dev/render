const express = require('express');
const controller = require('../controllers/insumos.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Insumos'), controller.getAll);
router.get('/resumen-gestion', authorizePermissions('Ver Insumos'), controller.getResumenGestion);
router.get('/:id', authorizePermissions('Ver Insumos'), controller.getById);
router.post('/', authorizePermissions('Crear Insumos'), controller.create);
router.put('/:id', authorizePermissions('Editar Insumos'), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Insumos'), controller.delete);

module.exports = router;
