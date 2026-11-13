// Regression (2026-11-12): on production, re-running the demo seed more than 24 hours after the first run executed
// all 7 demo operations AGAIN, because their fixed idempotency keys had expired. The seed must create its demo
// transactions exactly once – whether the keys still exist, have expired or are gone – and production demo seeding
// is opt-in (scripts/prepare-production-db.js --with-demo).
const crypto = require('crypto');
const { prisma, disconnectAll, createUser, createAccount, deposit } = require('../helpers');
const { seedDemo } = require('../../prisma/seed-demo');
const { productionSteps } = require('../../scripts/prepare-production-db');

afterAll(disconnectAll);

// Unique demo users per test, so the test database's other data never matters.
const demoUsers = () => {
  const id = crypto.randomUUID().slice(0, 8);
  return [
    { key: 'asha', email: `asha-${id}@example.com`, fullName: 'Asha Test', role: 'ACCOUNT_HOLDER' },
    { key: 'ravi', email: `ravi-${id}@example.com`, fullName: 'Ravi Test', role: 'ACCOUNT_HOLDER' },
  ];
};
const quiet = () => {};

async function stateOf(users) {
  const ids = [users.asha.id, users.ravi.id];
  const accounts = await prisma.account.findMany({ where: { ownerId: { in: ids } }, orderBy: { accountNumber: 'asc' } });
  return {
    transactions: await prisma.transaction.count({ where: { initiatedById: { in: ids } } }),
    moneyAudits: await prisma.auditLog.count({ where: { actorId: { in: ids }, action: { startsWith: 'TXN_' } } }),
    balances: accounts.map((a) => a.balance.toString()),
  };
}

test('first run: 6 demo transactions, and the deliberately refused withdrawal is refused', async () => {
  const run = await seedDemo({ demoUsers: demoUsers(), log: quiet });
  expect(run.transactions).toBe('created');
  expect(run.results.filter((r) => r === 'created')).toHaveLength(6);
  expect(run.results[6]).toBe('refused (INSUFFICIENT_FUNDS)');
  expect((await stateOf(run.users)).transactions).toBe(6);
});

test.each([
  ['immediately (keys still valid)', async () => {}],
  ['after the idempotency keys EXPIRED (the production bug)', async (ids) => {
    await prisma.idempotencyKey.updateMany({ where: { userId: { in: ids } }, data: { expiresAt: new Date(Date.now() - 1000) } });
  }],
  ['after the idempotency keys were DELETED', async (ids) => {
    await prisma.idempotencyKey.deleteMany({ where: { userId: { in: ids } } });
  }],
])('re-run %s → nothing new: no transaction, no audit record, balances unchanged', async (_, prepare) => {
  const users = demoUsers();
  const first = await seedDemo({ demoUsers: users, log: quiet });
  const before = await stateOf(first.users);
  await prepare([first.users.asha.id, first.users.ravi.id]);

  const again = await seedDemo({ demoUsers: users, log: quiet });
  expect(again).toMatchObject({ transactions: 'skipped', existing: 6 });
  expect(await stateOf(again.users)).toEqual(before);
});

test('a demo holder who already used the app (public demo login, no seed ever ran) is not seeded on top', async () => {
  const users = demoUsers();
  // The "visitor": an onboarded holder with the demo email, one account and one deposit made through the API.
  const visitor = await createUser();
  await prisma.user.update({ where: { id: visitor.user.id }, data: { email: users[0].email } });
  const account = await createAccount(visitor);
  expect((await deposit(visitor, account.id, 1000)).status).toBe(201);

  const run = await seedDemo({ demoUsers: users, log: quiet });
  expect(run).toMatchObject({ transactions: 'skipped', existing: 1 });
  expect(await prisma.transaction.count({ where: { initiatedById: visitor.user.id } })).toBe(1);
});

describe('production demo seeding is opt-in', () => {
  const commands = (argv) => productionSteps(argv).map(([, command]) => command);

  test('without --with-demo: migrations, roles, system seed and verification – no demo seed', () => {
    expect(commands([])).toEqual([
      'npx prisma migrate deploy',
      'node scripts/setup-db-roles.js --production',
      'node prisma/seed.js',
      'node scripts/verify-db.js',
    ]);
  });

  test('with --with-demo: the demo seed runs after the system seed, before verification', () => {
    expect(commands(['--with-demo'])).toEqual([
      'npx prisma migrate deploy',
      'node scripts/setup-db-roles.js --production',
      'node prisma/seed.js',
      'node prisma/seed-demo.js',
      'node scripts/verify-db.js',
    ]);
  });

  test('a mistyped option is refused instead of silently ignored', () => {
    expect(() => productionSteps(['--with-demos'])).toThrow(/Unknown option/);
  });
});
