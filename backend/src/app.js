const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const auditLogRoutes = require('./routes/auditLog.routes');
const accountRoutes = require('./routes/account.routes');
const transactionRoutes = require('./routes/transaction.routes');
const ledgerRoutes = require('./routes/ledger.routes');
const onboardingRoutes = require('./routes/onboarding.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const csrfProtection = require('./middleware/csrfProtection');
const { apiLimiter } = require('./middleware/rateLimiters');

// app.js builds the Express app but does not start listening.
// Keeping it separate from server.js lets tests import the app directly.
const app = express();

// Behind a hosting proxy every request arrives from the proxy's IP. Trusting exactly
// TRUST_PROXY hops makes req.ip the real client again (rate limits, audit logs) while a
// client can't spoof it by adding its own X-Forwarded-For entries.
app.set('trust proxy', env.TRUST_PROXY);

// Safety net: JSON.stringify crashes on BigInt. Services convert money
// explicitly (utils/money.js); this only catches anything we forgot.
app.set('json replacer', (key, value) => (typeof value === 'bigint' ? value.toString() : value));

// Security headers (also removes the "X-Powered-By: Express" header).
app.use(helmet());

// CORS: which websites may call this API from a browser.
// - origin: ONLY the exact frontend origins from .env (validated in config/env.js – never "*")
// - credentials: lets the browser send the HttpOnly session cookie (only to those origins)
// - allowedHeaders: only the headers our frontend actually sends
// - exposedHeaders: lets the frontend read Retry-After (429) and Idempotent-Replayed
// - maxAge: browsers may cache the preflight answer for 10 minutes
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization', 'X-Auth-Mode', 'Idempotency-Key'],
    exposedHeaders: ['Retry-After', 'Idempotent-Replayed'],
    maxAge: 600,
  })
);

// Parse JSON bodies; reject anything over 10 KB to limit abuse.
app.use(express.json({ limit: '10kb' }));

// Read cookies (the session cookie), then block forged cookie-based requests.
app.use(cookieParser());
app.use(csrfProtection);

// Health checks come BEFORE the rate limit: Render polls them constantly, and a limited health check would
// make a healthy server look broken. (Readiness results are cached briefly – see routes/health.routes.js.)
app.use('/api/health', healthRoutes);

// Global rate limit per IP per 15 minutes (RATE_LIMIT_MAX, default 600 – a dashboard page makes several API
// calls), counters in Redis (middleware/rateLimiters.js). Login and register have their own stricter limits.
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/onboarding', onboardingRoutes);

// These two must stay last.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
