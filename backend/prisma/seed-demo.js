// Demo data with SAFE DUMMY credentials (documented publicly in README.md).
// Run AFTER the normal seed:   npm run db:seed && npm run db:seed:demo
//
// - Uses the reserved example.com domain and a dummy password – never real people or data.
// - Money is moved through the real transaction service (locks, ledger, audit, idempotency),
//   so the demo ledger is exactly as consistent as real usage.
// - Safe to run many times: users/accounts are only created once, and each demo GROUP's transactions are created
//   only if NONE of that group's holders has any transaction yet. (Idempotency keys alone are not enough: they
//   expire after 24 hours – on production, 2026-11-12, a re-run after that executed all 7 demo operations again.)
// - Two independent groups: the original Asha/Ravi demo, and the Indira/Divya personas shown on the sign-in page
//   (added later). An existing Asha/Ravi demo is never touched when the Indira/Divya group is added.
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
  // The sign-in page's "Evaluation & Demo Personas" (frontend/src/config/demoPersonas.js).
  { key: 'indira', email: 'indira.holder@example.com', fullName: 'Indira Holder', role: 'ACCOUNT_HOLDER', accounts: 2 },
  { key: 'divya', email: 'divya.holder@example.com', fullName: 'Divya Holder', role: 'ACCOUNT_HOLDER', accounts: 1 },
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

// Each group: its holders, how many accounts each gets, and its fixed demo steps (built once the accounts exist).
const DEMO_GROUPS = [
  {
    name: 'classic', // the original demo – keys and amounts unchanged
    accounts: { asha: 2, ravi: 1 },
    steps: ({ asha, ravi }, { asha: [ashaMain, ashaSavings], ravi: [raviMain] }) => [
      [asha, 'deposit', 'demo-seed-0001-deposit-salary', { accountId: ashaMain.id, amountPaise: 500000n, description: 'Salary' }],
      [asha, 'deposit', 'demo-seed-0002-deposit-bonus', { accountId: ashaMain.id, amountPaise: 200000n, description: 'Bonus' }],
      [asha, 'withdraw', 'demo-seed-0003-withdraw-cash', { accountId: ashaMain.id, amountPaise: 100000n, description: 'Cash' }],
      [asha, 'transfer', 'demo-seed-0004-transfer-ravi', { fromAccountId: ashaMain.id, toAccountId: raviMain.id, amountPaise: 50000n, description: 'Dinner' }],
      [asha, 'transfer', 'demo-seed-0005-transfer-savings', { fromAccountId: ashaMain.id, toAccountId: ashaSavings.id, amountPaise: 150000n, description: 'Savings' }],
      [ravi, 'deposit', 'demo-seed-0006-deposit-ravi', { accountId: raviMain.id, amountPaise: 120000n, description: 'Opening deposit' }],
      // A deliberately refused attempt (₹3,000 from ₹1,700), so the auditor dashboard has something to show.
      [ravi, 'withdraw', 'demo-seed-0008-withdraw-insufficient', { accountId: raviMain.id, amountPaise: 300000n, description: 'More than the balance' }],
    ],
  },
  {
    name: 'personas', // Indira (primary customer) and Divya (transfer counterparty) – transfers in both directions
    accounts: { indira: 2, divya: 1 },
    steps: ({ indira, divya }, { indira: [indiraMain, indiraSavings], divya: [divyaMain] }) => [
      [indira, 'deposit', 'demo-seed-0101-indira-salary', { accountId: indiraMain.id, amountPaise: 600000n, description: 'Salary' }],
      [indira, 'deposit', 'demo-seed-0102-indira-freelance', { accountId: indiraMain.id, amountPaise: 150000n, description: 'Freelance project' }],
      [indira, 'withdraw', 'demo-seed-0103-indira-groceries', { accountId: indiraMain.id, amountPaise: 50000n, description: 'Groceries' }],
      [indira, 'transfer', 'demo-seed-0104-indira-to-divya', { fromAccountId: indiraMain.id, toAccountId: divyaMain.id, amountPaise: 75000n, description: 'Shared rent' }],
      [indira, 'transfer', 'demo-seed-0105-indira-savings', { fromAccountId: indiraMain.id, toAccountId: indiraSavings.id, amountPaise: 200000n, description: 'Savings' }],
      [divya, 'deposit', 'demo-seed-0106-divya-opening', { accountId: divyaMain.id, amountPaise: 250000n, description: 'Opening deposit' }],
      [divya, 'transfer', 'demo-seed-0107-divya-to-indira', { fromAccountId: divyaMain.id, toAccountId: indiraMain.id, amountPaise: 30000n, description: 'Movie tickets' }],
    ],
  },
];

// Creates one group's accounts and – exactly once – its demo transactions.
async function seedGroup(group, users, log) {
  const holders = Object.keys(group.accounts).map((key) => users[key]);
  const accounts = {};
  for (const [key, count] of Object.entries(group.accounts)) accounts[key] = await ensureAccounts(users[key], count);

  // Created exactly once – whether the fixed keys still exist, have expired or were cleaned up.
  // Any transaction by one of the group's holders (an earlier seed, or a visitor using the public demo login) means: done.
  const existing = await prisma.transaction.count({ where: { initiatedById: { in: holders.map((h) => h.id) } } });
  if (existing > 0) {
    log(`Demo transactions (${group.name}): skipped – these demo holders already have ${existing} transaction(s).`);
    return { transactions: 'skipped', existing };
  }

  const results = [];
  for (const [user, path, key, body] of group.steps(users, accounts)) {
    const outcome = await move(user, path, key, body);
    results.push(outcome);
    log(`${path.padEnd(8)} ${key.padEnd(34)} → ${outcome}`);
  }
  return { transactions: 'created', results };
}

// `demoUsers` can be replaced (tests use unique emails). A group runs only if all of its holders are in `demoUsers`.
// Returns what happened per group, for the tests.
async function seedDemo({ demoUsers = defaultUsers(), log = console.log } = {}) {
  const users = {};
  for (const u of demoUsers) users[u.key] = await ensureUser(u);

  const groups = {};
  for (const group of DEMO_GROUPS) {
    if (Object.keys(group.accounts).every((key) => users[key])) groups[group.name] = await seedGroup(group, users, log);
  }
  return { users, groups };
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
