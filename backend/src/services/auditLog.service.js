const prisma = require('../config/prisma');

// Read-only access to the audit trail (ADMIN and AUDITOR).
async function listAuditLogs({ page, limit, outcome, action, actionPrefix, actorId, entityId, entityType, from, to }) {
  const where = {};
  if (outcome) where.outcome = outcome;
  if (action) where.action = action;
  else if (actionPrefix) where.action = { startsWith: actionPrefix };
  if (actorId) where.actorId = actorId;
  if (entityId) where.entityId = entityId;
  if (entityType) where.entityType = entityType;
  if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lt: to }) };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { chainSeq: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { actor: { select: { id: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, page, limit, total };
}

// GET /api/audit-logs/verify – recomputes the whole hash chain in the database (audit_chain_problems, step 6).
// `head` (the last sequence number and hash) can be noted down outside the system: if the chain is ever
// rewritten consistently from some point on, the head no longer matches what was recorded.
async function verifyAuditChain() {
  const [problems, [head], [{ count }]] = await Promise.all([
    prisma.$queryRaw`SELECT "chainSeq", problem FROM audit_chain_problems(20)`,
    prisma.$queryRaw`SELECT "chainSeq", "hash", "createdAt" FROM "audit_logs" ORDER BY "chainSeq" DESC LIMIT 1`,
    prisma.$queryRaw`SELECT count(*)::int AS count FROM "audit_logs"`,
  ]);
  return {
    ok: problems.length === 0,
    records: count,
    head: head ? { chainSeq: head.chainSeq.toString(), hash: head.hash, createdAt: head.createdAt } : null,
    problems: problems.map((p) => ({ chainSeq: p.chainSeq.toString(), problem: p.problem })),
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { listAuditLogs, verifyAuditChain };
