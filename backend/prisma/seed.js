// Seeds data the system needs to work. Safe to run many times (uses upsert).
// Run with: npm run db:seed
require('dotenv').config({ quiet: true });
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// The SYSTEM account represents money outside LedgerLine.
// Deposit:    SYSTEM (debit)  → customer (credit)
// Withdrawal: customer (debit) → SYSTEM (credit)
// So every transaction has a matching debit and credit, and
// SUM(all account balances) is always 0 – the books always balance.
const { SYSTEM_ACCOUNT_NUMBER } = require('../src/config/policy');

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

async function seedSystemAccount() {
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

// ADMIN and AUDITOR can't be created through public registration,
// so they are created here from credentials in .env.
async function seedPrivilegedUser(role, email, password, fullName) {
  if (!email || !password) {
    console.log(`Skipping ${role}: set SEED_${role}_EMAIL and SEED_${role}_PASSWORD in .env`);
    return;
  }
  if (!PASSWORD_RULE.test(password)) {
    throw new Error(`SEED_${role}_PASSWORD must be 8–72 chars with upper, lower and a digit`);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    // Never silently change the role or password of an existing user.
    if (existing.role !== role) {
      throw new Error(`${normalizedEmail} already exists with role ${existing.role}, expected ${role}`);
    }
    console.log(`${role} already exists: ${normalizedEmail}`);
    return;
  }

  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(password, rounds);
  await prisma.user.create({ data: { email: normalizedEmail, passwordHash, fullName, role } });
  console.log(`${role} created: ${normalizedEmail}`);
}

async function main() {
  await seedSystemAccount();
  await seedPrivilegedUser('ADMIN', process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, 'LedgerLine Admin');
  await seedPrivilegedUser('AUDITOR', process.env.SEED_AUDITOR_EMAIL, process.env.SEED_AUDITOR_PASSWORD, 'LedgerLine Auditor');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
