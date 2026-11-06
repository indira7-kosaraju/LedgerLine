const prisma = require('../config/prisma');

// Read-only access to the audit trail (ADMIN and AUDITOR).
async function listAuditLogs({ page, limit, outcome, action, actorId, entityId }) {
  const where = {};
  if (outcome) where.outcome = outcome;
  if (action) where.action = action;
  if (actorId) where.actorId = actorId;
  if (entityId) where.entityId = entityId;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { actor: { select: { id: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, page, limit, total };
}

module.exports = { listAuditLogs };
