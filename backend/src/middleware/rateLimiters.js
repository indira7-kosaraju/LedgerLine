// All rate limits in one place. Counters live in Redis when REDIS_URL is set, so they survive restarts and
// deploys and are shared by every server instance (in development without Redis: in memory, per process).
//
// If Redis is unavailable (option A of step 3):
//   - login, registration and change-password fail CLOSED → 503, so password guessing is never unlimited;
//   - the general API limit fails OPEN → requests continue, the error is logged and /api/health/ready turns red.
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const env = require('../config/env');
const redis = require('../config/redis');
const AppError = require('../utils/AppError');
const audit = require('../services/audit.service');
const requestContext = require('../utils/requestContext');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const tooManyAttempts = { error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } };
const tooManyRequests = { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } };

// Each limiter gets its own store object (express-rate-limit requires that); limiters that must SHARE counters
// use the same `name`, i.e. the same Redis key prefix.
const storeFor = (name) =>
  redis.configured ? new RedisStore({ sendCommand: redis.sendCommand, prefix: `${redis.keyPrefix}rl:${name}:` }) : undefined;

function createLimiter({ name, failClosed, ...options }) {
  const limiter = rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: storeFor(name),
    passOnStoreError: !failClosed,
    // Step 6: the sign-in limits record every refusal (password guessing is a security event). The general API
    // limit does not – a flood of 429s would otherwise flood the audit trail.
    ...(failClosed && {
      handler: async (req, res, next, opts) => {
        await audit.recordSafe({
          actorId: req.user?.id ?? null, action: 'AUTH_RATE_LIMITED', outcome: 'REFUSED', reason: name,
          metadata: { method: req.method, path: req.originalUrl.split('?')[0] }, ...requestContext(req),
        });
        res.status(opts.statusCode).json(opts.message);
      },
    }),
    ...options,
  });
  if (!failClosed) return limiter;

  // Fail closed: a store error becomes a clear 503 instead of a generic 500 – and never lets the request through.
  return (req, res, next) => {
    let settled = false;
    const done = async (err) => {
      if (settled) return;
      settled = true;
      if (!err) return next();
      console.error(`Rate limiter "${name}" unavailable – request refused:`, redact(err));
      await audit.recordSafe({
        actorId: req.user?.id ?? null, action: 'AUTH_RATE_LIMIT_UNAVAILABLE', outcome: 'ERROR', reason: name,
        metadata: { method: req.method, path: req.originalUrl.split('?')[0] }, ...requestContext(req),
      });
      return next(new AppError(503, 'Sign-in is temporarily unavailable. Please try again in a minute.', 'SERVICE_UNAVAILABLE'));
    };
    Promise.resolve(limiter(req, res, done)).catch(done);
  };
}

const redact = (err) => redis.redact(err?.message ?? err);

// Accounts are identified by a hash of the normalised email – Redis never stores email addresses, and the
// same counter applies whether or not the account exists (no account enumeration through the limit).
const accountKey = (email) =>
  `acct:${crypto.createHash('sha256').update(String(email ?? '').trim().toLowerCase()).digest('hex').slice(0, 40)}`;

// General limit per IP for everything under /api (fails open).
const apiLimiter = createLimiter({
  name: 'api',
  failClosed: false,
  windowMs: FIFTEEN_MINUTES,
  limit: env.RATE_LIMIT_MAX,
  message: tooManyRequests,
});

// Brute force from one IP: failed logins (and wrong current passwords) per IP per 15 minutes.
const loginIpLimiter = createLimiter({
  name: 'login-ip',
  failClosed: true,
  windowMs: FIFTEEN_MINUTES,
  limit: env.AUTH_LOGIN_FAILURE_LIMIT,
  skipSuccessfulRequests: true,
  message: tooManyAttempts,
});

// Slow guessing spread over many IPs: failed attempts per ACCOUNT per 15 minutes. While the limit is reached,
// even the correct password gets 429 for that account (lockout until the window passes).
const accountOptions = {
  name: 'login-account',
  failClosed: true,
  windowMs: FIFTEEN_MINUTES,
  limit: env.AUTH_ACCOUNT_FAILURE_LIMIT,
  skipSuccessfulRequests: true,
  message: tooManyAttempts,
};
const loginAccountLimiter = createLimiter({
  ...accountOptions,
  keyGenerator: (req) => accountKey(typeof req.body?.email === 'string' ? req.body.email : ''),
});
// Same counter for wrong current passwords on change-password (runs after authenticate → req.user).
const changePasswordAccountLimiter = createLimiter({
  ...accountOptions,
  keyGenerator: (req) => accountKey(req.user.email),
});

// Mass sign-ups: registrations per IP per hour.
const registerLimiter = createLimiter({
  name: 'register',
  failClosed: true,
  windowMs: ONE_HOUR,
  limit: env.AUTH_REGISTER_LIMIT,
  message: tooManyAttempts,
});

module.exports = { apiLimiter, loginIpLimiter, loginAccountLimiter, changePasswordAccountLimiter, registerLimiter, accountKey };
