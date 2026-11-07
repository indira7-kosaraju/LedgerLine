const crypto = require('crypto');
const AppError = require('../utils/AppError');
const requestContext = require('../utils/requestContext');
const audit = require('../services/audit.service');

// Letters, digits, "-" and "_", 16–100 characters (a UUID is 36).
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;

// JSON with keys in a fixed (sorted) order and BigInt as text, so the same request
// always produces the same fingerprint – e.g. amountPaise 500000 and "500000" match.
function canonicalJson(value) {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

// Required on every money-moving route. Runs AFTER validate(), so the fingerprint is
// computed from the cleaned body. Sets req.idempotency = { key, endpoint, requestHash }.
//
// The backend REQUIRES the key – it does not trust the browser to remember to send one.
function requireIdempotencyKey(auditAction) {
  return async (req, res, next) => {
    const key = req.get('idempotency-key');

    if (!key || !KEY_PATTERN.test(key)) {
      const code = key ? 'IDEMPOTENCY_KEY_INVALID' : 'IDEMPOTENCY_KEY_REQUIRED';
      await audit.recordSafe({ actorId: req.user?.id ?? null, action: auditAction, outcome: 'REFUSED', reason: code, ...requestContext(req) });
      return next(
        new AppError(
          400,
          key
            ? 'Idempotency-Key must be 16–100 characters: letters, digits, "-" or "_"'
            : 'An Idempotency-Key header is required for money movement',
          code
        )
      );
    }

    const endpoint = `${req.method} ${req.baseUrl}${req.route.path}`; // e.g. "POST /api/transactions/transfer"
    const requestHash = crypto.createHash('sha256').update(`${endpoint}\n${canonicalJson(req.body)}`).digest('hex');
    req.idempotency = { key, endpoint, requestHash };
    next();
  };
}

module.exports = { requireIdempotencyKey, canonicalJson };
