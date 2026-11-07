// Financial integrity: correct debit/credit records, money conservation, no negative
// balances, balanced ledger, and refused or failed operations that leave NO trace.
// Every check is verified directly in PostgreSQL (tests/invariants.js), not through app code.
const crypto = require('crypto');
const {
  app, prisma, request, createUser, createAccount, deposit, withdraw, transfer, balanceOf,
} = require('../helpers');
const { expectHealthyLedger, snapshot } = require('../invariants');
const { SYSTEM_ACCOUNT_NUMBER } = require('../../src/config/policy');

afterAll(() => prisma.$disconnect());

let systemId;
beforeAll(async () => {
  systemId = (await prisma.account.findUnique({ where: { accountNumber: SYSTEM_ACCOUNT_NUMBER } })).id;
});

const entriesOf = (transactionId) =>
  prisma.ledgerEntry.findMany({ where: { transactionId }, orderBy: { entryNumber: 'asc' }, select: { accountId: true, direction: true, amount: true, balanceAfter: true } });

describe('Each operation writes the correct debit and credit records', () => {
  test('deposit: DEBIT the SYSTEM account, CREDIT the customer', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const systemBefore = await balanceOf(systemId);

    const res = await deposit(holder, account.id, 50000);
    expect(res.status).toBe(201);

    expect(await entriesOf(res.body.transaction.id)).toEqual([
      { accountId: systemId, direction: 'DEBIT', amount: 50000n, balanceAfter: systemBefore - 50000n },
      { accountId: account.id, direction: 'CREDIT', amount: 50000n, balanceAfter: 50000n },
    ]);
    expect(await balanceOf(account.id)).toBe(50000n);
  });

  test('withdrawal: DEBIT the customer, CREDIT the SYSTEM account', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    await deposit(holder, account.id, 50000);
    const systemBefore = await balanceOf(systemId);

    const res = await withdraw(holder, account.id, 20000);
    expect(res.status).toBe(201);

    expect(await entriesOf(res.body.transaction.id)).toEqual([
      { accountId: account.id, direction: 'DEBIT', amount: 20000n, balanceAfter: 30000n },
      { accountId: systemId, direction: 'CREDIT', amount: 20000n, balanceAfter: systemBefore + 20000n },
    ]);
  });

  test('transfer: DEBIT sender, CREDIT receiver – the SYSTEM account is not touched', async () => {
    const holder = await createUser();
    const from = await createAccount(holder);
    const to = await createAccount(holder);
    await deposit(holder, from.id, 50000);
    const systemBefore = await balanceOf(systemId);

    const res = await transfer(holder, from.id, to.id, 12345);
    expect(res.status).toBe(201);

    expect(await entriesOf(res.body.transaction.id)).toEqual([
      { accountId: from.id, direction: 'DEBIT', amount: 12345n, balanceAfter: 37655n },
      { accountId: to.id, direction: 'CREDIT', amount: 12345n, balanceAfter: 12345n },
    ]);
    expect(await balanceOf(systemId)).toBe(systemBefore);
  });
});

test('money conservation: customers gain exactly deposits − withdrawals; transfers create nothing', async () => {
  const holder = await createUser();
  const [a, b, c] = await Promise.all([createAccount(holder), createAccount(holder), createAccount(holder)]);
  const customerTotal = async () => (await balanceOf(a.id)) + (await balanceOf(b.id)) + (await balanceOf(c.id));

  await deposit(holder, a.id, 100000);
  await deposit(holder, b.id, 40000);
  await withdraw(holder, a.id, 15000);
  expect(await customerTotal()).toBe(125000n); // 100000 + 40000 − 15000

  await transfer(holder, a.id, b.id, 30000);
  await transfer(holder, b.id, c.id, 50000);
  await transfer(holder, c.id, a.id, 10000);
  expect(await customerTotal()).toBe(125000n); // transfers move money, never create or destroy it

  expect([await balanceOf(a.id), await balanceOf(b.id), await balanceOf(c.id)]).toEqual([65000n, 20000n, 40000n]);
  await expectHealthyLedger(); // all balances in the whole database (SYSTEM included) still sum to 0
});

describe('Invalid amounts are refused on every money endpoint – and change nothing', () => {
  let holder, from, to;
  beforeAll(async () => {
    holder = await createUser();
    from = await createAccount(holder);
    to = await createAccount(holder);
    await deposit(holder, from.id, 10000);
  });

  const send = {
    deposit: (amountPaise) => ({ path: '/api/transactions/deposit', body: { accountId: from.id, amountPaise } }),
    withdraw: (amountPaise) => ({ path: '/api/transactions/withdraw', body: { accountId: from.id, amountPaise } }),
    transfer: (amountPaise) => ({ path: '/api/transactions/transfer', body: { fromAccountId: from.id, toAccountId: to.id, amountPaise } }),
  };
  const cases = [];
  for (const endpoint of Object.keys(send)) {
    for (const [label, value] of [['zero', 0], ['negative', -500], ['decimal', 10.5], ['"1e3"', '1e3'], ['"abc"', 'abc'], ['empty', ''], ['null', null], ['missing', undefined]]) {
      cases.push([endpoint, label, value]);
    }
  }

  test.each(cases)('%s with %s amount → 400', async (endpoint, _, value) => {
    const before = await snapshot([from.id, to.id]);
    const { path, body } = send[endpoint](value);
    const res = await request(app).post(path).set(holder.auth).set('Idempotency-Key', crypto.randomUUID()).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await snapshot([from.id, to.id])).toEqual(before);
  });
});

describe('Business refusals leave no partial writes', () => {
  let holder, a, b, admin;
  beforeAll(async () => {
    [holder, admin] = await Promise.all([createUser(), createUser('ADMIN')]);
    a = await createAccount(holder);
    b = await createAccount(holder);
    await deposit(holder, a.id, 10000);
  });

  test.each([
    ['insufficient balance', () => withdraw(holder, a.id, 10001), 422, 'INSUFFICIENT_FUNDS'],
    ['transfer more than the balance', () => transfer(holder, a.id, b.id, 10001), 422, 'INSUFFICIENT_FUNDS'],
    ['deposit over the limit', () => deposit(holder, a.id, 10000001), 422, 'AMOUNT_EXCEEDS_LIMIT'],
    ['transfer to the same account', () => transfer(holder, a.id, a.id, 100), 400, 'SAME_ACCOUNT'],
  ])('%s → %i %s, balances and ledger unchanged, refusal audited', async (_, act, status, code) => {
    const before = await snapshot([a.id, b.id, systemId]);
    const res = await act();
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(await snapshot([a.id, b.id, systemId])).toEqual(before);
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, outcome: 'REFUSED', reason: code } })).toBeGreaterThan(0);
  });

  test('frozen account → 422, nothing written', async () => {
    await request(app).patch(`/api/accounts/${a.id}/status`).set(admin.auth).send({ status: 'FROZEN' }).expect(200);
    const before = await snapshot([a.id, b.id, systemId]);
    expect((await withdraw(holder, a.id, 100)).body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect(await snapshot([a.id, b.id, systemId])).toEqual(before);
    await request(app).patch(`/api/accounts/${a.id}/status`).set(admin.auth).send({ status: 'ACTIVE' }).expect(200);
  });
});

test('failed withdrawal is rolled back completely (balance update + transaction row undone)', async () => {
  const holder = await createUser();
  const account = await createAccount(holder);
  await deposit(holder, account.id, 30000);
  const before = await snapshot([account.id, systemId]);

  // Simulate a crash when the DEBIT entry is written – AFTER both balances were already
  // updated inside the transaction.
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_debit() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'simulated crash while writing the debit entry'; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER test_fail_debit BEFORE INSERT ON ledger_entries
    FOR EACH ROW WHEN (NEW."accountId" = '${account.id}'::uuid AND NEW.direction = 'DEBIT') EXECUTE FUNCTION test_fail_debit()`);
  let res;
  try {
    res = await withdraw(holder, account.id, 5000);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_debit ON ledger_entries');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_fail_debit()');
  }

  expect(res.status).toBe(500);
  expect(await snapshot([account.id, systemId])).toEqual(before);
  await expectHealthyLedger();
});

test('after everything in this file, the whole database is still consistent (independent SQL check)', async () => {
  await expectHealthyLedger();
});
