// Shared helpers for integration tests (Supertest against the real Express app + test DB).
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const request = require('supertest');

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { signAccessToken } = require('../src/utils/jwt');
const { PrismaClient } = require('@prisma/client');
const { TERMS_VERSION } = require('../src/config/onboarding');

// The app (and `prisma` above) connects as the limited API role, which cannot create triggers or
// touch history. Tests that inject faults or attack the tables directly use the table OWNER.
let ownerClient;
const ownerDb = () => (ownerClient ??= new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } }));
const disconnectAll = () => Promise.all([prisma.$disconnect(), ownerClient?.$disconnect()]);

const PASSWORD_HASH = bcrypt.hashSync('Secret123', 10);
const newKey = () => crypto.randomUUID();

// A valid onboarding submission (step 4) – demo data, also used by onboarding.test.js.
const TEST_PROFILE = Object.freeze({
  dateOfBirth: '1990-05-20', phone: '9876543210', city: 'Bengaluru', state: 'Karnataka', pinCode: '560001', occupation: 'SALARIED',
  acceptTerms: true, termsVersion: TERMS_VERSION,
});

// Creates a user directly in the DB (avoids the registration rate limit) and returns
// a ready-to-use Bearer token. Account holders are onboarded (approved) unless { onboarded: false }.
async function createUser(role = 'ACCOUNT_HOLDER', { onboarded = true } = {}) {
  const data = { email: `${role.toLowerCase()}-${crypto.randomUUID()}@test.local`, passwordHash: PASSWORD_HASH, fullName: `Test ${role}`, role };
  let user;
  if (role !== 'ACCOUNT_HOLDER') {
    user = await prisma.user.create({ data: { ...data, onboardingStatus: 'APPROVED', onboardedAt: new Date() } });
  } else if (!onboarded) {
    user = await prisma.user.create({ data });
  } else {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data });
      await tx.customerProfile.create({
        data: { userId: created.id, dateOfBirth: new Date('1990-05-20T00:00:00Z'), phone: '+919876543210', city: 'Bengaluru', state: 'Karnataka', pinCode: '560001', occupation: 'SALARIED' },
      });
      const now = new Date();
      return tx.user.update({ where: { id: created.id }, data: { onboardingStatus: 'APPROVED', onboardedAt: now, termsVersion: TERMS_VERSION, termsAcceptedAt: now } });
    });
  }
  return { user, token: signAccessToken(user), auth: { Authorization: `Bearer ${signAccessToken(user)}` } };
}

// Opens an account through the API (the real code path).
async function createAccount(holder) {
  const res = await request(app).post('/api/accounts').set(holder.auth).send({}).expect(201);
  return res.body.account;
}

// Money calls through the API. `key` defaults to a fresh Idempotency-Key.
const deposit = (holder, accountId, amountPaise, key = newKey()) =>
  request(app).post('/api/transactions/deposit').set(holder.auth).set('Idempotency-Key', key).send({ accountId, amountPaise });

const withdraw = (holder, accountId, amountPaise, key = newKey()) =>
  request(app).post('/api/transactions/withdraw').set(holder.auth).set('Idempotency-Key', key).send({ accountId, amountPaise });

const transfer = (holder, fromAccountId, toAccountId, amountPaise, key = newKey()) =>
  request(app).post('/api/transactions/transfer').set(holder.auth).set('Idempotency-Key', key).send({ fromAccountId, toAccountId, amountPaise });

async function balanceOf(accountId) {
  const { balance } = await prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { balance: true } });
  return balance; // BigInt paise
}

const countTransactions = (accountId) =>
  prisma.transaction.count({ where: { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] } });

// The ledger-wide proof (same checks as GET /api/ledger/verify).
async function verifyLedger() {
  const auditor = await createUser('AUDITOR');
  const res = await request(app).get('/api/ledger/verify').set(auditor.auth);
  return res.body;
}

module.exports = { app, prisma, ownerDb, disconnectAll, request, newKey, createUser, TEST_PROFILE, createAccount, deposit, withdraw, transfer, balanceOf, countTransactions, verifyLedger };
