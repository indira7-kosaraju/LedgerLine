// Money movement rules: amounts, limits, balances, statuses, double entry, privacy.
const {
  app, prisma, request, createUser, createAccount, deposit, withdraw, transfer, balanceOf,
} = require('../helpers');

afterAll(() => prisma.$disconnect());

const entriesFor = (transactionId) => prisma.ledgerEntry.findMany({ where: { transactionId }, orderBy: { entryNumber: 'asc' } });

test('Day 1 scenario: ₹5,000 + ₹2,000 − ₹1,000 − ₹500 → sender ₹5,500, receiver +₹500', async () => {
  const sender = await createUser();
  const receiver = await createUser();
  const a = await createAccount(sender);
  const b = await createAccount(receiver);

  expect((await deposit(sender, a.id, 500000)).status).toBe(201);
  expect((await deposit(sender, a.id, 200000)).status).toBe(201);
  expect((await withdraw(sender, a.id, 100000)).status).toBe(201);
  const t = await request(app)
    .post('/api/transactions/transfer')
    .set(sender.auth)
    .set('Idempotency-Key', require('crypto').randomUUID())
    .send({ fromAccountId: a.id, toAccountNumber: b.accountNumber, amountPaise: 50000 });
  expect(t.status).toBe(201);

  expect(await balanceOf(a.id)).toBe(550000n);
  expect(await balanceOf(b.id)).toBe(50000n);
  expect(t.body.account.id).toBe(a.id); // only the SENDER's balance is returned
  expect(JSON.stringify(t.body)).not.toContain('"balanceAfter"');
});

test('every transfer writes exactly one DEBIT (from) and one CREDIT (to) with running balances', async () => {
  const holder = await createUser();
  const a = await createAccount(holder);
  const b = await createAccount(holder);
  await deposit(holder, a.id, 10000);
  const res = await transfer(holder, a.id, b.id, 2500);
  const [debit, credit] = await entriesFor(res.body.transaction.id);
  expect(debit).toMatchObject({ accountId: a.id, direction: 'DEBIT', amount: 2500n, balanceAfter: 7500n });
  expect(credit).toMatchObject({ accountId: b.id, direction: 'CREDIT', amount: 2500n, balanceAfter: 2500n });
});

describe('Amount validation (refused before any money logic, and audited)', () => {
  let holder, account;
  beforeAll(async () => {
    holder = await createUser();
    account = await createAccount(holder);
  });
  test.each([0, -100, 10.5, '1e5', '12.34', 'abc', null, true])('amountPaise %p → 400', async (amountPaise) => {
    const res = await deposit(holder, account.id, amountPaise);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  test('nothing moved and the attempts were audited', async () => {
    expect(await balanceOf(account.id)).toBe(0n);
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, reason: 'VALIDATION_ERROR' } })).toBe(8);
  });
});

describe('Business rules', () => {
  let holder, a, b;
  beforeAll(async () => {
    holder = await createUser();
    a = await createAccount(holder);
    b = await createAccount(holder);
    await deposit(holder, a.id, 100000);
  });

  test('insufficient balance → 422, nothing moves, refusal audited with the reason', async () => {
    const res = await withdraw(holder, a.id, 100001);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await balanceOf(a.id)).toBe(100000n);
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, reason: 'INSUFFICIENT_FUNDS' } })).toBe(1);
  });

  test('withdrawing the exact balance is allowed (down to ₹0, never below)', async () => {
    const c = await createAccount(holder);
    await deposit(holder, c.id, 777);
    expect((await withdraw(holder, c.id, 777)).status).toBe(201);
    expect(await balanceOf(c.id)).toBe(0n);
    expect((await withdraw(holder, c.id, 1)).status).toBe(422);
  });

  test('deposit over ₹1,00,000 and transfer over ₹5,00,000 → 422 AMOUNT_EXCEEDS_LIMIT', async () => {
    expect((await deposit(holder, a.id, 10000001)).body.error.code).toBe('AMOUNT_EXCEEDS_LIMIT');
    expect((await transfer(holder, a.id, b.id, 50000001)).body.error.code).toBe('AMOUNT_EXCEEDS_LIMIT');
  });

  test('transfer to the same account → 400; to an unknown number → 404', async () => {
    expect((await transfer(holder, a.id, a.id, 100)).body.error.code).toBe('SAME_ACCOUNT');
    const unknown = await request(app)
      .post('/api/transactions/transfer')
      .set(holder.auth)
      .set('Idempotency-Key', require('crypto').randomUUID())
      .send({ fromAccountId: a.id, toAccountNumber: 'LL0000000000', amountPaise: 100 });
    expect(unknown.status).toBe(404);
  });

  test('a frozen destination cannot receive money', async () => {
    const admin = await createUser('ADMIN');
    await request(app).patch(`/api/accounts/${b.id}/status`).set(admin.auth).send({ status: 'FROZEN' }).expect(200);
    const res = await transfer(holder, a.id, b.id, 100);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DESTINATION_NOT_ACTIVE');
    await request(app).patch(`/api/accounts/${b.id}/status`).set(admin.auth).send({ status: 'ACTIVE' }).expect(200);
  });
});

describe('Transaction details privacy', () => {
  let sender, receiver, auditor, txnId;
  beforeAll(async () => {
    [sender, receiver, auditor] = await Promise.all([createUser(), createUser(), createUser('AUDITOR')]);
    const a = await createAccount(sender);
    const b = await createAccount(receiver);
    await deposit(sender, a.id, 10000);
    txnId = (await transfer(sender, a.id, b.id, 1000)).body.transaction.id;
  });

  test("the sender sees only their own entry, not the receiver's balance", async () => {
    const res = await request(app).get(`/api/transactions/${txnId}`).set(sender.auth);
    expect(res.body.ledgerEntries.map((e) => e.direction)).toEqual(['DEBIT']);
    expect(res.body.entriesHidden).toBe(1);
  });

  test('the receiver sees only their credit and not who sent it', async () => {
    const res = await request(app).get(`/api/transactions/${txnId}`).set(receiver.auth);
    expect(res.body.ledgerEntries.map((e) => e.direction)).toEqual(['CREDIT']);
    expect(res.body.transaction.initiatedBy).toBeNull();
  });

  test('the auditor sees both entries and the initiator', async () => {
    const res = await request(app).get(`/api/transactions/${txnId}`).set(auditor.auth);
    expect(res.body.ledgerEntries).toHaveLength(2);
    expect(res.body.transaction.initiatedBy.id).toBe(sender.user.id);
  });

  test('nobody receives internal owner ids', async () => {
    const res = await request(app).get(`/api/transactions/${txnId}`).set(receiver.auth);
    expect(JSON.stringify(res.body)).not.toContain('ownerId');
  });
});

test('history search by reference finds the transaction', async () => {
  const holder = await createUser();
  const a = await createAccount(holder);
  const ref = (await deposit(holder, a.id, 4242)).body.transaction.reference;
  const res = await request(app).get(`/api/transactions?q=${ref.slice(-6)}`).set(holder.auth);
  expect(res.body.items.map((t) => t.reference)).toContain(ref);
});
