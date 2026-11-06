const prisma = require('../config/prisma');

// Writes one row to audit_logs.
// `client` lets callers pass a transaction client (tx) so the audit row
// commits or rolls back together with the money movement (used in Task 6).
async function record(
  { actorId = null, action, outcome, entityType = null, entityId = null, reason = null, metadata = null, ipAddress = null, userAgent = null },
  client = prisma
) {
  return client.auditLog.create({
    data: { actorId, action, outcome, entityType, entityId, reason, metadata, ipAddress, userAgent },
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

module.exports = { record, recordSafe };
