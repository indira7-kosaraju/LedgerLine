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
// classic = the original Asha/Ravi demo; personas = Indira/Divya (sign-in page "Evaluation & Demo Personas").
const demoUsers = ({ personas = true } = {}) => {
  const id = crypto.randomUUID().slice(0, 8);
  return [
    { key: 'asha', email: `asha-${id}@example.com`, fullName: 'Asha Test', role: 'ACCOUNT_HOLDER' },
    { key: 'ravi', email: `ravi-${id}@example.com`, fullName: 'Ravi Test', role: 'ACCOUNT_HOLDER' },
    ...(personas
      ? [
          { key: 'indira', email: `indira-${id}@example.com`, fullName: 'Indira Test', role: 'ACCOUNT_HOLDER' },
          { key: 'divya', email: `divya-${id}@example.com`, fullName: 'Divya Test', role: 'ACCOUNT_HOLDER' },
        ]
      : []),
  ];
};
const quiet = () => {};
const GROUP_KEYS = { classic: ['asha', 'ravi'], personas: ['indira', 'divya'] };

async function stateOf(users, group) {
  const ids = GROUP_KEYS[group].map((key) => users[key].id);
  const accounts = await prisma.account.findMany({ where: { ownerId: { in: ids } }, orderBy: { accountNumber: 'asc' } });
  return {
    transactions: await prisma.transaction.count({ where: { initiatedById: { in: ids } } }),
    moneyAudits: await prisma.auditLog.count({ where: { actorId: { in: ids }, action: { startsWith: 'TXN_' } } }),
    balances: accounts.map((a) => a.balance.toString()),
  };
}
const balanceOf = async (user, index) =>
  (await prisma.account.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' } }))[index].balance.toString();

test('first run: classic demo has 6 transactions + 1 refused withdrawal; Indira/Divya get 7 transactions', async () => {
  const run = await seedDemo({ demoUsers: demoUsers(), log: quiet });
  expect(run.groups.classic.transactions).toBe('created');
  expect(run.groups.classic.results.filter((r) => r === 'created')).toHaveLength(6);
  expect(run.groups.classic.results[6]).toBe('refused (INSUFFICIENT_FUNDS)');
  expect((await stateOf(run.users, 'classic')).transactions).toBe(6);

  expect(run.groups.personas.transactions).toBe('created');
  expect(run.groups.personas.results).toEqual(Array(7).fill('created'));
  expect((await stateOf(run.users, 'personas')).transactions).toBe(7);
  // Indira: 6,000 + 1,500 − 500 − 750 − 2,000 + 300 = ₹4,550 (main) and ₹2,000 (savings); Divya: 2,500 + 750 − 300 = ₹2,950.
  expect(await balanceOf(run.users.indira, 0)).toBe('455000');
  expect(await balanceOf(run.users.indira, 1)).toBe('200000');
  expect(await balanceOf(run.users.divya, 0)).toBe('295000');
});

test('Indira and Divya are onboarded account holders, like the other demo holders', async () => {
  const run = await seedDemo({ demoUsers: demoUsers(), log: quiet });
  for (const key of ['indira', 'divya']) {
    const user = await prisma.user.findUnique({ where: { id: run.users[key].id }, include: { profile: true } });
    expect(user).toMatchObject({ role: 'ACCOUNT_HOLDER', onboardingStatus: 'APPROVED', isActive: true });
    expect(user.profile).not.toBeNull();
  }
});

test.each([
  ['immediately (keys still valid)', async () => {}],
  ['after the idempotency keys EXPIRED (the production bug)', async (ids) => {
    await prisma.idempotencyKey.updateMany({ where: { userId: { in: ids } }, data: { expiresAt: new Date(Date.now() - 1000) } });
  }],
  ['after the idempotency keys were DELETED', async (ids) => {
    await prisma.idempotencyKey.deleteMany({ where: { userId: { in: ids } } });
  }],
])('re-run %s → nothing new in either group: no transaction, no audit record, balances unchanged', async (_, prepare) => {
  const users = demoUsers();
  const first = await seedDemo({ demoUsers: users, log: quiet });
  const before = { classic: await stateOf(first.users, 'classic'), personas: await stateOf(first.users, 'personas') };
  await prepare(Object.values(first.users).map((u) => u.id));

  const again = await seedDemo({ demoUsers: users, log: quiet });
  expect(again.groups.classic).toMatchObject({ transactions: 'skipped', existing: 6 });
  expect(again.groups.personas).toMatchObject({ transactions: 'skipped', existing: 7 });
  expect({ classic: await stateOf(again.users, 'classic'), personas: await stateOf(again.users, 'personas') }).toEqual(before);
});

test('adding Indira/Divya to an existing Asha/Ravi demo leaves Asha and Ravi untouched', async () => {
  const classicOnly = demoUsers({ personas: false });
  const first = await seedDemo({ demoUsers: classicOnly, log: quiet });
  expect(first.groups).not.toHaveProperty('personas'); // a group runs only when all its holders are given
  const before = await stateOf(first.users, 'classic');

  const withPersonas = [...classicOnly, ...demoUsers().slice(2)];
  const run = await seedDemo({ demoUsers: withPersonas, log: quiet });
  expect(run.groups.classic).toMatchObject({ transactions: 'skipped', existing: 6 });
  expect(run.groups.personas.transactions).toBe('created');
  expect(run.users.asha.id).toBe(first.users.asha.id);
  expect(await stateOf(run.users, 'classic')).toEqual(before);
});

test.each([
  ['asha', 'classic'],
  ['indira', 'personas'],
])('a demo holder (%s) who already used the app is not seeded on top', async (key, group) => {
  const users = demoUsers();
  // The "visitor": an onboarded holder with the demo email, one account and one deposit made through the API.
  const visitor = await createUser();
  await prisma.user.update({ where: { id: visitor.user.id }, data: { email: users.find((u) => u.key === key).email } });
  const account = await createAccount(visitor);
  expect((await deposit(visitor, account.id, 1000)).status).toBe(201);

  const run = await seedDemo({ demoUsers: users, log: quiet });
  expect(run.groups[group]).toMatchObject({ transactions: 'skipped', existing: 1 });
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
