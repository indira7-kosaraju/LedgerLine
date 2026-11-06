const { Router } = require('express');

const router = Router();

// GET /api/health – tells us the server is alive.
// A database check will be added in Task 2.
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ledgerline-backend',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
