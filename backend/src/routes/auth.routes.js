const express = require('express');
const controller = require('../controllers/auth.controllers');
const { authenticateJWT, simpleRateLimit } = require('../middlewares/auth.middleware');

const router = express.Router();

// Rate limiting: máx 5 intentos de login por IP en 15 minutos
router.post('/login', simpleRateLimit(5, 15 * 60 * 1000), controller.login);
router.get('/me', authenticateJWT, controller.me);
router.post('/logout', authenticateJWT, controller.logout);
router.post('/logout-all', authenticateJWT, controller.logoutAll);
router.post('/verify-current-password', authenticateJWT, controller.verifyCurrentPassword);
router.post('/change-password', authenticateJWT, controller.changePassword);

// Rate limiting: máx 3 solicitudes de reset por IP en 15 minutos
router.post('/password-reset-request', simpleRateLimit(3, 15 * 60 * 1000), controller.requestPasswordReset);
router.post('/password-reset-confirm', simpleRateLimit(5, 15 * 60 * 1000), controller.confirmPasswordReset);
router.post('/register-cliente', simpleRateLimit(3, 15 * 60 * 1000), controller.registerCliente);

module.exports = router;
