// Seeds data the system needs to work. Safe to run many times (uses upsert).
// Run with: npm run db:seed
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// The SYSTEM account represents money outside LedgerLine.
// Deposit:    SYSTEM (debit)  → customer (credit)
// Withdrawal: customer (debit) → SYSTEM (credit)
// So every transaction has a matching debit and credit, and
// SUM(all account balances) is always 0 – the books always balance.
const SYSTEM_ACCOUNT_NUMBER = 'LL-SYSTEM-EXTERNAL';

async function main() {
  const systemAccount = await prisma.account.upsert({
    where: { accountNumber: SYSTEM_ACCOUNT_NUMBER },
    update: {},
    create: {
      accountNumber: SYSTEM_ACCOUNT_NUMBER,
      type: 'SYSTEM',
      status: 'ACTIVE',
      currency: 'INR',
      balance: 0n,
    },
  });

  console.log(`SYSTEM account ready: ${systemAccount.accountNumber} (${systemAccount.id})`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
