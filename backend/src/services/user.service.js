const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { publicUserFields } = require('./auth.service');
const audit = require('./audit.service');

async function listUsers({ page, limit, role, status, q }) {
  const where = {};
  if (role) where.role = role;
  if (status) where.isActive = status === 'ACTIVE';
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: publicUserFields,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, page, limit, total };
}

// Activate or deactivate a user. A deactivated user's existing tokens stop
// working immediately, because `authenticate` re-checks isActive on every request.
async function setUserActive(admin, userId, isActive, ctx) {
  if (admin.id === userId) {
    await audit.recordSafe({
      actorId: admin.id, action: 'USER_SET_STATUS', outcome: 'REFUSED',
      entityType: 'User', entityId: userId, reason: 'CANNOT_CHANGE_OWN_STATUS', ...ctx,
    });
    throw new AppError(400, 'You cannot change your own status', 'CANNOT_CHANGE_OWN_STATUS');
  }

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
  if (!existing) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const user = await prisma.user.update({ where: { id: userId }, data: { isActive }, select: publicUserFields });

  await audit.recordSafe({
    actorId: admin.id, action: 'USER_SET_STATUS', outcome: 'SUCCESS', entityType: 'User', entityId: userId,
    metadata: { from: existing.isActive, to: isActive }, ...ctx,
  });

  return user;
}

module.exports = { listUsers, setUserActive };
