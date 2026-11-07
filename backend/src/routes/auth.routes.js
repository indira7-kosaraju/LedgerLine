const { Router } = require('express');
const rateLimit = require('express-rate-limit');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const { registerSchema, loginSchema } = require('../utils/schemas/auth.schemas');
const authController = require('../controllers/auth.controller');

const router = Router();

const rateLimitMessage = { error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } };

// Brute-force protection: only FAILED logins count, 10 per 15 minutes per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitMessage,
});

// Limit mass account creation: 10 registrations per hour per IP.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitMessage,
});

router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.get('/me', authenticate, authController.me);
router.post('/logout', authController.logout);

module.exports = router;
