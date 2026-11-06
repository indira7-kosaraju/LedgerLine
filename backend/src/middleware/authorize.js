const { hasPermission } = require('../config/permissions');
const AppError = require('../utils/AppError');
const requestContext = require('../utils/requestContext');
const audit = require('../services/audit.service');

// Usage: router.get('/x', authenticate, requirePermission('audit:read'), controller)
// Passes if the user's role has ANY of the given permissions.
// Must run after `authenticate`, because it relies on req.user (loaded from the DB).
function requirePermission(...permissions) {
  // Validate permission names once, at startup, not on every request.
  permissions.forEach((p) => hasPermission('ADMIN', p));

  return async (req, res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHENTICATED'));
    }

    if (permissions.some((p) => hasPermission(req.user.role, p))) {
      return next();
    }

    await audit.recordSafe({
      actorId: req.user.id,
      action: 'AUTHZ_DENIED',
      outcome: 'REFUSED',
      reason: 'ROLE_NOT_PERMITTED',
      metadata: { role: req.user.role, required: permissions, method: req.method, path: req.originalUrl },
      ...requestContext(req),
    });

    next(new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN'));
  };
}

module.exports = { requirePermission };
