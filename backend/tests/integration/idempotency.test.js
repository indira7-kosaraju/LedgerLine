// Idempotency: a request repeated with the same Idempotency-Key must never move money twice.
const {
  app, prisma, request, newKey, createUser, createAccount, deposit, withdraw, transfer, balanceOf, countTransactions, verifyLedger,
} = require('../helpers');

afterAll(() => prisma.$disconnect());

describe('Idempotency-Key is required and validated', () => {
  let holder, account;
  beforeAll(async () => {
    holder = await createUser();
    account = await createAccount(holder);
  });

  test('missing key → 400, no money moves, refusal audited', async () => {
    const res = await request(app).post('/api/transactions/deposit').set(holder.auth).send({ accountId: account.id, amountPaise: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await balanceOf(account.id)).toBe(0n);
    const audit = await prisma.auditLog.findFirst({ where: { actorId: holder.user.id, reason: 'IDEMPOTENCY_KEY_REQUIRED' } });
    expect(audit).not.toBeNull();
  });

  test.each(['short', 'has spaces in it 1234', 'x'.repeat(101), 'semi;colon-1234567890'])('invalid key %p → 400', async (key) => {
    const res = await deposit(holder, account.id, 1000, key);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_INVALID');
  });
});

describe('Identical retries return the original result', () => {
  test('same key + same body → one transaction, second response replayed', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const key = newKey();

    const first = await deposit(holder, account.id, 500000, key);
    const second = await deposit(holder, account.id, '500000', key); // same amount sent as a string

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.transaction.id).toBe(first.body.transaction.id);
    expect(second.body).toEqual(first.body); // same content (JSON key order may differ)

    expect(await balanceOf(account.id)).toBe(500000n); // moved ONCE
    expect(await countTransactions(account.id)).toBe(1);
  });

  test('the stored key records fingerprint, response and transaction', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const key = newKey();
    const res = await deposit(holder, account.id, 1234, key);

    const record = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId: holder.user.id, key } } });
    expect(record.status).toBe('COMPLETED');
    expect(record.endpoint).toBe('POST /api/transactions/deposit');
    expect(record.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.responseStatus).toBe(201);
    expect(record.transactionId).toBe(res.body.transaction.id);
    expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
  });

  test('a business refusal is remembered: identical retry gets the same refusal', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const key = newKey();

    const refused = await withdraw(holder, account.id, 1000, key);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('INSUFFICIENT_FUNDS');

    await deposit(holder, account.id, 5000); // now there is enough money…
    const retry = await withdraw(holder, account.id, 1000, key); // …but the SAME key replays the original answer
    expect(retry.status).toBe(422);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(await balanceOf(account.id)).toBe(5000n);

    const fresh = await withdraw(holder, account.id, 1000); // a NEW operation uses a new key
    expect(fresh.status).toBe(201);
    expect(await balanceOf(account.id)).toBe(4000n);
  });
});

describe('Reusing a key for a different request is rejected', () => {
  let holder, account, other;
  beforeAll(async () => {
    holder = await createUser();
    account = await createAccount(holder);
    other = await createAccount(holder);
    await deposit(holder, account.id, 100000);
  });

  test('same key, different amount → 422, no money moves', async () => {
    const key = newKey();
    expect((await withdraw(holder, account.id, 1000, key)).status).toBe(201);
    const res = await withdraw(holder, account.id, 2000, key);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await balanceOf(account.id)).toBe(99000n);
  });

  test('same key on a different endpoint → 422', async () => {
    const key = newKey();
    expect((await deposit(holder, account.id, 1000, key)).status).toBe(201);
    const res = await withdraw(holder, account.id, 1000, key);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  test('same key, different destination → 422', async () => {
    const third = await createAccount(holder);
    const key = newKey();
    expect((await transfer(holder, account.id, other.id, 500, key)).status).toBe(201);
    const res = await transfer(holder, account.id, third.id, 500, key);
    expect(res.status).toBe(422);
    expect(await balanceOf(third.id)).toBe(0n);
  });
});

describe('Keys are scoped and identify operations', () => {
  test('two users can use the same key value independently', async () => {
    const a = await createUser();
    const b = await createUser();
    const accA = await createAccount(a);
    const accB = await createAccount(b);
    const key = newKey();
    expect((await deposit(a, accA.id, 700, key)).status).toBe(201);
    const resB = await deposit(b, accB.id, 700, key);
    expect(resB.status).toBe(201);
    expect(resB.headers['idempotent-replayed']).toBeUndefined();
    expect(await balanceOf(accB.id)).toBe(700n);
  });

  test('different keys with identical bodies are two separate operations', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    await deposit(holder, account.id, 300);
    await deposit(holder, account.id, 300);
    expect(await balanceOf(account.id)).toBe(600n);
    expect(await countTransactions(account.id)).toBe(2);
  });

  test('an expired key is treated as new', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const key = newKey();
    await deposit(holder, account.id, 100, key);
    await prisma.idempotencyKey.update({ where: { userId_key: { userId: holder.user.id, key } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const again = await deposit(holder, account.id, 100, key);
    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replayed']).toBeUndefined();
    expect(await balanceOf(account.id)).toBe(200n);
  });
});

describe('Simultaneous requests with the same key', () => {
  test('10 identical deposits at once → exactly one transaction, all get the same result', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const key = newKey();

    const results = await Promise.all(Array.from({ length: 10 }, () => deposit(holder, account.id, 2500, key)));

    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    const ids = new Set(results.map((r) => r.body.transaction.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(9);
    expect(await balanceOf(account.id)).toBe(2500n);
    expect(await countTransactions(account.id)).toBe(1);
  });

  test('10 identical transfers at once → money leaves the account once', async () => {
    const holder = await createUser();
    const from = await createAccount(holder);
    const to = await createAccount(holder);
    await deposit(holder, from.id, 10000);
    const key = newKey();

    const results = await Promise.all(Array.from({ length: 10 }, () => transfer(holder, from.id, to.id, 4000, key)));

    expect(new Set(results.map((r) => r.status))).toEqual(new Set([201]));
    expect(await balanceOf(from.id)).toBe(6000n);
    expect(await balanceOf(to.id)).toBe(4000n);
  });

  test('same key, different bodies at once → one wins, the rest are rejected, nothing extra moves', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    await deposit(holder, account.id, 100000);
    const key = newKey();

    const results = await Promise.all([1000, 2000, 3000, 4000].map((amt) => withdraw(holder, account.id, amt, key)));
    const ok = results.filter((r) => r.status === 201);
    const statuses = results.map((r) => r.status).sort();

    expect(ok).toHaveLength(1);
    expect(statuses.filter((s) => s === 422)).toHaveLength(3);
    const moved = BigInt(ok[0].body.transaction.amount.paise);
    expect(await balanceOf(account.id)).toBe(100000n - moved);
  });
});

test('the ledger still balances after all idempotency tests', async () => {
  const result = await verifyLedger();
  expect(result.ok).toBe(true);
});
