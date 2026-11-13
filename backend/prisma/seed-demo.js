// Demo data with SAFE DUMMY credentials (documented publicly in README.md).
// Run AFTER the normal seed:   npm run db:seed && npm run db:seed:demo
//
// - Uses the reserved example.com domain and a dummy password – never real people or data.
// - Money is moved through the real transaction service (locks, ledger, audit, idempotency),
//   so the demo ledger is exactly as consistent as real usage.
// - Safe to run many times: users/accounts are only created once, and the demo transactions are created
//   only if NEITHER demo holder has any transaction yet. (Idempotency keys alone are not enough: they expire
//   after 24 hours – on production, 2026-11-12, a re-run after that executed all 7 demo operations again.)
// - On production it runs only when asked: npm run db:prepare:production -- --with-demo
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const prisma = require('../src/config/prisma');
const transactionService = require('../src/services/transaction.service');
const { canonicalJson } = require('../src/middleware/idempotency');
const { generateAccountNumber } = require('../src/utils/accountNumber');

const DEMO_PASSWORD = 'DemoPass123'; // dummy – shown in README.md on purpose

const DEMO_USERS = [
  { key: 'asha', email: 'asha.holder@example.com', fullName: 'Asha Verma', role: 'ACCOUNT_HOLDER', accounts: 2 },
  { key: 'ravi', email: 'ravi.holder@example.com', fullName: 'Ravi Kumar', role: 'ACCOUNT_HOLDER', accounts: 1 },
  { key: 'admin', email: 'demo.admin@example.com', fullName: 'Demo Administrator', role: 'ADMIN', accounts: 0 },
  { key: 'auditor', email: 'demo.auditor@example.com', fullName: 'Demo Auditor', role: 'AUDITOR', accounts: 0 },
];

// The demo ADMIN has a published password, so it must never exist on a public deployment.
// prepare-production-db.js sets SEED_DEMO_ADMIN=false; locally it defaults to true.
const includeDemoAdmin = process.env.SEED_DEMO_ADMIN !== 'false';
const defaultUsers = () => DEMO_USERS.filter((u) => u.role !== 'ADMIN' || includeDemoAdmin);

// Demo holders go through onboarding like everyone else (with an obviously fake profile), because the
// database refuses accounts for holders who are not approved. Staff need no onboarding.
const DEMO_PROFILE = { dateOfBirth: new Date('1990-01-01T00:00:00Z'), phone: '+919000000000', city: 'Demo City', state: 'Karnataka', pinCode: '560001', occupation: 'OTHER' };
const { TERMS_VERSION } = require('../src/config/onboarding');

async function ensureUser({ email, fullName, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
  const now = new Date();
  if (role !== 'ACCOUNT_HOLDER') {
    return prisma.user.create({ data: { email, fullName, role, passwordHash, onboardingStatus: 'APPROVED', onboardedAt: now } });
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, fullName, role, passwordHash } });
    await tx.customerProfile.create({ data: { userId: user.id, ...DEMO_PROFILE } });
    return tx.user.update({
      where: { id: user.id },
      data: { onboardingStatus: 'APPROVED', onboardedAt: now, termsVersion: TERMS_VERSION, termsAcceptedAt: now },
    });
  });
}

async function ensureAccounts(user, count) {
  const existing = await prisma.account.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' } });
  for (let i = existing.length; i < count; i++) {
    existing.push(await prisma.account.create({ data: { accountNumber: generateAccountNumber(), ownerId: user.id, balance: 0n } }));
  }
  return existing;
}

// Builds the same idempotency object the HTTP middleware would, with a fixed key.
function idempotency(key, path, body) {
  const endpoint = `POST /api/transactions/${path}`;
  const requestHash = crypto.createHash('sha256').update(`${endpoint}\n${canonicalJson(body)}`).digest('hex');
  return { key, endpoint, requestHash };
}

async function move(user, path, key, body) {
  const fn = { deposit: transactionService.deposit, withdraw: transactionService.withdraw, transfer: transactionService.transfer }[path];
  try {
    const result = await fn(user, body, { ipAddress: 'seed-demo', userAgent: 'seed-demo' }, idempotency(key, path, body));
    return result.replayed ? 'replayed' : 'created';
  } catch (err) {
    return `refused (${err.code})`; // e.g. the deliberate insufficient-funds attempt below
  }
}

// `demoUsers` can be replaced (tests use unique emails). Returns what happened, for the tests.
async function seedDemo({ demoUsers = defaultUsers(), log = console.log } = {}) {
  const users = {};
  for (const u of demoUsers) users[u.key] = await ensureUser(u);
  const [ashaMain, ashaSavings] = await ensureAccounts(users.asha, 2);
  const [raviMain] = await ensureAccounts(users.ravi, 1);

  const asha = users.asha;
  const ravi = users.ravi;

  // Created exactly once – whether the fixed keys below still exist, have expired or were cleaned up.
  // Any transaction by a demo holder (from an earlier seed, or a visitor using the public demo login) means: done.
  const existing = await prisma.transaction.count({ where: { initiatedById: { in: [asha.id, ravi.id] } } });
  if (existing > 0) {
    log(`Demo transactions: skipped – the demo holders already have ${existing} transaction(s).`);
    return { users, transactions: 'skipped', existing };
  }

  const steps = [
    [asha, 'deposit', 'demo-seed-0001-deposit-salary', { accountId: ashaMain.id, amountPaise: 500000n, description: 'Salary' }],
    [asha, 'deposit', 'demo-seed-0002-deposit-bonus', { accountId: ashaMain.id, amountPaise: 200000n, description: 'Bonus' }],
    [asha, 'withdraw', 'demo-seed-0003-withdraw-cash', { accountId: ashaMain.id, amountPaise: 100000n, description: 'Cash' }],
    [asha, 'transfer', 'demo-seed-0004-transfer-ravi', { fromAccountId: ashaMain.id, toAccountId: raviMain.id, amountPaise: 50000n, description: 'Dinner' }],
    [asha, 'transfer', 'demo-seed-0005-transfer-savings', { fromAccountId: ashaMain.id, toAccountId: ashaSavings.id, amountPaise: 150000n, description: 'Savings' }],
    [ravi, 'deposit', 'demo-seed-0006-deposit-ravi', { accountId: raviMain.id, amountPaise: 120000n, description: 'Opening deposit' }],
    // A deliberately refused attempt (₹3,000 from ₹1,700), so the auditor dashboard has something to show.
    [ravi, 'withdraw', 'demo-seed-0008-withdraw-insufficient', { accountId: raviMain.id, amountPaise: 300000n, description: 'More than the balance' }],
  ];

  const results = [];
  for (const [user, path, key, body] of steps) {
    const outcome = await move(user, path, key, body);
    results.push(outcome);
    log(`${path.padEnd(8)} ${key.padEnd(34)} → ${outcome}`);
  }
  return { users, transactions: 'created', results };
}

async function main() {
  await seedDemo();
  console.log(`\nDemo users (password for all: ${DEMO_PASSWORD}):`);
  for (const u of defaultUsers()) console.log(`  ${u.role.padEnd(14)} ${u.email}`);
  if (!includeDemoAdmin) console.log('  (no demo admin – create the real one with: npm run admin:bootstrap)');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Demo seed failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedDemo, DEMO_PASSWORD };
