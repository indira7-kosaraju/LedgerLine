const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');
const { SESSION_COOKIE } = require('../utils/authCookie');

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
    select: { id: true, email: true, fullName: true, role: true, isActive: true, sessionVersion: true, onboardingStatus: true },
  });

  if (!user || !user.isActive) {
    return next(new AppError(401, 'Invalid token', 'UNAUTHENTICATED'));
  }

  // The token was issued before the user logged out or before an admin changed their
  // status → it has been revoked, even though its signature and expiry are still valid.
  if (payload.sv !== user.sessionVersion) {
    return next(new AppError(401, 'Your session has ended. Please sign in again.', 'SESSION_REVOKED'));
  }

  req.user = { id: user.id, email: user.email, fullName: user.fullName, role: user.role, onboardingStatus: user.onboardingStatus };
  next();
}

module.exports = authenticate;
module.exports.getToken = getToken;
