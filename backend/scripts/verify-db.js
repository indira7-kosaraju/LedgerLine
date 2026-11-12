// Checks the ACTUAL state of the database (the one in DATABASE_URL – your real .env by default).
// Read-only: it never changes data.   Run with: npm run verify:db
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const one = async (query) => (await query)[0];

const REQUIRED_TRIGGERS = [
  'ledger_entries_append_only', 'ledger_entries_no_truncate', 'ledger_entries_check_chain',
  'audit_logs_append_only', 'audit_logs_no_truncate',
  'transactions_append_only', 'transactions_no_truncate', 'transactions_must_balance',
  'accounts_balance_matches_ledger',
];
const REQUIRED_CONSTRAINTS = [
  'accounts_customer_balance_non_negative', 'accounts_owner_matches_type', 'transactions_amount_positive',
  'ledger_entries_amount_positive', 'transactions_different_accounts',
];

async function main() {
  const db = await one(prisma.$queryRaw`SELECT current_database() AS name`);
  console.log(`Verifying database "${db.name}" (read-only)\n`);

  // 1. Money
  const totals = await one(prisma.$queryRaw`
    SELECT COALESCE(SUM(balance), 0)::text AS sum,
           COUNT(*) FILTER (WHERE type = 'CUSTOMER' AND balance < 0)::int AS negative
    FROM accounts`);
  check('All balances sum to ₹0 (money is conserved)', totals.sum === '0', `sum = ${totals.sum} paise`);
  check('No customer account has a negative balance', totals.negative === 0, `${totals.negative} negative`);

  // 2. Ledger ↔ balances
  const mismatched = await prisma.$queryRaw`
    SELECT a."accountNumber" FROM accounts a LEFT JOIN ledger_entries e ON e."accountId" = a.id
    GROUP BY a.id
    HAVING a.balance <> COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)`;
  check('Every balance equals credits − debits in the ledger', mismatched.length === 0, mismatched.map((m) => m.accountNumber).join(', '));

  const unbalanced = await prisma.$queryRaw`
    SELECT t.reference FROM transactions t
    LEFT JOIN ledger_entries d ON d."transactionId" = t.id AND d.direction = 'DEBIT'
    LEFT JOIN ledger_entries c ON c."transactionId" = t.id AND c.direction = 'CREDIT'
    WHERE d.id IS NULL OR c.id IS NULL OR d.amount <> t.amount OR c.amount <> t.amount
       OR d."accountId" <> t."fromAccountId" OR c."accountId" <> t."toAccountId"`;
  check('Every transaction has one matching DEBIT and one matching CREDIT', unbalanced.length === 0, unbalanced.map((u) => u.reference).join(', '));

  const chain = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS broken FROM (
      SELECT "balanceAfter", SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
             OVER (PARTITION BY "accountId" ORDER BY "entryNumber") AS running
      FROM ledger_entries) x
    WHERE "balanceAfter" <> running`;
  check('Every ledger entry continues its running balance', chain[0].broken === 0, `${chain[0].broken} broken`);

  const counts = await one(prisma.$queryRaw`
    SELECT (SELECT COUNT(*) FROM transactions)::int AS txns, (SELECT COUNT(*) FROM ledger_entries)::int AS entries`);
  check('Ledger entries = 2 × transactions', counts.entries === counts.txns * 2, `${counts.txns} transactions, ${counts.entries} entries`);

  // 3. Idempotency
  const keys = await one(prisma.$queryRaw`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS stuck,
           (SELECT COUNT(*)::int FROM (SELECT "userId", key FROM idempotency_keys GROUP BY 1, 2 HAVING COUNT(*) > 1) d) AS duplicates,
           (SELECT COUNT(*)::int FROM (SELECT "transactionId" FROM idempotency_keys WHERE "transactionId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) d) AS shared
    FROM idempotency_keys`);
  check('No duplicate idempotency keys per user', keys.duplicates === 0, `${keys.total} keys stored`);
  check('No idempotency key left IN_PROGRESS', keys.stuck === 0, `${keys.stuck} stuck`);
  check('No transaction linked to two keys', keys.shared === 0);

  // 4. Protections installed
  const triggers = (await prisma.$queryRaw`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`).map((t) => t.tgname);
  const missingTriggers = REQUIRED_TRIGGERS.filter((t) => !triggers.includes(t));
  check(`All ${REQUIRED_TRIGGERS.length} ledger-protection triggers installed`, missingTriggers.length === 0, missingTriggers.join(', '));
  const constraints = (await prisma.$queryRaw`SELECT conname FROM pg_constraint WHERE contype = 'c'`).map((c) => c.conname);
  const missingChecks = REQUIRED_CONSTRAINTS.filter((c) => !constraints.includes(c));
  check(`All ${REQUIRED_CONSTRAINTS.length} CHECK constraints installed`, missingChecks.length === 0, missingChecks.join(', '));

  // 5. Accounts and users
  const system = await one(prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM accounts WHERE type = 'SYSTEM'`);
  check('Exactly one SYSTEM account', system.n === 1, `${system.n} found`);
  const plaintext = await one(prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM users WHERE "passwordHash" NOT LIKE '$2b$%'`);
  check('Every password is stored as a bcrypt hash', plaintext.n === 0, `${plaintext.n} not bcrypt`);

  // The app's role must not be able to change the schema or switch the triggers above off (scripts/setup-db-roles.js).
  const role = await one(prisma.$queryRaw`
    SELECT current_user AS name, r.rolsuper OR r.rolcreaterole OR r.rolbypassrls AS special,
           has_schema_privilege('public', 'CREATE') AS "canCreate",
           (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owned
    FROM pg_roles r WHERE r.rolname = current_user`);
  check('Connected as a limited role (owns no tables, cannot create in the schema)', !role.special && !role.canCreate && role.owned === 0,
    `${role.name}: owns ${role.owned} tables${role.canCreate ? ', can create' : ''}${role.special ? ', has special attributes' : ''}`);

  // Report
  const refused = await one(prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM audit_logs WHERE outcome = 'REFUSED'`);
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  console.log(`\nℹ️  ${refused.n} refused attempts recorded in the audit log`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n❌ ${failed} check(s) FAILED` : `\n✅ Database state verified: ${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error('Verification crashed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
