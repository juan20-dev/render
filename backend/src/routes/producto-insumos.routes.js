const express = require('express');
const controller = require('../controllers/producto-insumos.controllers');
const { authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/', authorizePermissions('Ver Producto-Insumos'), controller.getAll);
router.get('/producto/:productoId', authorizePermissions('Ver Producto-Insumos'), controller.getByProducto);
router.get('/:id', authorizePermissions('Ver Producto-Insumos'), controller.getById);
router.post('/', authorizePermissions('Crear Producto-Insumos'), controller.create);
router.put('/:id', authorizePermissions('Editar Producto-Insumos'), controller.update);
router.delete('/:id', authorizePermissions('Eliminar Producto-Insumos'), controller.delete);

module.exports = router;
