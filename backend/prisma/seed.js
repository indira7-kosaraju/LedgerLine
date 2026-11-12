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
    const hint = role === 'ADMIN' ? ' – create the first admin with: npm run admin:bootstrap' : '';
    console.log(`Skipping ${role}: SEED_${role}_EMAIL/PASSWORD not set${hint}`);
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
  // Staff need no customer onboarding (step 4) – they are approved from the start.
  const user = await prisma.user.create({ data: { email: normalizedEmail, passwordHash, fullName, role, onboardingStatus: 'APPROVED', onboardedAt: new Date() } });
  // A privileged user never appears without a trace in the audit log.
  await prisma.auditLog.create({
    data: { action: 'USER_SEED', outcome: 'SUCCESS', entityType: 'User', entityId: user.id, metadata: { email: normalizedEmail, role }, userAgent: 'prisma/seed.js' },
  });
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
