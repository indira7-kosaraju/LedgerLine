// Runs once before all Jest tests: bring the TEST database up to date and seed it, and clear old
// test rate-limit counters from Redis (they would otherwise carry over from the previous run).
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
const { createClient } = require('redis');

async function clearTestCounters() {
  const { REDIS_URL } = dotenv.parse(fs.readFileSync(path.join(__dirname, '../../.env.test')));
  if (!/^redis:\/\/(127\.0\.0\.1|localhost):\d+\/[1-9]\d*$/.test(REDIS_URL || '')) {
    throw new Error('backend/.env.test needs REDIS_URL=redis://127.0.0.1:6379/1 (local Redis, not database 0)');
  }
  const client = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000, reconnectStrategy: false } });
  client.on('error', () => {});
  try {
    await client.connect();
  } catch {
    throw new Error('Local Redis is not running. Start it with: docker start ledgerline-redis  (see backend/.env.example)');
  }
  try {
    // Only keys of the test prefix – never FLUSHDB.
    for await (const keys of client.scanIterator({ MATCH: 'll:test:*', COUNT: 500 })) {
      if (keys.length) await client.del(keys);
    }
  } finally {
    client.destroy();
  }
}

module.exports = async () => {
  execSync('node scripts/prepare-test-db.js', { cwd: path.join(__dirname, '../..'), stdio: 'pipe' });
  await clearTestCounters();
};
