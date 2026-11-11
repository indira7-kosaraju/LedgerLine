// Creates the FIRST administrator – the only way to get an admin besides the local dev seed.
//
//   npm run admin:bootstrap -- --email you@example.org --name "Your Name"
//   npm run admin:bootstrap -- --production --email you@example.org --name "Your Name" --replace-demo-admin
//
// - The password is typed twice at a hidden prompt. It is never printed, stored in a file or logged.
//   (Without a terminal, e.g. in tests, it is read from stdin: password and confirmation on two lines.)
// - Refuses if an active admin already exists, and never promotes an existing user.
// - --production uses DATABASE_URL from backend/.env.production only (same rules as db:prepare:production).
// - --replace-demo-admin deactivates the public demo.admin@example.com in the same transaction.
// - Writes an ADMIN_BOOTSTRAP audit entry.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { parseArgs } = require('util');
const dotenv = require('dotenv');

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    production: { type: 'boolean', default: false },
    'replace-demo-admin': { type: 'boolean', default: false },
  },
});

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

// Must happen BEFORE the app code is loaded, because src/config/env.js reads DATABASE_URL once.
if (args.production) {
  const file = path.join(__dirname, '..', '.env.production');
  if (!fs.existsSync(file)) fail('Missing backend/.env.production with DATABASE_URL="…" (see docs/DEPLOYMENT.md).');
  const { DATABASE_URL } = dotenv.parse(fs.readFileSync(file));
  if (!DATABASE_URL) fail('backend/.env.production has no DATABASE_URL.');
  process.env.DATABASE_URL = DATABASE_URL;
}
// The shared config requires a JWT secret; this script never signs a token, so any random value will do.
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');

let host;
try {
  require('dotenv').config({ quiet: true }); // local .env for everything else (never overrides DATABASE_URL above)
  host = new URL(process.env.DATABASE_URL).hostname;
} catch {
  fail('DATABASE_URL is missing or not a valid URL.');
}
if (args.production && /^(localhost|127\.0\.0\.1|::1)$/.test(host)) {
  fail('Refusing: DATABASE_URL in .env.production points to this computer, not to a managed database.');
}

// Hidden prompt: the typed characters are not echoed to the terminal.
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) rl.output.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function readPasswords() {
  if (process.stdin.isTTY) {
    return [await askHidden('Password (hidden): '), await askHidden('Repeat password: ')];
  }
  const lines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  return [lines[0] ?? '', lines[1] ?? ''];
}

async function main() {
  const interactive = process.stdin.isTTY;
  const email = args.email ?? (interactive ? await ask('Admin email: ') : '');
  const fullName = args.name ?? (interactive ? await ask('Admin full name: ') : '');
  if (!email || !fullName) fail('Give --email and --name (or run it in a terminal to be asked).');

  console.log(`Database host: ${host}${args.production ? ' (PRODUCTION)' : ''}`);
  const [password, repeat] = await readPasswords();
  if (password !== repeat) fail('The two passwords do not match. Nothing was created.');

  const { bootstrapFirstAdmin } = require('../src/services/adminBootstrap.service');
  const prisma = require('../src/config/prisma');
  try {
    const { admin, demoAdminDeactivated } = await bootstrapFirstAdmin({ email, fullName, password, replaceDemoAdmin: args['replace-demo-admin'] });
    console.log(`✅ First admin created: ${admin.email} (${admin.fullName})`);
    if (demoAdminDeactivated) console.log('✅ Public demo admin demo.admin@example.com deactivated (its sessions are revoked).');
    console.log('   Audit entry ADMIN_BOOTSTRAP written. Sign in on the website with the new email and password.');
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      for (const d of err.details) console.error(`   - ${d.field}: ${d.message}`);
    }
    process.exitCode = 1;
    console.error(`❌ ${err.message}. Nothing was created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
