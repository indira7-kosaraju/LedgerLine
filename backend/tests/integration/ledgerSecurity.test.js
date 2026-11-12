// Ledger security, layer 2: even with direct SQL access as the table OWNER, history cannot be
// changed and the books cannot be made to not balance (the triggers stop it).
// Layer 1 – the API role is not even allowed to try – is tested in dbRoles.test.js.
const { prisma, ownerDb, disconnectAll, createUser, createAccount, deposit, balanceOf, verifyLedger } = require('../helpers');

afterAll(disconnectAll);

// Runs SQL as the OWNER in its own transaction, so deferred (commit-time) checks are included.
const sql = (statements) =>
  ownerDb().$transaction(async (tx) => {
    for (const s of [].concat(statements)) await tx.$executeRawUnsafe(s);
  });

let holder, a, b, entry, txn;
beforeAll(async () => {
  holder = await createUser();
  a = await createAccount(holder);
  b = await createAccount(holder);
  await deposit(holder, a.id, 50000);
  await deposit(holder, b.id, 50000);
  entry = await prisma.ledgerEntry.findFirst({ where: { accountId: a.id } });
  txn = await prisma.transaction.findFirst({ where: { toAccountId: a.id } });
});

describe('History is append-only', () => {
  test.each([
    ['UPDATE a ledger entry', () => `UPDATE ledger_entries SET amount = 1 WHERE id = '${entry.id}'`, /append-only: UPDATE/],
    ['DELETE a ledger entry', () => `DELETE FROM ledger_entries WHERE id = '${entry.id}'`, /append-only: DELETE/],
    ['TRUNCATE the ledger', () => 'TRUNCATE ledger_entries', /append-only: TRUNCATE/],
    ['UPDATE a transaction amount', () => `UPDATE transactions SET amount = 1 WHERE id = '${txn.id}'`, /append-only: UPDATE/],
    ['DELETE a transaction', () => `DELETE FROM transactions WHERE id = '${txn.id}'`, /append-only|foreign key/],
    ['UPDATE an audit record', () => `UPDATE audit_logs SET outcome = 'SUCCESS' WHERE "actorId" = '${holder.user.id}'`, /append-only: UPDATE/],
    ['TRUNCATE the audit log', () => 'TRUNCATE audit_logs', /append-only: TRUNCATE/],
  ])('%s → refused', async (_, statement, message) => {
    await expect(sql(statement())).rejects.toThrow(message);
  });
});

describe('The books must balance (checked by PostgreSQL itself)', () => {
  test('money from nowhere: raising a balance without a ledger entry → refused at commit', async () => {
    await expect(sql(`UPDATE accounts SET balance = balance + 100000 WHERE id = '${a.id}'`)).rejects.toThrow(/the ledger says/);
    expect(await balanceOf(a.id)).toBe(50000n);
  });

  test('negative customer balance → refused', async () => {
    await expect(sql(`UPDATE accounts SET balance = -1 WHERE id = '${a.id}'`)).rejects.toThrow(/non_negative/);
  });

  test('a transaction with no ledger entries → refused at commit', async () => {
    await expect(
      sql(`INSERT INTO transactions (id, reference, type, status, amount, "fromAccountId", "toAccountId", "initiatedById", "updatedAt")
           VALUES (gen_random_uuid(), 'TXN-FAKE-${Date.now()}', 'TRANSFER', 'COMPLETED', 100, '${a.id}', '${b.id}', '${holder.user.id}', now())`)
    ).rejects.toThrow(/not balanced/);
  });

  test('unbalanced entries (debit ₹1.00, credit ₹0.90) → refused at commit', async () => {
    const ref = `TXN-UNBAL-${Date.now()}`;
    await expect(
      sql([
        `INSERT INTO transactions (id, reference, type, status, amount, "fromAccountId", "toAccountId", "initiatedById", "updatedAt")
         VALUES ('00000000-0000-4000-8000-${Date.now().toString().slice(-12)}', '${ref}', 'TRANSFER', 'COMPLETED', 100, '${a.id}', '${b.id}', '${holder.user.id}', now())`,
        `UPDATE accounts SET balance = balance - 100 WHERE id = '${a.id}'`,
        `UPDATE accounts SET balance = balance + 90 WHERE id = '${b.id}'`,
        `INSERT INTO ledger_entries (id, "transactionId", "accountId", direction, amount, "balanceAfter")
         SELECT gen_random_uuid(), t.id, '${a.id}', 'DEBIT', 100, 49900 FROM transactions t WHERE t.reference = '${ref}'`,
        `INSERT INTO ledger_entries (id, "transactionId", "accountId", direction, amount, "balanceAfter")
         SELECT gen_random_uuid(), t.id, '${b.id}', 'CREDIT', 90, 50090 FROM transactions t WHERE t.reference = '${ref}'`,
      ])
    ).rejects.toThrow(/not balanced/);
    expect(await balanceOf(a.id)).toBe(50000n);
    expect(await balanceOf(b.id)).toBe(50000n);
  });

  test('a ledger entry whose balanceAfter does not continue the running total → refused immediately', async () => {
    const ref = `TXN-CHAIN-${Date.now()}`;
    // a's balance is 50000, so a ₹1.00 credit must say 50100 – it says 99999.
    await expect(
      sql([
        `INSERT INTO transactions (id, reference, type, status, amount, "fromAccountId", "toAccountId", "initiatedById", "updatedAt")
         VALUES (gen_random_uuid(), '${ref}', 'TRANSFER', 'COMPLETED', 100, '${b.id}', '${a.id}', '${holder.user.id}', now())`,
        `INSERT INTO ledger_entries (id, "transactionId", "accountId", direction, amount, "balanceAfter")
         SELECT gen_random_uuid(), t.id, '${a.id}', 'CREDIT', 100, 99999 FROM transactions t WHERE t.reference = '${ref}'`,
      ])
    ).rejects.toThrow(/Ledger chain broken .* balanceAfter is 99999 but must be 50100/);
  });
});

test('after every tampering attempt, nothing changed and the ledger still verifies', async () => {
  expect(await balanceOf(a.id)).toBe(50000n);
  expect(await balanceOf(b.id)).toBe(50000n);
  expect(await prisma.ledgerEntry.count({ where: { accountId: a.id } })).toBe(1);
  const result = await verifyLedger();
  expect(result.ok).toBe(true);
});
