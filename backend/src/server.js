const env = require('./config/env');
const app = require('./app');

const server = app.listen(env.PORT, () => {
  console.log(`LedgerLine API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Close the server cleanly on Ctrl+C or when the process is stopped.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
