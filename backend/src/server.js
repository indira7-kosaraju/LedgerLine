const env = require('./config/env');
const prisma = require('./config/prisma');
const app = require('./app');

async function start() {
  // Fail fast: don't accept requests if the database is unreachable.
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`LedgerLine API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Close the server and DB connections cleanly on Ctrl+C or when stopped.
  async function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
