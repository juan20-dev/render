const express = require('express');
const controller = require('../controllers/auth.controllers');
const { authenticateJWT } = require('../middlewares/auth.middleware');

const router = express.Router();
router.post('/login', controller.login);
router.get('/me', authenticateJWT, controller.me);
router.post('/logout', authenticateJWT, controller.logout);
router.post('/logout-all', authenticateJWT, controller.logoutAll);
router.post('/verify-current-password', authenticateJWT, controller.verifyCurrentPassword);
router.post('/change-password', authenticateJWT, controller.changePassword);
router.post('/password-reset-request', controller.requestPasswordReset);
router.post('/password-reset-confirm', controller.confirmPasswordReset);
router.post('/register-cliente', controller.registerCliente);

module.exports = router;
