const { Router } = require('express');
const prisma = require('../config/prisma');

const router = Router();

// GET /api/health – tells us the server and the database are alive.
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

module.exports = router;
