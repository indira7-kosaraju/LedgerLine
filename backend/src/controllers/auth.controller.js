const authService = require('../services/auth.service');
const audit = require('../services/audit.service');
const requestContext = require('../utils/requestContext');
const { verifyAccessToken } = require('../utils/jwt');
const { setSessionCookie, clearSessionCookie } = require('../utils/authCookie');
const { getToken } = require('../middleware/authenticate');
const prisma = require('../config/prisma');

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
// A valid token is REVOKED on the server (sessionVersion + 1), so a copy of it – stolen,
// or left in another browser – stops working too. This signs the user out everywhere.
async function logout(req, res) {
  const token = getToken(req);
  if (token) {
    try {
      const { sub, sv } = verifyAccessToken(token);
      // Only raises the version if this token is still current (a repeated logout changes nothing).
      await prisma.user.updateMany({ where: { id: sub, sessionVersion: sv }, data: { sessionVersion: { increment: 1 } } });
      await audit.recordSafe({ actorId: sub, action: 'AUTH_LOGOUT', outcome: 'SUCCESS', entityType: 'User', entityId: sub, ...requestContext(req) });
    } catch {
      // expired or invalid token – nothing to revoke or audit, still clear the cookie
    }
  }
  clearSessionCookie(res);
  res.status(204).end();
}

module.exports = { register, login, me, logout };
