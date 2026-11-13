const prisma = require('../config/prisma');

// Writes one row to audit_logs. The database chains every row (trigger audit_logs_chain, step 6): sequence
// number, previous hash and own hash are set there – nothing here can choose or skip them.
// `client` lets callers pass a transaction client (tx) so the audit row commits or rolls back together with
// the change it describes. Audit rows must be the LAST write in a transaction (the chain lock is held until
// commit – see the migration).

// Keys whose values must never be stored, at any depth – even if a caller passes them by mistake.
const SECRET_KEYS = /^(password|currentPassword|newPassword|temporaryPassword|passwordHash|token|accessToken|refreshToken|secret|cookie|authorization|sessionVersion)$/i;
const MAX_STRING = 500;
const MAX_DEPTH = 5;

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[REDACTED]' : sanitize(v, depth + 1)])
  );
}

async function record(
  { actorId = null, action, outcome, entityType = null, entityId = null, reason = null, metadata = null, ipAddress = null, userAgent = null },
  client = prisma
) {
  return client.auditLog.create({
    data: { actorId, action, outcome, entityType, entityId, reason, metadata: sanitize(metadata), ipAddress, userAgent },
  });
}

// For logging outside a transaction: an audit failure must never crash the
// request or hide the original error, so we log it to the console instead.
async function recordSafe(entry) {
  try {
    await record(entry);
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { record, recordSafe, sanitize };
