const express = require('express');

const categoriasRoutes = require('./categorias.routes');
const productosRoutes = require('./productos.routes');
const clientesRoutes = require('./clientes.routes');
const proveedoresRoutes = require('./proveedores.routes');
const pedidosRoutes = require('./pedidos.routes');
const ventasRoutes = require('./ventas.routes');
const abonosRoutes = require('./abonos.routes');
const domiciliosRoutes = require('./domicilios.routes');
const comprasRoutes = require('./compras.routes');
const insumosRoutes = require('./insumos.routes');
const entregasInsumosRoutes = require('./entregas-insumos.routes');
const produccionRoutes = require('./produccion.routes');
const productoInsumosRoutes = require('./producto-insumos.routes');
const rolesRoutes = require('./roles.routes');
const usuariosRoutes = require('./usuarios.routes');
const authRoutes = require('./auth.routes');
const publicRoutes = require('./public.routes');
const dashboardRoutes = require('./dashboard.routes');
const { authenticateJWT, authorizeAdministrador } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use('/api/auth', authRoutes);
router.use('/api/public', publicRoutes);
router.use('/api/dashboard', authenticateJWT, dashboardRoutes);
router.use('/api/categorias', authenticateJWT, categoriasRoutes);
router.use('/api/productos', authenticateJWT, productosRoutes);
router.use('/api/clientes', authenticateJWT, clientesRoutes);
router.use('/api/proveedores', authenticateJWT, proveedoresRoutes);
router.use('/api/pedidos', authenticateJWT, pedidosRoutes);
router.use('/api/ventas', authenticateJWT, ventasRoutes);
router.use('/api/abonos', authenticateJWT, abonosRoutes);
router.use('/api/domicilios', authenticateJWT, domiciliosRoutes);
router.use('/api/compras', authenticateJWT, comprasRoutes);
router.use('/api/insumos', authenticateJWT, insumosRoutes);
router.use('/api/entregas-insumos', authenticateJWT, entregasInsumosRoutes);
router.use('/api/produccion', authenticateJWT, produccionRoutes);
router.use('/api/producto-insumos', authenticateJWT, productoInsumosRoutes);
router.use('/api/roles', authenticateJWT, authorizeAdministrador, rolesRoutes);
router.use('/api/usuarios', authenticateJWT, usuariosRoutes);

module.exports = router;
