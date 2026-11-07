// Runs once before all tests: bring the TEST database up to date and seed it.
const path = require('path');
const { execSync } = require('child_process');

module.exports = async () => {
  require('./env'); // loads .env.test and checks it points at ledgerline_test
  const cwd = path.join(__dirname, '../..');
  const env = { ...process.env };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('node prisma/seed.js', { cwd, env, stdio: 'pipe' }); // SYSTEM account (no SEED_* users in .env.test)
};
