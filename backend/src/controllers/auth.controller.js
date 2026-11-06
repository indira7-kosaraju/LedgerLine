const authService = require('../services/auth.service');
const requestContext = require('../utils/requestContext');

// Controllers only translate HTTP ↔ service calls. Business logic lives in services.
// Express 5 forwards errors thrown in async handlers to the error handler automatically.

async function register(req, res) {
  const result = await authService.register(req.body, requestContext(req));
  res.status(201).json(result);
}

async function login(req, res) {
  const result = await authService.login(req.body, requestContext(req));
  res.status(200).json(result);
}

async function me(req, res) {
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ user });
}

module.exports = { register, login, me };
