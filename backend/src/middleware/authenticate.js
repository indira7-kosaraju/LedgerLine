const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');

// Protects a route: requires "Authorization: Bearer <token>".
// On success, sets req.user = { id, email, fullName, role }.
async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
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
    select: { id: true, email: true, fullName: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return next(new AppError(401, 'Invalid token', 'UNAUTHENTICATED'));
  }

  req.user = { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  next();
}

module.exports = authenticate;
