const authService = require('../services/auth.service');
const audit = require('../services/audit.service');
const requestContext = require('../utils/requestContext');
const { verifyAccessToken } = require('../utils/jwt');
const { SESSION_COOKIE, setSessionCookie, clearSessionCookie } = require('../utils/authCookie');

// Controllers only translate HTTP ↔ service calls. Business logic lives in services.
// Express 5 forwards errors thrown in async handlers to the error handler automatically.

// The session is always set as an HttpOnly cookie (used by the React app).
// API tools that send "X-Auth-Mode: bearer" also get the token in the body,
// so the browser app's JavaScript never sees the token.
function sendSession(req, res, status, { user, token }) {
  setSessionCookie(res, token);
  const body = { user };
  if (req.get('x-auth-mode') === 'bearer') body.token = token;
  res.status(status).json(body);
}

async function register(req, res) {
  sendSession(req, res, 201, await authService.register(req.body, requestContext(req)));
}

async function login(req, res) {
  sendSession(req, res, 200, await authService.login(req.body, requestContext(req)));
}

async function me(req, res) {
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ user });
}

// Always succeeds, even with an expired token, so the user can always sign out.
async function logout(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    try {
      const { sub } = verifyAccessToken(token);
      await audit.recordSafe({ actorId: sub, action: 'AUTH_LOGOUT', outcome: 'SUCCESS', entityType: 'User', entityId: sub, ...requestContext(req) });
    } catch {
      // expired or invalid token – nothing to audit, still clear the cookie
    }
  }
  clearSessionCookie(res);
  res.status(204).end();
}

module.exports = { register, login, me, logout };
