const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');
const { SESSION_COOKIE } = require('../utils/authCookie');
const audit = require('../services/audit.service');
const requestContext = require('../utils/requestContext');

// Reads the JWT from "Authorization: Bearer <token>" (API tools, tests) or,
// if that header is absent, from the HttpOnly session cookie (the React app).
function getToken(req) {
  const header = req.get('authorization');
  if (header) {
    // Exactly "Bearer <token>" – anything else (extra parts, other schemes) is rejected.
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/.exec(header);
    return match ? match[1] : null;
  }
  return req.cookies?.[SESSION_COOKIE] || null;
}

// The only routes a user with a temporary password may use (logout does not need authenticate).
const PASSWORD_CHANGE_ALLOWED = new Set(['GET /api/auth/me', 'POST /api/auth/change-password']);

// Protects a route. On success, sets req.user = { id, email, fullName, role, onboardingStatus }.
async function authenticate(req, res, next) {
  const token = getToken(req);

  if (!token) {
    return next(new AppError(401, 'Authentication required', 'UNAUTHENTICATED'));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token';
    return next(new AppError(401, message, 'UNAUTHENTICATED'));
  }

  // Load the user fresh from the database on every request. This means a
  // deactivated user or a changed role takes effect immediately, instead of
  // trusting the (possibly old) role inside the token.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, fullName: true, role: true, isActive: true, sessionVersion: true, onboardingStatus: true, mustChangePassword: true },
  });

  if (!user) {
    return next(new AppError(401, 'Invalid token', 'UNAUTHENTICATED'));
  }

  // Step 6: a correctly signed token that is no longer valid is a security signal (a copied cookie used after
  // logout, a deactivated user still trying) – it is recorded. Tokens with a bad signature have no trustworthy
  // user id and are not recorded (the rate limit applies to them).
  const rejected = !user.isActive ? 'USER_INACTIVE' : payload.sv !== user.sessionVersion ? 'SESSION_REVOKED' : null;
  if (rejected) {
    await audit.recordSafe({
      actorId: user.id, action: 'AUTH_SESSION_REJECTED', outcome: 'REFUSED', reason: rejected, entityType: 'User', entityId: user.id,
      metadata: { method: req.method, path: req.originalUrl.split('?')[0] }, ...requestContext(req),
    });
    // The token was issued before the user logged out or before an admin changed their
    // status → it has been revoked, even though its signature and expiry are still valid.
    return next(rejected === 'USER_INACTIVE'
      ? new AppError(401, 'Invalid token', 'UNAUTHENTICATED')
      : new AppError(401, 'Your session has ended. Please sign in again.', 'SESSION_REVOKED'));
  }

  // A temporary password set by an admin (step 5) must be changed before anything else is allowed.
  if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(`${req.method} ${req.originalUrl.split('?')[0]}`)) {
    return next(new AppError(403, 'Change your temporary password first', 'PASSWORD_CHANGE_REQUIRED'));
  }

  req.user = { id: user.id, email: user.email, fullName: user.fullName, role: user.role, onboardingStatus: user.onboardingStatus };
  next();
}

module.exports = authenticate;
module.exports.getToken = getToken;
