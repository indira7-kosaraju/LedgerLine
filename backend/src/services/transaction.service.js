const crypto = require('crypto');
const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');
const policy = require('../config/policy');
const { hasPermission } = require('../config/permissions');
const AppError = require('../utils/AppError');
const escapeLike = require('../utils/escapeLike');
const { toMoney, formatPaise } = require('../utils/money');
const { canAccessAccount, ACCOUNT_ACTIONS } = require('./accessControl.service');
const audit = require('./audit.service');
const idempotencyService = require('./idempotency.service');

// ─────────────────────────── helpers ───────────────────────────

// A business-rule refusal (insufficient funds, not owner, frozen...).
// `accountId` tells the audit log which account the refusal was about.
function refusal(statusCode, code, message, accountId = null) {
  const err = new AppError(statusCode, message, code);
  err.refusal = { accountId };
  return err;
}

// e.g. TXN-20261106-9F3A1C7B2E
function generateReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `TXN-${date}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

let systemAccountId = null;
async function getSystemAccountId() {
  if (systemAccountId) return systemAccountId;
  const system = await prisma.account.findUnique({
    where: { accountNumber: policy.SYSTEM_ACCOUNT_NUMBER },
    select: { id: true },
  });
  if (!system) throw new Error('SYSTEM account missing – run "npm run db:seed"');
  systemAccountId = system.id;
  return systemAccountId;
}

// Locks account rows with SELECT ... FOR UPDATE, ALWAYS in sorted id order.
//
// Why sorted? Imagine transfer A→B and transfer B→A at the same moment.
// Without ordering: tx1 locks A, tx2 locks B, then each waits for the other = DEADLOCK.
// With ordering: both try to lock the smaller id first, so one simply waits for the other.
//
// Locks are held until the database transaction commits or rolls back,
// so no other transaction can read-then-change these balances in between.
async function lockAccounts(tx, ids) {
  const sorted = [...new Set(ids)].sort();
  const locked = new Map();
  for (const id of sorted) {
    // Tagged-template $queryRaw is parameterized: ${id} is sent separately from the SQL text.
    const [row] = await tx.$queryRaw`
      SELECT id, "accountNumber", "ownerId", type, status, balance, currency
      FROM accounts WHERE id = ${id}::uuid FOR UPDATE`;
    if (row) locked.set(id, row);
  }
  return locked;
}

// Deadlocks (40P01) and serialization failures (40001) are safe to retry because
// the whole transaction was rolled back – nothing was half-written.
function isRetryable(err) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === 'P2034') return true;
  return err.code === 'P2010' && /40P01|40001/.test(String(err.meta?.code ?? err.message));
}

// Retries the whole transaction up to `attempts` times on a deadlock / serialization
// failure, waiting a short random time first so the competing transactions don't
// collide again at exactly the same moment.
async function withRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts || !isRetryable(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(Math.random() * 40) * i));
    }
  }
}

function serializeTransaction(t) {
  return {
    id: t.id,
    reference: t.reference,
    type: t.type,
    status: t.status,
    amount: toMoney(t.amount, t.currency),
    fromAccount: t.fromAccount ? { id: t.fromAccount.id, accountNumber: t.fromAccount.accountNumber } : { id: t.fromAccountId },
    toAccount: t.toAccount ? { id: t.toAccount.id, accountNumber: t.toAccount.accountNumber } : { id: t.toAccountId },
    initiatedById: t.initiatedById,
    description: t.description,
    createdAt: t.createdAt,
  };
}

// ─────────────────────────── rules ───────────────────────────

// Checks run on the LOCKED rows, so balances and statuses can't change underneath us.
function checkRules(type, user, from, to, amount) {
  if (type === 'DEPOSIT') {
    // from = SYSTEM, to = the user's account
    if (!to) throw refusal(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (!canAccessAccount(user, to, ACCOUNT_ACTIONS.MOVE_MONEY).allowed) {
      throw refusal(403, 'NOT_OWNER', 'You can only deposit into your own account', to.id);
    }
    if (to.status !== 'ACTIVE') throw refusal(422, 'ACCOUNT_NOT_ACTIVE', `Account is ${to.status}`, to.id);
    return;
  }

  // WITHDRAWAL and TRANSFER: money leaves `from`, which must be the user's own active account.
  if (!from) throw refusal(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
  if (!canAccessAccount(user, from, ACCOUNT_ACTIONS.MOVE_MONEY).allowed) {
    throw refusal(403, 'NOT_OWNER', 'You can only move money from your own account', from.id);
  }
  if (from.status !== 'ACTIVE') throw refusal(422, 'ACCOUNT_NOT_ACTIVE', `Account is ${from.status}`, from.id);

  if (type === 'TRANSFER') {
    // A SYSTEM destination is reported as "not found" so its existence isn't revealed.
    if (!to || to.type !== 'CUSTOMER') throw refusal(404, 'DESTINATION_NOT_FOUND', 'Destination account not found', from.id);
    if (to.status !== 'ACTIVE') {
      throw refusal(422, 'DESTINATION_NOT_ACTIVE', 'Destination account cannot receive funds', from.id);
    }
  }

  if (from.balance < amount) {
    throw refusal(422, 'INSUFFICIENT_FUNDS', `Insufficient funds: available ${formatPaise(from.balance)}`, from.id);
  }
}

const LIMITS = {
  DEPOSIT: policy.MAX_DEPOSIT_PAISE,
  WITHDRAWAL: policy.MAX_WITHDRAWAL_PAISE,
  TRANSFER: policy.MAX_TRANSFER_PAISE,
};

// ─────────────────────────── core ───────────────────────────

// The ONE function that moves money. Deposit, withdrawal and transfer all use it.
// Every step happens inside a single PostgreSQL transaction:
//   claim idempotency key → lock rows → check rules → update both balances → write transaction
//   → write DEBIT + CREDIT ledger entries → write SUCCESS audit row → store response on the key → COMMIT
// If anything throws, PostgreSQL rolls back ALL of it. There is no partial transfer,
// and the key claim disappears with it.
async function moveMoney({ type, user, fromAccountId, toAccountId, amount, description, ctx, idempotency }) {
  const action = `TXN_${type}`;
  const attempt = {
    amountPaise: amount.toString(),
    fromAccountId: fromAccountId ?? null,
    toAccountId: toAccountId ?? null,
  };

  try {
    if (amount > LIMITS[type]) {
      throw refusal(422, 'AMOUNT_EXCEEDS_LIMIT', `Maximum per ${type.toLowerCase()} is ${formatPaise(LIMITS[type])}`);
    }
    if (fromAccountId === toAccountId) {
      throw refusal(400, 'SAME_ACCOUNT', 'Source and destination must be different accounts', fromAccountId);
    }

    return await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          // FIRST: claim the key. A concurrent request with the same key waits here.
          await idempotencyService.claimKey(tx, user.id, idempotency);

          const locked = await lockAccounts(tx, [fromAccountId, toAccountId]);
          const from = locked.get(fromAccountId);
          const to = locked.get(toAccountId);

          checkRules(type, user, from, to, amount);

          // BigInt arithmetic only. The DB CHECK constraint is a second safety net:
          // a customer balance below 0 would make this UPDATE fail and roll everything back.
          const fromAfter = from.balance - amount;
          const toAfter = to.balance + amount;
          await tx.account.update({ where: { id: from.id }, data: { balance: fromAfter } });
          await tx.account.update({ where: { id: to.id }, data: { balance: toAfter } });

          const txn = await tx.transaction.create({
            data: {
              reference: generateReference(),
              type,
              status: 'COMPLETED',
              amount,
              currency: 'INR',
              fromAccountId: from.id,
              toAccountId: to.id,
              initiatedById: user.id,
              description: description ?? null,
            },
          });

          // Double entry: one DEBIT and one CREDIT of the same amount.
          await tx.ledgerEntry.create({
            data: { transactionId: txn.id, accountId: from.id, direction: 'DEBIT', amount, balanceAfter: fromAfter },
          });
          await tx.ledgerEntry.create({
            data: { transactionId: txn.id, accountId: to.id, direction: 'CREDIT', amount, balanceAfter: toAfter },
          });

          // Same transaction: if the audit row can't be written, the money doesn't move either.
          await audit.record(
            {
              actorId: user.id,
              action,
              outcome: 'SUCCESS',
              entityType: 'Transaction',
              entityId: txn.id,
              metadata: { ...attempt, reference: txn.reference, from: from.accountNumber, to: to.accountNumber },
              ...ctx,
            },
            tx
          );

          const result = {
            transaction: serializeTransaction({
              ...txn,
              fromAccount: { id: from.id, accountNumber: from.accountNumber },
              toAccount: { id: to.id, accountNumber: to.accountNumber },
            }),
            // Only the CALLER's account balance is returned – never the recipient's.
            account:
              type === 'DEPOSIT'
                ? { id: to.id, accountNumber: to.accountNumber, balance: toMoney(toAfter) }
                : { id: from.id, accountNumber: from.accountNumber, balance: toMoney(fromAfter) },
          };

          // LAST: remember the response on the key, in the same transaction as the money.
          await idempotencyService.completeKey(tx, user.id, idempotency, { status: 201, body: result, transactionId: txn.id });
          return result;
        },
        { maxWait: 5000, timeout: 10000 }
      )
    );
  } catch (err) {
    // Lost the race to a concurrent request with the same key: not an error –
    // runIdempotent() replays the winner's result. Nothing was written by this attempt.
    if (idempotencyService.isKeyConflict(err)) throw err;

    // The transaction was rolled back, so record the refusal OUTSIDE it – otherwise the
    // audit row would be rolled back too and the attempt would leave no trace.
    if (err.refusal) {
      await audit.recordSafe({
        actorId: user.id,
        action,
        outcome: 'REFUSED',
        entityType: 'Account',
        entityId: err.refusal.accountId,
        reason: err.code,
        metadata: attempt,
        ...ctx,
      });
      // Remember the refusal on the key so an identical retry gets the same answer.
      await idempotencyService.storeRefusal(user.id, idempotency, {
        status: err.statusCode,
        body: { error: { code: err.code, message: err.message } },
      });
    } else if (!(err instanceof AppError)) {
      await audit.recordSafe({
        actorId: user.id, action, outcome: 'ERROR', reason: 'INTERNAL_ERROR', metadata: attempt, ...ctx,
      });
    }
    throw err;
  }
}

// ─────────────────────────── public API ───────────────────────────

// Each returns { status, body, replayed }: a new result (201) or the stored result of an
// earlier request with the same Idempotency-Key (replayed: true). `idempotency` is
// { key, endpoint, requestHash } from middleware/idempotency.js – always required.

async function deposit(user, { accountId, amountPaise, description }, ctx, idempotency) {
  return idempotencyService.runIdempotent(user, idempotency, ctx, async () => {
    const systemId = await getSystemAccountId();
    return moveMoney({ type: 'DEPOSIT', user, fromAccountId: systemId, toAccountId: accountId, amount: amountPaise, description, ctx, idempotency });
  });
}

async function withdraw(user, { accountId, amountPaise, description }, ctx, idempotency) {
  return idempotencyService.runIdempotent(user, idempotency, ctx, async () => {
    const systemId = await getSystemAccountId();
    return moveMoney({ type: 'WITHDRAWAL', user, fromAccountId: accountId, toAccountId: systemId, amount: amountPaise, description, ctx, idempotency });
  });
}

async function transfer(user, { fromAccountId, toAccountId, toAccountNumber, amountPaise, description }, ctx, idempotency) {
  return idempotencyService.runIdempotent(user, idempotency, ctx, async () => {
    let destinationId = toAccountId;
    if (toAccountNumber) {
      const dest = await prisma.account.findUnique({ where: { accountNumber: toAccountNumber }, select: { id: true } });
      // Unknown number: use a random id so the normal "destination not found" path (and audit) runs.
      destinationId = dest?.id ?? crypto.randomUUID();
    }
    return moveMoney({ type: 'TRANSFER', user, fromAccountId, toAccountId: destinationId, amount: amountPaise, description, ctx, idempotency });
  });
}

// ACCOUNT_HOLDER: only transactions touching their own accounts.
// ADMIN / AUDITOR: all transactions.
async function listTransactions(user, { page, limit, accountId, type, q }) {
  const filters = [];
  if (!hasPermission(user.role, 'transactions:read:any')) {
    filters.push({ OR: [{ fromAccount: { ownerId: user.id } }, { toAccount: { ownerId: user.id } }] });
  }
  if (accountId) filters.push({ OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] });
  if (type) filters.push({ type });
  if (q) filters.push({ reference: { contains: escapeLike(q), mode: 'insensitive' } });
  const where = filters.length ? { AND: filters } : {};

  const accountRef = { select: { id: true, accountNumber: true } };
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { fromAccount: accountRef, toAccount: accountRef },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { items: rows.map(serializeTransaction), page, limit, total };
}

// One transaction with its ledger entries.
// ADMIN / AUDITOR: everything. ACCOUNT_HOLDER: only if one side is their account, and
// only the ledger entries on THEIR accounts – the other side's balanceAfter would reveal
// someone else's balance.
async function getTransaction(user, id, ctx) {
  const accountRef = { select: { id: true, accountNumber: true, ownerId: true } };
  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: {
      fromAccount: accountRef,
      toAccount: accountRef,
      initiatedBy: { select: { id: true, fullName: true, email: true } },
      ledgerEntries: { orderBy: { entryNumber: 'asc' }, include: { account: { select: { accountNumber: true, ownerId: true } } } },
    },
  });
  if (!txn) throw new AppError(404, 'Transaction not found', 'NOT_FOUND');

  const seesAll = hasPermission(user.role, 'transactions:read:any');
  const involved = txn.fromAccount.ownerId === user.id || txn.toAccount.ownerId === user.id;
  if (!seesAll && !involved) {
    await audit.recordSafe({
      actorId: user.id, action: 'TXN_VIEW', outcome: 'REFUSED', entityType: 'Transaction', entityId: txn.id, reason: 'NOT_INVOLVED', ...ctx,
    });
    throw new AppError(403, 'You do not have access to this transaction', 'FORBIDDEN');
  }

  let initiatedBy = null;
  if (seesAll) initiatedBy = txn.initiatedBy;
  else if (txn.initiatedById === user.id) initiatedBy = { id: user.id, fullName: user.fullName, email: user.email };

  const visible = txn.ledgerEntries.filter((e) => seesAll || e.account.ownerId === user.id);

  return {
    // serializeTransaction only exposes account id + number, never ownerId.
    transaction: { ...serializeTransaction(txn), initiatedBy },
    ledgerEntries: visible.map((e) => ({
        id: e.id,
        entryNumber: e.entryNumber.toString(),
        accountId: e.accountId,
        accountNumber: e.account.accountNumber,
        direction: e.direction,
        amount: toMoney(e.amount),
        balanceAfter: toMoney(e.balanceAfter),
        createdAt: e.createdAt,
      })),
    // How many entries belong to other people's accounts (shown as a note, not the data).
    entriesHidden: txn.ledgerEntries.length - visible.length,
  };
}

module.exports = { deposit, withdraw, transfer, listTransactions, getTransaction, serializeTransaction, withRetry, isRetryable };
