// Brings the TEST database (ledgerline_test) up to date: migrations + seed.
// Used by Jest (backend) and Playwright (frontend) before their tests run.
// Refuses to touch any database that isn't named ledgerline_test.
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const testEnv = dotenv.parse(require('fs').readFileSync(path.join(root, '.env.test')));

for (const name of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) {
  if (!/\/ledgerline_test\?/.test(testEnv[name] || '')) {
    console.error(`Refusing to prepare: ${name} in .env.test is not the ledgerline_test database.`);
    process.exit(1);
  }
}

// Test values win over anything in the shell or .env (Prisma does not override existing env vars).
const env = { ...process.env, ...testEnv };
const run = (command) => {
  try {
    execSync(command, { cwd: root, env, stdio: 'pipe' });
  } catch (err) {
    console.error(String(err.stderr || err.stdout || err.message));
    throw new Error(`Test database preparation failed at: ${command}`);
  }
};
run('npx prisma migrate deploy'); // as the OWNER (directUrl)
run('node scripts/setup-db-roles.js --test'); // the API role gets exactly its privileges
run('node prisma/seed.js'); // as the API role, like the app
console.log('ledgerline_test is ready (migrations applied, API role privileges set, SYSTEM account + test admin/auditor seeded).');
