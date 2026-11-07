const AppError = require('../utils/AppError');
const requestContext = require('../utils/requestContext');
const audit = require('../services/audit.service');
const { SESSION_COOKIE } = require('../utils/authCookie');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF = another website tricking the browser into sending a request that
// carries our session cookie. Cookies are sent automatically; custom headers are not.
//
// So: any state-changing request authenticated by the COOKIE must also carry
// "X-Requested-With: XMLHttpRequest". A plain HTML form on another site can't add
// that header, and a cross-site fetch() that adds it is blocked by CORS.
// (This sits on top of SameSite=Strict as a second layer.)
//
// Requests using "Authorization: Bearer" are not affected – browsers never add
// that header automatically, so they can't be forged this way.
async function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const usesCookieAuth = Boolean(req.cookies?.[SESSION_COOKIE]) && !req.get('authorization');
  if (!usesCookieAuth) return next();

  if (req.get('x-requested-with') === 'XMLHttpRequest') return next();

  await audit.recordSafe({
    action: 'CSRF_CHECK',
    outcome: 'REFUSED',
    reason: 'MISSING_CSRF_HEADER',
    metadata: { method: req.method, path: req.originalUrl, origin: req.get('origin') ?? null },
    ...requestContext(req),
  });
  next(new AppError(403, 'Request blocked by CSRF protection', 'CSRF_REJECTED'));
}

module.exports = csrfProtection;
