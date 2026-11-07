// Brings the TEST database (ledgerline_test) up to date: migrations + seed.
// Used by Jest (backend) and Playwright (frontend) before their tests run.
// Refuses to touch any database that isn't named ledgerline_test.
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const testEnv = dotenv.parse(require('fs').readFileSync(path.join(root, '.env.test')));

if (!/\/ledgerline_test\?/.test(testEnv.DATABASE_URL || '')) {
  console.error('Refusing to prepare: DATABASE_URL in .env.test is not the ledgerline_test database.');
  process.exit(1);
}

// Test values win over anything in the shell or .env (Prisma does not override existing env vars).
const env = { ...process.env, ...testEnv };
execSync('npx prisma migrate deploy', { cwd: root, env, stdio: 'pipe' });
execSync('node prisma/seed.js', { cwd: root, env, stdio: 'pipe' });
console.log('ledgerline_test is ready (migrations applied, SYSTEM account + test admin/auditor seeded).');
