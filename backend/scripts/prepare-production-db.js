// Prepares the PRODUCTION database: migrations → SYSTEM account → demo data → verification.
//
//   1. Put the production connection string in backend/.env.production (ignored by Git):
//        DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require"
//   2. npm run db:prepare:production
//
// Safety:
// - Only backend/.env.production is used for DATABASE_URL – never your local .env database.
// - The private admin/auditor from your local .env are NOT copied to production, and the
//   public demo admin is never created there:
//   SEED_* is empty unless you set it in .env.production yourself.
// - The connection string is never printed (only the host name).
// - `prisma migrate deploy` only applies committed migrations; it never resets data.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const file = path.join(root, '.env.production');
if (!fs.existsSync(file)) {
  console.error('Missing backend/.env.production with DATABASE_URL="…" (see docs/DEPLOYMENT.md).');
  process.exit(1);
}
const prod = dotenv.parse(fs.readFileSync(file));
if (!prod.DATABASE_URL) {
  console.error('backend/.env.production has no DATABASE_URL.');
  process.exit(1);
}
let host;
try {
  host = new URL(prod.DATABASE_URL).hostname;
} catch {
  console.error('DATABASE_URL in backend/.env.production is not a valid URL.');
  process.exit(1);
}
if (/^(localhost|127\.0\.0\.1|::1)$/.test(host)) {
  console.error('Refusing: DATABASE_URL in .env.production points to this computer, not to a managed database.');
  process.exit(1);
}

const env = {
  ...process.env,
  SEED_ADMIN_EMAIL: '',
  SEED_ADMIN_PASSWORD: '',
  SEED_AUDITOR_EMAIL: '',
  SEED_AUDITOR_PASSWORD: '',
  ...prod, // anything set in .env.production wins (including SEED_* if you want a private admin)
  // Never create the demo admin (published password) on a public deployment – not overridable.
  // The real first admin is created with: npm run admin:bootstrap -- --production …
  SEED_DEMO_ADMIN: 'false',
};

const run = (label, command) => {
  console.log(`\n▶ ${label}`);
  execSync(command, { cwd: root, env, stdio: 'inherit' });
};

console.log(`Production database host: ${host}`);
run('Apply migrations', 'npx prisma migrate deploy');
run('Seed SYSTEM account (and private admin/auditor only if set in .env.production)', 'node prisma/seed.js');
run('Seed demo users and demo transactions (safe dummy credentials)', 'node prisma/seed-demo.js');
run('Verify the database (read-only)', 'node scripts/verify-db.js');
