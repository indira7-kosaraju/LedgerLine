// Independent checks of the books, written directly in SQL.
//
// These deliberately do NOT use the application's own verification code
// (services/ledger.service.js → GET /api/ledger/verify). A test that asks the app
// "are you correct?" proves little if the app's checker has a bug; this file is a
// second, separate opinion.
const prisma = require('../src/config/prisma');

async function ledgerInvariants() {
  const [money] = await prisma.$queryRaw`
    SELECT COALESCE(SUM(balance), 0)::text AS "totalOfAllBalances",
           COUNT(*) FILTER (WHERE type = 'CUSTOMER' AND balance < 0)::int AS "negativeCustomerBalances"
    FROM accounts`;

  // A transaction is balanced when it has exactly one DEBIT on its from-account and
  // one CREDIT on its to-account, both for the transaction amount – and nothing else.
  const [unbalanced] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM transactions t
    WHERE (SELECT COUNT(*) FROM ledger_entries e WHERE e."transactionId" = t.id) <> 2
       OR NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e."transactionId" = t.id AND e.direction = 'DEBIT'
                      AND e."accountId" = t."fromAccountId" AND e.amount = t.amount)
       OR NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e."transactionId" = t.id AND e.direction = 'CREDIT'
                      AND e."accountId" = t."toAccountId" AND e.amount = t.amount)`;

  const [mismatched] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM accounts a
    WHERE a.balance <> COALESCE((SELECT SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END)
                                 FROM ledger_entries e WHERE e."accountId" = a.id), 0)`;

  const [broken] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM (
      SELECT "balanceAfter",
             SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
               OVER (PARTITION BY "accountId" ORDER BY "entryNumber") AS running
      FROM ledger_entries) x
    WHERE "balanceAfter" <> running`;

  return {
    totalOfAllBalances: money.totalOfAllBalances,
    negativeCustomerBalances: money.negativeCustomerBalances,
    unbalancedTransactions: unbalanced.n,
    balancesNotMatchingLedger: mismatched.n,
    brokenRunningBalances: broken.n,
  };
}

const HEALTHY = {
  totalOfAllBalances: '0',
  negativeCustomerBalances: 0,
  unbalancedTransactions: 0,
  balancesNotMatchingLedger: 0,
  brokenRunningBalances: 0,
};

// expect(await ledgerInvariants()).toEqual(HEALTHY) – one line in any test.
async function expectHealthyLedger() {
  expect(await ledgerInvariants()).toEqual(HEALTHY);
}

// Everything that a money operation could change, to prove a refused one changed nothing.
async function snapshot(accountIds) {
  const [counts] = await prisma.$queryRaw`
    SELECT (SELECT COUNT(*) FROM transactions)::int AS transactions,
           (SELECT COUNT(*) FROM ledger_entries)::int AS "ledgerEntries"`;
  const rows = await prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, balance: true } });
  return { ...counts, balances: Object.fromEntries(rows.map((r) => [r.id, r.balance.toString()])) };
}

module.exports = { ledgerInvariants, expectHealthyLedger, snapshot, HEALTHY };
