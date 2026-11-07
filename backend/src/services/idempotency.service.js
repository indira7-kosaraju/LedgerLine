const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');
const policy = require('../config/policy');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');

// Idempotency = "doing the same request twice has the same effect as doing it once".
//
// HOW DUPLICATES ARE MADE IMPOSSIBLE
// The key row is INSERTed inside the SAME database transaction as the money movement
// (see claimKey, called from transaction.service.js). So:
//   • a committed movement ALWAYS has a committed key row, and
//   • UNIQUE("userId", key) allows only ONE committed row per key.
// → two committed movements with the same key cannot exist, whatever the app code does.
//
// SIMULTANEOUS REQUESTS WITH THE SAME KEY
// PostgreSQL makes the second INSERT wait until the first transaction finishes:
//   • first COMMITS     → second gets a unique violation → we replay the stored result
//   • first ROLLS BACK  → second's INSERT succeeds → it runs normally

const TTL_MS = policy.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;

const expiresAt = () => new Date(Date.now() + TTL_MS);
const shortKey = (key) => `${key.slice(0, 8)}…`; // audit logs don't need the whole key

// Prisma's error for a unique-constraint violation on idempotency_keys.
function isKeyConflict(err) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    (err.meta?.modelName === 'IdempotencyKey' || String(err.meta?.target ?? '').includes('key'))
  );
}

// Inside the money transaction, BEFORE touching any account: take ownership of the key.
// A concurrent request with the same key blocks here until we commit or roll back.
async function claimKey(tx, userId, idem) {
  // An expired key may be reused as if new (keys are kept for policy.IDEMPOTENCY_TTL_HOURS).
  await tx.$executeRaw`
    DELETE FROM idempotency_keys
    WHERE "userId" = ${userId}::uuid AND key = ${idem.key} AND "expiresAt" < now()`;
  await tx.idempotencyKey.create({
    data: { key: idem.key, userId, endpoint: idem.endpoint, requestHash: idem.requestHash, status: 'IN_PROGRESS', expiresAt: expiresAt() },
  });
}

// Inside the money transaction, just before COMMIT: store the response to replay later.
async function completeKey(tx, userId, idem, { status, body, transactionId }) {
  await tx.idempotencyKey.update({
    where: { userId_key: { userId, key: idem.key } },
    // JSON round-trip turns Dates into strings, exactly as the client received them.
    data: { status: 'COMPLETED', responseStatus: status, responseBody: JSON.parse(JSON.stringify(body)), transactionId },
  });
}

// After a business refusal (e.g. INSUFFICIENT_FUNDS) the money transaction was rolled back,
// so the claim is gone. Store the refusal so an identical retry gets the same answer.
// Unexpected errors (500) are NOT stored – the client may safely retry those.
async function storeRefusal(userId, idem, { status, body }) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM idempotency_keys
        WHERE "userId" = ${userId}::uuid AND key = ${idem.key} AND "expiresAt" < now()`;
      await tx.idempotencyKey.create({
        data: {
          key: idem.key, userId, endpoint: idem.endpoint, requestHash: idem.requestHash,
          status: 'COMPLETED', responseStatus: status, responseBody: body, expiresAt: expiresAt(),
        },
      });
    });
  } catch (err) {
    // A concurrent request with the same key already stored its outcome – that one stands.
    if (!isKeyConflict(err)) console.error('Failed to store idempotent refusal:', err.message);
  }
}

// Looks for an earlier request with this key. Returns the stored outcome to replay,
// null if the key is new (or expired), or throws if the key is being misused.
async function findReplay(user, idem, ctx) {
  const record = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId: user.id, key: idem.key } } });
  if (!record || record.expiresAt < new Date()) return null;

  if (record.endpoint !== idem.endpoint || record.requestHash !== idem.requestHash) {
    await audit.recordSafe({
      actorId: user.id, action: 'IDEMPOTENCY_CHECK', outcome: 'REFUSED', reason: 'IDEMPOTENCY_KEY_REUSED',
      metadata: { key: shortKey(idem.key), endpoint: idem.endpoint, originalEndpoint: record.endpoint }, ...ctx,
    });
    throw new AppError(422, 'This Idempotency-Key was already used for a different request. Use a new key for a new operation.', 'IDEMPOTENCY_KEY_REUSED');
  }

  // Never visible in practice (claims are uncommitted until done), but never guess: refuse.
  if (record.status !== 'COMPLETED') {
    throw new AppError(409, 'A request with this Idempotency-Key is still being processed. Try again shortly.', 'IDEMPOTENCY_IN_PROGRESS');
  }

  await audit.recordSafe({
    actorId: user.id, action: 'IDEMPOTENCY_REPLAY', outcome: 'SUCCESS', entityType: record.transactionId ? 'Transaction' : null,
    entityId: record.transactionId, metadata: { key: shortKey(idem.key), endpoint: idem.endpoint, originalStatus: record.responseStatus }, ...ctx,
  });
  return { status: record.responseStatus, body: record.responseBody, replayed: true };
}

// Wraps one money operation:
//   1. key seen before? → return the stored result (or 422 if the request differs)
//   2. otherwise run it (execute claims the key inside its transaction)
//   3. lost a race to a concurrent identical request? → return that request's result
async function runIdempotent(user, idem, ctx, execute) {
  const earlier = await findReplay(user, idem, ctx);
  if (earlier) return earlier;

  try {
    const body = await execute();
    return { status: 201, body, replayed: false };
  } catch (err) {
    if (!isKeyConflict(err)) throw err;
    const winner = await findReplay(user, idem, ctx);
    if (winner) return winner;
    throw new AppError(409, 'A request with this Idempotency-Key is still being processed. Try again shortly.', 'IDEMPOTENCY_IN_PROGRESS');
  }
}

module.exports = { runIdempotent, claimKey, completeKey, storeRefusal, isKeyConflict };
