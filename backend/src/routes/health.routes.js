const { Router } = require('express');
const prisma = require('../config/prisma');
const { runReadiness } = require('../services/readiness.service');

const router = Router();

// GET /api/health – tells us the server and the database are alive (unchanged; used by verify-deployment).
router.get('/', async (req, res) => {
  let database = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error('Health check: database unreachable:', err.message);
    database = 'unreachable';
  }

  const healthy = database === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'ledgerline-backend',
    database,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/health/live – liveness: the process is running. Touches no database and no Redis.
router.get('/live', (req, res) => {
  res.json({ status: 'alive', uptimeSeconds: Math.round(process.uptime()) });
});

// GET /api/health/ready – readiness (services/readiness.service.js): 200 only if every check passes, else 503.
// This route is public and not rate limited (app.js), so one result is reused for READY_CACHE_MS and
// simultaneous requests share one run – a flood of requests can't turn into a flood of database queries.
const READY_CACHE_MS = 2000;
let cached = null; // { at, result }
let running = null;

router.get('/ready', async (req, res) => {
  if (!cached || Date.now() - cached.at > READY_CACHE_MS) {
    running ??= runReadiness().then((result) => {
      cached = { at: Date.now(), result };
      running = null;
      return result;
    });
    await running;
  }
  const { ready, checks } = cached.result;
  res.set('Cache-Control', 'no-store');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() });
});

module.exports = router;
