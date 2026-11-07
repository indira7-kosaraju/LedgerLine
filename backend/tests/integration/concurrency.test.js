// Concurrency: simultaneous requests must never overdraw an account, deadlock,
// leave partial transfers, or break the ledger.
const { Prisma } = require('@prisma/client');
const {
  prisma, createUser, createAccount, deposit, withdraw, transfer, balanceOf, verifyLedger,
} = require('../helpers');
const { withRetry, isRetryable } = require('../../src/services/transaction.service');
const { expectHealthyLedger } = require('../invariants');

afterAll(() => prisma.$disconnect());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const statuses = (responses) => responses.map((r) => r.status).sort();

async function fundedAccount(holder, paise) {
  const account = await createAccount(holder);
  if (paise > 0) expect((await deposit(holder, account.id, paise)).status).toBe(201);
  return account;
}

describe('Two simultaneous withdrawals: ₹1,000 balance, ₹800 and ₹700', () => {
  // Repeated, because a race condition does not show up on every single run.
  test.each(Array.from({ length: 20 }, (_, i) => i + 1))('run %i: exactly one succeeds, balance never negative', async () => {
    const holder = await createUser();
    const account = await fundedAccount(holder, 100000); // ₹1,000.00

    const [a, b] = await Promise.all([withdraw(holder, account.id, 80000), withdraw(holder, account.id, 70000)]);

    expect(statuses([a, b])).toEqual([201, 422]);
    const refused = [a, b].find((r) => r.status === 422);
    expect(refused.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect([20000n, 30000n]).toContain(await balanceOf(account.id)); // ₹200 or ₹300 left

    const audited = await prisma.auditLog.count({ where: { actorId: holder.user.id, outcome: 'REFUSED', reason: 'INSUFFICIENT_FUNDS' } });
    expect(audited).toBe(1);
  });

  test('same race with two transfers to different accounts → only one leaves the account', async () => {
    const holder = await createUser();
    const from = await fundedAccount(holder, 100000);
    const x = await createAccount(holder);
    const y = await createAccount(holder);

    const results = await Promise.all([transfer(holder, from.id, x.id, 80000), transfer(holder, from.id, y.id, 70000)]);

    expect(statuses(results)).toEqual([201, 422]);
    const received = (await balanceOf(x.id)) + (await balanceOf(y.id));
    expect(received + (await balanceOf(from.id))).toBe(100000n); // nothing created or lost
  });
});

test('50 simultaneous ₹100 withdrawals from ₹1,000 → exactly 10 succeed, balance ends at ₹0', async () => {
  const holder = await createUser();
  const account = await fundedAccount(holder, 100000);

  const results = await Promise.all(Array.from({ length: 50 }, () => withdraw(holder, account.id, 10000)));

  expect(results.filter((r) => r.status === 201)).toHaveLength(10);
  expect(results.filter((r) => r.status === 422)).toHaveLength(40);
  expect(results.some((r) => r.status >= 500)).toBe(false);
  expect(await balanceOf(account.id)).toBe(0n);
  expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, reason: 'INSUFFICIENT_FUNDS' } })).toBe(40);
});

describe('Lock ordering prevents deadlocks', () => {
  test('30 A→B and 30 B→A transfers at the same time → all succeed, no deadlock', async () => {
    const holder = await createUser();
    const a = await fundedAccount(holder, 50000);
    const b = await fundedAccount(holder, 50000);

    const jobs = [];
    for (let i = 0; i < 30; i++) {
      jobs.push(transfer(holder, a.id, b.id, 100));
      jobs.push(transfer(holder, b.id, a.id, 100));
    }
    const results = await Promise.all(jobs);

    expect(new Set(results.map((r) => r.status))).toEqual(new Set([201]));
    expect(await balanceOf(a.id)).toBe(50000n);
    expect(await balanceOf(b.id)).toBe(50000n);
  });

  test('circular transfers A→B, B→C, C→A at the same time → all succeed', async () => {
    const holder = await createUser();
    const [a, b, c] = await Promise.all([fundedAccount(holder, 30000), fundedAccount(holder, 30000), fundedAccount(holder, 30000)]);

    const jobs = [];
    for (let i = 0; i < 20; i++) {
      jobs.push(transfer(holder, a.id, b.id, 500), transfer(holder, b.id, c.id, 500), transfer(holder, c.id, a.id, 500));
    }
    const results = await Promise.all(jobs);

    expect(new Set(results.map((r) => r.status))).toEqual(new Set([201]));
    for (const acc of [a, b, c]) expect(await balanceOf(acc.id)).toBe(30000n);
  });
});

test('mixed storm: 150 random deposits/withdrawals/transfers at once → books stay exact', async () => {
  const holder = await createUser();
  const accounts = await Promise.all([0, 1, 2, 3].map(() => fundedAccount(holder, 20000)));
  const startTotal = 80000n;

  // Deterministic pseudo-random sequence, so a failure can be reproduced.
  let seed = 42;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);

  const plan = Array.from({ length: 150 }, () => {
    const kind = ['deposit', 'withdraw', 'transfer'][rand(3)];
    const from = accounts[rand(4)];
    let to = accounts[rand(4)];
    if (to.id === from.id) to = accounts[(accounts.indexOf(from) + 1) % 4];
    return { kind, from, to, amount: 100 + rand(9900) };
  });

  const results = await Promise.all(
    plan.map((p) =>
      p.kind === 'deposit' ? deposit(holder, p.from.id, p.amount) : p.kind === 'withdraw' ? withdraw(holder, p.from.id, p.amount) : transfer(holder, p.from.id, p.to.id, p.amount)
    )
  );

  expect(results.some((r) => r.status >= 500)).toBe(false); // only 201 or business refusals
  let expectedTotal = startTotal;
  plan.forEach((p, i) => {
    if (results[i].status !== 201) return;
    if (p.kind === 'deposit') expectedTotal += BigInt(p.amount);
    if (p.kind === 'withdraw') expectedTotal -= BigInt(p.amount);
  });

  let actualTotal = 0n;
  for (const acc of accounts) {
    const balance = await balanceOf(acc.id);
    expect(balance >= 0n).toBe(true);
    actualTotal += balance;
  }
  expect(actualTotal).toBe(expectedTotal); // transfers conserve money; only deposits/withdrawals change the total
});

describe('Deadlock handling', () => {
  test('a real PostgreSQL deadlock is recognised as retryable', async () => {
    const holder = await createUser();
    const [x, y] = await Promise.all([createAccount(holder), createAccount(holder)]);
    const lockBoth = (first, second) =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${first}::uuid FOR UPDATE`;
          await sleep(300);
          await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${second}::uuid FOR UPDATE`;
        },
        { timeout: 15000, maxWait: 5000 }
      );

    // Deliberately WRONG order (this is what our sorted locking avoids).
    const results = await Promise.allSettled([lockBoth(x.id, y.id), lockBoth(y.id, x.id)]);
    const failed = results.filter((r) => r.status === 'rejected');

    expect(failed).toHaveLength(1); // PostgreSQL kills one side of the deadlock
    expect(isRetryable(failed[0].reason)).toBe(true);
  });

  test('a transfer caught in a deadlock is retried and completes exactly once', async () => {
    const holder = await createUser();
    const [p, q] = await Promise.all([fundedAccount(holder, 10000), fundedAccount(holder, 10000)]);
    const [low, high] = [p.id, q.id].sort(); // the transfer locks `low` first, then `high`
    const spy = jest.spyOn(prisma, '$transaction');

    // An outside transaction grabs `high` first, waits until the transfer is waiting for it,
    // then asks for `low` (held by the transfer) → deadlock.
    const outsider = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${high}::uuid FOR UPDATE`;
        await sleep(400);
        await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${low}::uuid FOR UPDATE`;
      },
      { timeout: 15000, maxWait: 5000 }
    );
    await sleep(100);
    const result = await transfer(holder, low, high, 2500);
    await outsider.catch(() => {}); // the outsider may be the deadlock victim instead – that's fine

    const transactionCalls = spy.mock.calls.length;
    spy.mockRestore();

    expect(result.status).toBe(201);
    expect(transactionCalls).toBeGreaterThanOrEqual(3); // outsider + first attempt + retry
    expect((await balanceOf(low)) + (await balanceOf(high))).toBe(20000n);
    expect(await prisma.transaction.count({ where: { fromAccountId: low, toAccountId: high } })).toBe(1);
  });

  test('withRetry: retries deadlocks up to 3 attempts, never retries other errors', async () => {
    const deadlock = () => new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2034', clientVersion: 'test' });

    let calls = 0;
    await expect(withRetry(async () => { calls++; if (calls < 3) throw deadlock(); return 'ok'; })).resolves.toBe('ok');
    expect(calls).toBe(3);

    calls = 0;
    await expect(withRetry(async () => { calls++; throw deadlock(); })).rejects.toThrow('deadlock');
    expect(calls).toBe(3);

    calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('insufficient funds'); })).rejects.toThrow('insufficient funds');
    expect(calls).toBe(1);
  });
});

describe('Rollback', () => {
  test('a failure in the middle of a transfer leaves NO trace: balances, transaction, ledger, idempotency key', async () => {
    const holder = await createUser();
    const from = await fundedAccount(holder, 50000);
    const to = await createAccount(holder);
    const before = {
      from: await balanceOf(from.id),
      to: await balanceOf(to.id),
      txns: await prisma.transaction.count(),
      entries: await prisma.ledgerEntry.count(),
    };

    // Make the CREDIT entry fail for this one account – AFTER both balances were
    // updated and the DEBIT entry was written inside the transaction.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_credit() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated crash while writing the credit entry'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_credit BEFORE INSERT ON ledger_entries
      FOR EACH ROW WHEN (NEW."accountId" = '${to.id}'::uuid) EXECUTE FUNCTION test_fail_credit()`);

    const key = require('crypto').randomUUID();
    let res;
    try {
      res = await transfer(holder, from.id, to.id, 12345, key);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_credit ON ledger_entries');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_fail_credit()');
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await balanceOf(from.id)).toBe(before.from);
    expect(await balanceOf(to.id)).toBe(before.to);
    expect(await prisma.transaction.count()).toBe(before.txns);
    expect(await prisma.ledgerEntry.count()).toBe(before.entries);
    expect(await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId: holder.user.id, key } } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, action: 'TXN_TRANSFER', outcome: 'ERROR' } })).toBe(1);

    // Because nothing was stored, retrying the SAME key now works – and moves the money once.
    const retry = await transfer(holder, from.id, to.id, 12345, key);
    expect(retry.status).toBe(201);
    expect(await balanceOf(to.id)).toBe(12345n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Day 3, Task 3 – more concurrent scenarios, each verified against PostgreSQL
// (balances, ledger entries, and the independent SQL oracle in tests/invariants.js).
// ─────────────────────────────────────────────────────────────────────────────
describe('Day 3 – concurrency verified in PostgreSQL', () => {
  const ledgerEntries = (accountId, direction) => prisma.ledgerEntry.count({ where: { accountId, ...(direction && { direction }) } });
  const ok = (results) => results.filter((r) => r.status === 201);

  test('proof the requests REALLY overlap: PostgreSQL sees all 12 waiting for the same lock at once', async () => {
    const holder = await createUser();
    const account = await fundedAccount(holder, 100000); // ₹1,000
    const N = 12;

    // Hold the account's row lock from outside, so every request has to queue behind it.
    let release;
    const released = new Promise((resolve) => (release = resolve));
    const outsider = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
        await released;
      },
      { timeout: 30000, maxWait: 5000 }
    );
    await sleep(100);

    const requests = Promise.all(Array.from({ length: N }, () => withdraw(holder, account.id, 10000)));

    // Ask PostgreSQL how many sessions are blocked waiting for a lock right now.
    let waiting = 0;
    for (let i = 0; i < 200 && waiting < N; i++) {
      const [row] = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      waiting = row.n;
      if (waiting < N) await sleep(25);
    }
    release();
    await outsider;
    const results = await requests;

    expect(waiting).toBe(N); // all 12 were in flight at the same moment – not one after another
    expect(ok(results)).toHaveLength(10); // ₹1,000 / ₹100
    expect(results.filter((r) => r.status === 422)).toHaveLength(2);
    expect(await balanceOf(account.id)).toBe(0n);
    await expectHealthyLedger();
  });

  test('40 deposits into ONE account at the same moment → every rupee arrives, nothing is lost', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const systemId = (await prisma.account.findFirst({ where: { type: 'SYSTEM' } })).id;
    const systemBefore = await balanceOf(systemId);
    const amounts = Array.from({ length: 40 }, (_, i) => 137 * (i + 1)); // all different
    const total = BigInt(amounts.reduce((sum, a) => sum + a, 0));

    const results = await Promise.all(amounts.map((amount) => deposit(holder, account.id, amount)));

    expect(ok(results)).toHaveLength(40);
    expect(await balanceOf(account.id)).toBe(total); // a lost update would leave less
    expect(await ledgerEntries(account.id, 'CREDIT')).toBe(40);
    expect(await balanceOf(systemId)).toBe(systemBefore - total); // the other side of every deposit
    await expectHealthyLedger();
  });

  test('30 deposits and 30 withdrawals on one account at the same moment → no lost updates', async () => {
    const holder = await createUser();
    const account = await fundedAccount(holder, 50000); // ₹500: enough even if all withdrawals run first

    const jobs = [];
    for (let i = 0; i < 30; i++) jobs.push(deposit(holder, account.id, 1000), withdraw(holder, account.id, 1000));
    const results = await Promise.all(jobs);

    expect(ok(results)).toHaveLength(60);
    expect(await balanceOf(account.id)).toBe(50000n);
    expect(await ledgerEntries(account.id)).toBe(61); // 1 initial deposit + 60
    await expectHealthyLedger();
  });

  test('20 transfers of ₹100 from a ₹1,000 account to 4 receivers at once → exactly 10 succeed', async () => {
    const holder = await createUser();
    const from = await fundedAccount(holder, 100000);
    const receivers = await Promise.all([0, 1, 2, 3].map(() => createAccount(holder)));

    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => transfer(holder, from.id, receivers[i % 4].id, 10000)));

    expect(ok(results)).toHaveLength(10);
    expect(results.filter((r) => r.status === 422).every((r) => r.body.error.code === 'INSUFFICIENT_FUNDS')).toBe(true);
    expect(await balanceOf(from.id)).toBe(0n);
    let received = 0n;
    for (const r of receivers) {
      const balance = await balanceOf(r.id);
      expect(BigInt(await ledgerEntries(r.id, 'CREDIT')) * 10000n).toBe(balance); // one credit row per ₹100 received
      received += balance;
    }
    expect(received).toBe(100000n); // everything that left arrived – nothing more
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, reason: 'INSUFFICIENT_FUNDS' } })).toBe(10);
    await expectHealthyLedger();
  });

  test('30 transfers A→B in the same direction at once → exact balances on both sides', async () => {
    const holder = await createUser();
    const a = await fundedAccount(holder, 100000);
    const b = await createAccount(holder);

    const results = await Promise.all(Array.from({ length: 30 }, () => transfer(holder, a.id, b.id, 1000)));

    expect(ok(results)).toHaveLength(30);
    expect(await balanceOf(a.id)).toBe(70000n);
    expect(await balanceOf(b.id)).toBe(30000n);
    expect(await ledgerEntries(a.id, 'DEBIT')).toBe(30);
    expect(await ledgerEntries(b.id, 'CREDIT')).toBe(30);
    await expectHealthyLedger();
  });

  test('rollback under load: 10 transfers crash mid-way while 10 others succeed → only the good ones remain', async () => {
    const holder = await createUser();
    const from = await fundedAccount(holder, 100000);
    const broken = await createAccount(holder); // writing a credit to this account will fail
    const healthy = await createAccount(holder);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_credit_load() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated crash under load'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_credit_load BEFORE INSERT ON ledger_entries
      FOR EACH ROW WHEN (NEW."accountId" = '${broken.id}'::uuid) EXECUTE FUNCTION test_fail_credit_load()`);
    let results;
    try {
      const jobs = [];
      for (let i = 0; i < 10; i++) jobs.push(transfer(holder, from.id, broken.id, 1000), transfer(holder, from.id, healthy.id, 1000));
      results = await Promise.all(jobs);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_credit_load ON ledger_entries');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_fail_credit_load()');
    }

    const toBroken = results.filter((_, i) => i % 2 === 0);
    const toHealthy = results.filter((_, i) => i % 2 === 1);
    expect(toBroken.every((r) => r.status === 500)).toBe(true);
    expect(toHealthy.every((r) => r.status === 201)).toBe(true);
    expect(await balanceOf(from.id)).toBe(90000n); // only the 10 successful ₹10 transfers left
    expect(await balanceOf(healthy.id)).toBe(10000n);
    expect(await balanceOf(broken.id)).toBe(0n);
    expect(await ledgerEntries(broken.id)).toBe(0);
    expect(await prisma.transaction.count({ where: { toAccountId: broken.id } })).toBe(0);
    await expectHealthyLedger();
  });
});

test('the ledger balances after every concurrency test (app check + independent SQL check)', async () => {
  const result = await verifyLedger();
  expect(result.checks).toEqual({ balancesMatchLedger: true, everyTransactionBalanced: true, runningBalancesConsistent: true, moneyConserved: true });
  await expectHealthyLedger();
});
