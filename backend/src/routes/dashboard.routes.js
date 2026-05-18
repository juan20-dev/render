const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/dashboard.controllers'));
const { authenticateJWT, authorizePermissions } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/resumen', authorizePermissions('Ver Dashboard'), controller.getStaffResumen);
router.get('/modules', authenticateJWT, controller.getAvailableModules);

module.exports = router;
