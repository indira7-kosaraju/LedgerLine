const prisma = require('../config/prisma');
const { toMoney } = require('../utils/money');

function serializeEntry(e) {
  const t = e.transaction;
  const counterparty = t && (e.direction === 'DEBIT' ? t.toAccount : t.fromAccount);
  return {
    id: e.id,
    entryNumber: e.entryNumber.toString(),
    accountId: e.accountId,
    direction: e.direction,
    amount: toMoney(e.amount),
    balanceAfter: toMoney(e.balanceAfter),
    createdAt: e.createdAt,
    ...(t && {
      transaction: { id: t.id, reference: t.reference, type: t.type, description: t.description },
      counterpartyAccountNumber: counterparty?.accountNumber ?? null,
    }),
  };
}

const entryInclude = {
  transaction: {
    select: {
      id: true, reference: true, type: true, description: true,
      fromAccount: { select: { accountNumber: true } },
      toAccount: { select: { accountNumber: true } },
    },
  },
};

// Statement for one account. `account` was already access-checked (VIEW).
// Includes a proof that the stored balance equals credits − debits.
async function getStatement(account, { page, limit, from, to }) {
  const where = { accountId: account.id };
  if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) };

  const [entries, total, sums, current] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { entryNumber: 'desc' }, // newest first, strictly ordered
      skip: (page - 1) * limit,
      take: limit,
      include: entryInclude,
    }),
    prisma.ledgerEntry.count({ where }),
    // Totals over the account's WHOLE history (not just this page / date range).
    prisma.ledgerEntry.groupBy({ by: ['direction'], where: { accountId: account.id }, _sum: { amount: true } }),
    prisma.account.findUniqueOrThrow({ where: { id: account.id }, select: { balance: true } }),
  ]);

  const totalCredits = sums.find((s) => s.direction === 'CREDIT')?._sum.amount ?? 0n;
  const totalDebits = sums.find((s) => s.direction === 'DEBIT')?._sum.amount ?? 0n;
  const computed = totalCredits - totalDebits;

  return {
    account: { id: account.id, accountNumber: account.accountNumber, type: account.type, status: account.status },
    summary: {
      currentBalance: toMoney(current.balance),
      totalCredits: toMoney(totalCredits),
      totalDebits: toMoney(totalDebits),
      ledgerBalance: toMoney(computed),
      balanceMatchesLedger: computed === current.balance,
    },
    entries: entries.map(serializeEntry),
    page,
    limit,
    total,
  };
}

// ADMIN / AUDITOR: raw ledger entries.
async function listEntries({ page, limit, accountId, transactionId }) {
  const where = {};
  if (accountId) where.accountId = accountId;
  if (transactionId) where.transactionId = transactionId;

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({ where, orderBy: { entryNumber: 'desc' }, skip: (page - 1) * limit, take: limit, include: entryInclude }),
    prisma.ledgerEntry.count({ where }),
  ]);
  return { items: entries.map(serializeEntry), page, limit, total };
}

// "A ledger you can prove": recompute everything from the ledger and compare.
// Runs all queries in one REPEATABLE READ snapshot so they see the same data,
// even while new transactions are being committed.
async function verifyLedger() {
  const [balanceMismatches, unbalancedTransactions, brokenChains, totals] = await prisma.$transaction(
    [
      // 1. Every account's stored balance must equal SUM(credits) − SUM(debits).
      prisma.$queryRaw`
        SELECT a.id, a."accountNumber", a.balance,
               COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)::bigint AS computed
        FROM accounts a
        LEFT JOIN ledger_entries e ON e."accountId" = a.id
        GROUP BY a.id
        HAVING a.balance <> COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)`,

      // 2. Every completed transaction must have exactly one DEBIT (from) and one CREDIT (to) of its amount.
      prisma.$queryRaw`
        SELECT t.id, t.reference
        FROM transactions t
        LEFT JOIN ledger_entries d ON d."transactionId" = t.id AND d.direction = 'DEBIT'
        LEFT JOIN ledger_entries c ON c."transactionId" = t.id AND c.direction = 'CREDIT'
        WHERE t.status = 'COMPLETED'
          AND (d.id IS NULL OR c.id IS NULL
               OR d.amount <> t.amount OR c.amount <> t.amount
               OR d."accountId" <> t."fromAccountId" OR c."accountId" <> t."toAccountId")`,

      // 3. Each entry's balanceAfter must equal the running total of that account's entries.
      prisma.$queryRaw`
        SELECT id, "accountId", "entryNumber", "balanceAfter", running
        FROM (
          SELECT e.*, SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
                        OVER (PARTITION BY "accountId" ORDER BY "entryNumber")::bigint AS running
          FROM ledger_entries e
        ) x
        WHERE "balanceAfter" <> running`,

      // 4. Conservation of money: all balances (including SYSTEM) sum to zero.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(balance), 0)::bigint AS "sumOfBalances",
               (SELECT COUNT(*) FROM accounts)::int AS accounts,
               (SELECT COUNT(*) FROM transactions)::int AS transactions,
               (SELECT COUNT(*) FROM ledger_entries)::int AS "ledgerEntries"
        FROM accounts`,
    ],
    { isolationLevel: 'RepeatableRead' }
  );

  const t = totals[0];
  const checks = {
    balancesMatchLedger: balanceMismatches.length === 0,
    everyTransactionBalanced: unbalancedTransactions.length === 0,
    runningBalancesConsistent: brokenChains.length === 0,
    moneyConserved: t.sumOfBalances === 0n,
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checkedAt: new Date().toISOString(),
    counts: { accounts: t.accounts, transactions: t.transactions, ledgerEntries: t.ledgerEntries },
    sumOfAllBalances: toMoney(t.sumOfBalances),
    checks,
    problems: {
      balanceMismatches: balanceMismatches.map((r) => ({ ...r, balance: r.balance.toString(), computed: r.computed.toString() })),
      unbalancedTransactions,
      brokenChains: brokenChains.map((r) => ({
        id: r.id, accountId: r.accountId, entryNumber: r.entryNumber.toString(),
        balanceAfter: r.balanceAfter.toString(), running: r.running.toString(),
      })),
    },
  };
}

module.exports = { getStatement, listEntries, verifyLedger };
