// Runs before each test file: use the TEST environment, never the real .env database.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test'), override: true, quiet: true });

for (const name of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) {
  if (!/ledgerline_test/.test(process.env[name] || '')) {
    // Safety net: refuse to run tests that write data against a non-test database.
    throw new Error(`Tests must use the ledgerline_test database (check ${name} in backend/.env.test)`);
  }
}

// Rate limits are tested against a real Redis (local Docker container), with test-only keys.
if (!/^redis:\/\/(127\.0\.0\.1|localhost):\d+\/[1-9]\d*$/.test(process.env.REDIS_URL || '')) {
  throw new Error('Tests need REDIS_URL=redis://127.0.0.1:6379/1 in backend/.env.test (a local Redis, never database 0 or a remote one)');
}
// A fresh prefix per test FILE: each file starts with empty counters (as the old in-memory store did), and
// files can't influence each other. globalSetup deletes all "ll:test:*" keys before the next run.
process.env.REDIS_KEY_PREFIX ||= `ll:test:${require('crypto').randomUUID().slice(0, 8)}:`;
if (!process.env.REDIS_KEY_PREFIX.startsWith('ll:test:')) throw new Error('REDIS_KEY_PREFIX in tests must start with "ll:test:"');
