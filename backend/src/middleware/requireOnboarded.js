const AppError = require('../utils/AppError');
const requestContext = require('../utils/requestContext');
const audit = require('../services/audit.service');

// Account holders must finish onboarding (step 4) before they open accounts or move money.
// Runs after authenticate + requirePermission; req.user.onboardingStatus is loaded fresh from the database.
// (The database refuses accounts for owners who are not approved as well – trigger accounts_owner_onboarded.)
function requireOnboarded(auditAction) {
  return async (req, res, next) => {
    if (req.user.role !== 'ACCOUNT_HOLDER' || req.user.onboardingStatus === 'APPROVED') return next();
    await audit.recordSafe({
      actorId: req.user.id,
      action: auditAction,
      outcome: 'REFUSED',
      reason: 'ONBOARDING_INCOMPLETE',
      metadata: { method: req.method, path: req.originalUrl },
      ...requestContext(req),
    });
    next(new AppError(403, 'Complete your onboarding before opening accounts or moving money', 'ONBOARDING_INCOMPLETE'));
  };
}

module.exports = { requireOnboarded };
