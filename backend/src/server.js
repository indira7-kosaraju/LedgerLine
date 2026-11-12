const env = require('./config/env');
const prisma = require('./config/prisma');
const redis = require('./config/redis');
const app = require('./app');

const REDIS_STARTUP_TIMEOUT_MS = 10_000;

async function start() {
  // Fail fast: don't accept requests if the database is unreachable.
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  // Rate-limit counters must be shared and survive restarts in production – never silently fall back to memory.
  if (!redis.configured) {
    if (env.NODE_ENV === 'production') {
      console.error('REDIS_URL is required in production (rate-limit counters). Refusing to start.');
      process.exit(1);
    }
    console.warn('REDIS_URL is not set: rate-limit counters are kept in memory (development only).');
  } else {
    try {
      await redis.waitUntilReady(REDIS_STARTUP_TIMEOUT_MS);
    } catch (err) {
      console.error('Could not connect to Redis:', redis.redact(err.message));
      if (env.NODE_ENV === 'production') process.exit(1);
      console.warn('Continuing without Redis: login and registration answer 503 until it is reachable.');
    }
  }

  const server = app.listen(env.PORT, () => {
    console.log(`LedgerLine API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Close the server and DB connections cleanly on Ctrl+C or when stopped.
  async function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      await redis.disconnect();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
