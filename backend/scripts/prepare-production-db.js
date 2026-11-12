// Prepares the PRODUCTION database: migrations → API role privileges → SYSTEM account → demo data → verification.
// Run it from your computer BEFORE deploying code that needs a new migration (the server never migrates –
// it doesn't have the owner credentials).
//
//   1. backend/.env.production (ignored by Git) holds TWO connection strings:
//        DATABASE_URL="postgresql://ledgerline_api:<password>@ep-…-pooler.….neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5"
//        DIRECT_DATABASE_URL="postgresql://neondb_owner:<password>@ep-….….neon.tech/neondb?sslmode=require"   (no "-pooler")
//   2. npm run db:prepare:production
//
// Safety:
// - Only backend/.env.production is used for DATABASE_URL – never your local .env database.
// - The private admin/auditor from your local .env are NOT copied to production, and the
//   public demo admin is never created there:
//   SEED_* is empty unless you set it in .env.production yourself.
// - The owner (DIRECT_DATABASE_URL) is used only for migrations and role setup; seeds run as the API role.
// - The connection strings are never printed (only host and role names).
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
const fail = (message) => {
  console.error(`Refusing: ${message} (see docs/DEPLOYMENT.md).`);
  process.exit(1);
};
const urls = {};
for (const name of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) {
  if (!prod[name]) fail(`backend/.env.production has no ${name}`);
  try {
    urls[name] = new URL(prod[name]);
  } catch {
    fail(`${name} in backend/.env.production is not a valid URL`);
  }
  if (/^(localhost|127\.0\.0\.1|::1)$/.test(urls[name].hostname)) fail(`${name} points to this computer, not to a managed database`);
}
if (/-pooler\./.test(urls.DIRECT_DATABASE_URL.hostname)) fail('DIRECT_DATABASE_URL must be the DIRECT connection (host without "-pooler")');
if (urls.DATABASE_URL.username === urls.DIRECT_DATABASE_URL.username) fail('DATABASE_URL must use the API role, not the owner');
if (/-pooler\./.test(urls.DATABASE_URL.hostname) && urls.DATABASE_URL.searchParams.get('pgbouncer') !== 'true') {
  fail('the pooled DATABASE_URL needs "&pgbouncer=true" (Prisma must not use prepared statements through PgBouncer)');
}
const host = urls.DIRECT_DATABASE_URL.hostname;

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

console.log(`Production database host: ${host} – owner: ${urls.DIRECT_DATABASE_URL.username}, API role: ${urls.DATABASE_URL.username}`);
run('Apply migrations (as the owner, direct connection)', 'npx prisma migrate deploy');
run('Set the API role and its privileges (as the owner)', 'node scripts/setup-db-roles.js --production');
run('Seed SYSTEM account (and private admin/auditor only if set in .env.production)', 'node prisma/seed.js');
run('Seed demo users and demo transactions (safe dummy credentials)', 'node prisma/seed-demo.js');
run('Verify the database (read-only, as the API role)', 'node scripts/verify-db.js');
