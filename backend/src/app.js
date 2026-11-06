const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

// app.js builds the Express app but does not start listening.
// Keeping it separate from server.js lets tests import the app directly.
const app = express();

// Security headers (also removes the "X-Powered-By: Express" header).
app.use(helmet());

// Only our frontend origin may call the API from a browser.
app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));

// Parse JSON bodies; reject anything over 10 KB to limit abuse.
app.use(express.json({ limit: '10kb' }));

// Global rate limit: max 100 requests per IP per 15 minutes.
// Login and register have their own stricter limits (see auth.routes.js).
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
  })
);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);

// These two must stay last.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
