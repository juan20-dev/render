const express = require('express');
const { wrapController } = require('../utils/wrapController');
const controller = wrapController(require('../controllers/auth.controllers'));
const { authenticateJWT, simpleRateLimit } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  loginBody,
  changePasswordBody,
  registerClienteBody,
  passwordResetRequestBody,
} = require('../validators/auth.schema');

const router = express.Router();

router.get(
  '/register-cliente/disponibilidad',
  simpleRateLimit(60, 15 * 60 * 1000, 'register-cliente-disponibilidad'),
  controller.checkRegisterClienteAvailability
);
router.post('/login', simpleRateLimit(5, 15 * 60 * 1000, 'login'), validate(loginBody), controller.login);
router.get('/me', authenticateJWT, controller.me);
router.post('/logout', authenticateJWT, controller.logout);
router.post('/logout-all', authenticateJWT, controller.logoutAll);
router.post('/verify-current-password', authenticateJWT, controller.verifyCurrentPassword);
router.post('/change-password', authenticateJWT, validate(changePasswordBody), controller.changePassword);

router.post(
  '/password-reset-request',
  simpleRateLimit(3, 15 * 60 * 1000, 'password-reset-request'),
  validate(passwordResetRequestBody),
  controller.requestPasswordReset
);
router.post(
  '/password-reset-confirm',
  simpleRateLimit(5, 15 * 60 * 1000, 'password-reset-confirm'),
  controller.confirmPasswordReset
);
router.post(
  '/register-cliente',
  simpleRateLimit(3, 15 * 60 * 1000, 'register-cliente'),
  validate(registerClienteBody),
  controller.registerCliente
);

module.exports = router;
