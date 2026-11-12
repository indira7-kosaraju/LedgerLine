const { Router } = require('express');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const { loginIpLimiter, loginAccountLimiter, changePasswordAccountLimiter, registerLimiter } = require('../middleware/rateLimiters');
const { registerSchema, loginSchema, changePasswordSchema } = require('../utils/schemas/auth.schemas');
const authController = require('../controllers/auth.controller');

const router = Router();

// Limits (middleware/rateLimiters.js, counters in Redis): failed logins per IP AND per account (email), both
// AUTH_*_FAILURE_LIMIT per 15 minutes; registrations AUTH_REGISTER_LIMIT per IP per hour. All fail closed (503).
router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginIpLimiter, loginAccountLimiter, validate(loginSchema), authController.login);
router.get('/me', authenticate, authController.me);
// Wrong current passwords count toward the same failed-login limits – per IP and per account (password guessing).
router.post('/change-password', loginIpLimiter, authenticate, changePasswordAccountLimiter, validate(changePasswordSchema), authController.changePassword);
router.post('/logout', authController.logout);

module.exports = router;
