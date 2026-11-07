const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');
const { hasPermission } = require('../config/permissions');
const AppError = require('../utils/AppError');
const { toMoney } = require('../utils/money');
const escapeLike = require('../utils/escapeLike');
const { generateAccountNumber } = require('../utils/accountNumber');
const audit = require('./audit.service');

const MAX_ACCOUNTS_PER_USER = 5;
const ACCOUNT_NUMBER_ATTEMPTS = 5;

// Convert a database row into the shape we send to clients (BigInt → string).
function serializeAccount(account) {
  return {
    id: account.id,
    accountNumber: account.accountNumber,
    type: account.type,
    status: account.status,
    currency: account.currency,
    balance: toMoney(account.balance, account.currency),
    ownerId: account.ownerId,
    ...(account.owner && { owner: account.owner }),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

async function createAccount(user, { currency }, ctx) {
  // Retry if a random account number happens to already exist.
  for (let attempt = 1; attempt <= ACCOUNT_NUMBER_ATTEMPTS; attempt++) {
    try {
      const account = await prisma.$transaction(async (tx) => {
        // Lock this user's row so simultaneous "open account" requests from the same user
        // count one after another. Without it, two requests could both see 4 accounts
        // and both create one (found by a concurrency test in Day 2 Task 8).
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;

        const count = await tx.account.count({ where: { ownerId: user.id } });
        if (count >= MAX_ACCOUNTS_PER_USER) {
          throw new AppError(409, `You can have at most ${MAX_ACCOUNTS_PER_USER} accounts`, 'ACCOUNT_LIMIT_REACHED');
        }

        return tx.account.create({
          data: {
            accountNumber: generateAccountNumber(),
            type: 'CUSTOMER',
            status: 'ACTIVE',
            currency,
            balance: 0n, // new accounts always start at zero; money only arrives via ledgered deposits
            ownerId: user.id, // always the logged-in user, never from the request body
          },
        });
      });
      await audit.recordSafe({
        actorId: user.id, action: 'ACCOUNT_CREATE', outcome: 'SUCCESS', entityType: 'Account', entityId: account.id, ...ctx,
      });
      return serializeAccount(account);
    } catch (err) {
      if (err.code === 'ACCOUNT_LIMIT_REACHED') {
        await audit.recordSafe({
          actorId: user.id, action: 'ACCOUNT_CREATE', outcome: 'REFUSED', reason: 'ACCOUNT_LIMIT_REACHED',
          metadata: { limit: MAX_ACCOUNTS_PER_USER }, ...ctx,
        });
        throw err;
      }
      const isNumberCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < ACCOUNT_NUMBER_ATTEMPTS;
      if (!isNumberCollision) throw err;
    }
  }
}

// ACCOUNT_HOLDER: only their own accounts (filters ignored).
// ADMIN / AUDITOR: all accounts, with optional filters.
async function listAccounts(user, { page, limit, ownerId, status, type, q }) {
  let where;
  if (hasPermission(user.role, 'accounts:read:any')) {
    where = {};
    if (ownerId) where.ownerId = ownerId;
    if (status) where.status = status;
    if (type) where.type = type;
  } else {
    where = { ownerId: user.id, type: 'CUSTOMER' };
    if (status) where.status = status;
  }
  if (q) {
    where.OR = [
      { accountNumber: { contains: escapeLike(q), mode: 'insensitive' } },
      { owner: { email: { contains: escapeLike(q), mode: 'insensitive' } } },
      { owner: { fullName: { contains: escapeLike(q), mode: 'insensitive' } } },
    ];
  }

  const [rows, total, sum] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { owner: { select: { id: true, email: true, fullName: true } } },
    }),
    prisma.account.count({ where }),
    // Total of CUSTOMER balances matching the filters, summed by PostgreSQL – the
    // frontend never adds money up itself. (SYSTEM is excluded: it mirrors outside money.)
    prisma.account.aggregate({ where: { AND: [where, { type: 'CUSTOMER' }] }, _sum: { balance: true } }),
  ]);

  return {
    items: rows.map(serializeAccount),
    page,
    limit,
    total,
    summary: { totalBalance: toMoney(sum._sum.balance ?? 0n) },
  };
}

// `account` was already loaded and access-checked by requireAccountAccess.
async function getAccount(account) {
  const owner = account.ownerId
    ? await prisma.user.findUnique({ where: { id: account.ownerId }, select: { id: true, email: true, fullName: true } })
    : null;
  return serializeAccount({ ...account, owner });
}

async function getBalance(accountId) {
  // Re-read so the balance is current, not from an earlier query.
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { id: true, accountNumber: true, balance: true, currency: true, status: true },
  });
  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    status: account.status,
    balance: toMoney(account.balance, account.currency),
    asOf: new Date().toISOString(),
  };
}

// ADMIN: freeze / unfreeze / close. Runs in a DB transaction with a row lock
// so a deposit or withdrawal can't happen in the middle of the status change.
async function updateStatus(admin, accountId, { status, reason }, ctx) {
  const refuse = async (code, message) => {
    await audit.recordSafe({
      actorId: admin.id, action: 'ACCOUNT_SET_STATUS', outcome: 'REFUSED', entityType: 'Account', entityId: accountId,
      reason: code, metadata: { requested: status }, ...ctx,
    });
    throw new AppError(409, message, code);
  };

  const result = await prisma.$transaction(async (tx) => {
    // SELECT ... FOR UPDATE locks this row until the transaction ends.
    // $queryRaw with a template literal is parameterized – safe from SQL injection.
    const [locked] = await tx.$queryRaw`
      SELECT id, status, balance FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`;

    if (locked.status === status) return { error: ['STATUS_UNCHANGED', `Account is already ${status}`] };
    if (locked.status === 'CLOSED') return { error: ['ACCOUNT_CLOSED', 'A closed account cannot be reopened'] };
    if (status === 'CLOSED' && locked.balance !== 0n) {
      return { error: ['BALANCE_NOT_ZERO', 'Account balance must be zero before closing'] };
    }

    const updated = await tx.account.update({ where: { id: accountId }, data: { status } });
    // Audit row is written in the same transaction: if it fails, the status change is rolled back too.
    await audit.record(
      {
        actorId: admin.id, action: 'ACCOUNT_SET_STATUS', outcome: 'SUCCESS', entityType: 'Account', entityId: accountId,
        metadata: { from: locked.status, to: status, reason: reason ?? null }, ...ctx,
      },
      tx
    );
    return { account: updated };
  });

  if (result.error) await refuse(...result.error);
  return serializeAccount(result.account);
}

module.exports = { createAccount, listAccounts, getAccount, getBalance, updateStatus, serializeAccount, MAX_ACCOUNTS_PER_USER };
