// User management (ADMIN): list, details, activate/deactivate, sign out everywhere.
// Staff roles are managed in staff.service.js.
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const escapeLike = require('../utils/escapeLike');
const { toMoney } = require('../utils/money');
const { publicUserFields } = require('./auth.service');
const audit = require('./audit.service');
const { ageOn } = require('../utils/schemas/onboarding.schemas');

// Every change that can affect who is an active ADMIN takes this lock, so two admins cannot (for example)
// deactivate each other at the same moment. The database checks "one active admin remains" at commit too.
const ADMIN_ROSTER_LOCK = 'ledgerline:admin-roster';

async function listUsers({ page, limit, role, status, onboarding, q }) {
  const where = {};
  if (role) where.role = role;
  if (status) where.isActive = status === 'ACTIVE';
  if (onboarding) where.onboardingStatus = onboarding;
  if (q) {
    where.OR = [
      { email: { contains: escapeLike(q), mode: 'insensitive' } },
      { fullName: { contains: escapeLike(q), mode: 'insensitive' } },
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

// "+919876543210" → "+91 ••••••3210": enough to recognise a number, not enough to use it.
const maskPhone = (phone) => `${phone.slice(0, 3)} ••••••${phone.slice(-4)}`;

// Details for the admin's user page. Personal data is minimised: no date of birth (only the age), no PIN code,
// the phone number masked. Never the password hash or session version.
// Step 6: opening someone's details shows (minimised) personal data – that access itself is audited.
async function getUserDetails(admin, userId, ctx) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicUserFields, profile: { select: { dateOfBirth: true, phone: true, city: true, state: true, occupation: true } } },
  });
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [accountGroups, transactions, lastLogin, failedLogins24h] = await Promise.all([
    prisma.account.groupBy({ by: ['status'], where: { ownerId: userId, type: 'CUSTOMER' }, _count: true, _sum: { balance: true } }),
    prisma.transaction.count({ where: { initiatedById: userId } }),
    prisma.auditLog.findFirst({ where: { actorId: userId, action: 'AUTH_LOGIN', outcome: 'SUCCESS' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.auditLog.count({ where: { actorId: userId, action: 'AUTH_LOGIN', outcome: 'REFUSED', createdAt: { gte: since24h } } }),
  ]);

  await audit.recordSafe({
    actorId: admin.id, action: 'USER_VIEW_DETAILS', outcome: 'SUCCESS', entityType: 'User', entityId: userId,
    metadata: { profileShown: Boolean(user.profile) }, ...ctx,
  });

  const byStatus = Object.fromEntries(accountGroups.map((g) => [g.status, g._count]));
  const totalBalance = accountGroups.reduce((sum, g) => sum + (g._sum.balance ?? 0n), 0n);
  const { profile, ...publicUser } = user;
  return {
    user: publicUser,
    profile: profile && {
      age: ageOn(profile.dateOfBirth.toISOString().slice(0, 10)),
      phone: maskPhone(profile.phone),
      city: profile.city,
      state: profile.state,
      occupation: profile.occupation,
    },
    accounts: {
      total: accountGroups.reduce((n, g) => n + g._count, 0),
      active: byStatus.ACTIVE ?? 0,
      frozen: byStatus.FROZEN ?? 0,
      closed: byStatus.CLOSED ?? 0,
      totalBalance: toMoney(totalBalance),
    },
    activity: { transactions, lastLoginAt: lastLogin?.createdAt ?? null, failedLogins24h },
  };
}

// The acting admin must still be an active ADMIN *inside* the transaction (another admin may have just
// deactivated or demoted them – their request was authenticated a moment earlier).
async function lockRosterAndCheckActor(tx, adminId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADMIN_ROSTER_LOCK}))`;
  const [actor] = await tx.$queryRaw`SELECT role::text AS role, "isActive" FROM "users" WHERE id = ${adminId}::uuid FOR UPDATE`;
  if (!actor || actor.role !== 'ADMIN' || !actor.isActive) {
    throw new AppError(403, 'Your administrator access has changed. Please sign in again.', 'ACTOR_NOT_AUTHORIZED');
  }
}

// The database's deferred trigger users_keep_one_active_admin as a clear error (backstop – the API checks first).
function asLastAdminError(err) {
  return /At least one active administrator must remain/.test(String(err?.message))
    ? new AppError(409, 'At least one active administrator must remain', 'LAST_ACTIVE_ADMIN')
    : err;
}

async function refuse(admin, action, userId, reason, ctx, error) {
  await audit.recordSafe({ actorId: admin.id, action, outcome: 'REFUSED', entityType: 'User', entityId: userId, reason, ...ctx });
  return error;
}

// Activate or deactivate a user. Raising sessionVersion revokes every existing token at once (a token stolen
// before a deactivation must not work again after a reactivation). `note` is the admin's optional reason.
async function setUserActive(admin, userId, isActive, note, ctx) {
  if (admin.id === userId) {
    throw await refuse(admin, 'USER_SET_STATUS', userId, 'CANNOT_CHANGE_OWN_STATUS', ctx,
      new AppError(400, 'You cannot change your own status', 'CANNOT_CHANGE_OWN_STATUS'));
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await lockRosterAndCheckActor(tx, admin.id);
      const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true, role: true } });
      if (!existing) throw new AppError(404, 'User not found', 'NOT_FOUND');
      if (existing.isActive === isActive) {
        throw new AppError(409, `The user is already ${isActive ? 'active' : 'deactivated'}`, 'STATUS_UNCHANGED');
      }
      if (!isActive && existing.role === 'ADMIN') {
        const others = await tx.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: userId } } });
        if (others === 0) throw new AppError(409, 'At least one active administrator must remain', 'LAST_ACTIVE_ADMIN');
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { isActive, sessionVersion: { increment: 1 } },
        select: publicUserFields,
      });
      await audit.record({
        actorId: admin.id, action: 'USER_SET_STATUS', outcome: 'SUCCESS', entityType: 'User', entityId: userId,
        metadata: { from: existing.isActive, to: isActive, role: existing.role, ...(note && { note }) }, ...ctx,
      }, tx);
      return user;
    });
  } catch (err) {
    const known = asLastAdminError(err);
    if (known instanceof AppError) throw await refuse(admin, 'USER_SET_STATUS', userId, known.code, ctx, known);
    throw known;
  }
}

// Ends every session of a user (e.g. a lost phone, a suspected stolen session) without deactivating them.
async function revokeSessions(admin, userId, note, ctx) {
  if (admin.id === userId) {
    throw await refuse(admin, 'USER_REVOKE_SESSIONS', userId, 'CANNOT_REVOKE_OWN_SESSIONS', ctx,
      new AppError(400, 'Use "Sign out" to end your own sessions', 'CANNOT_REVOKE_OWN_SESSIONS'));
  }
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw await refuse(admin, 'USER_REVOKE_SESSIONS', userId, 'NOT_FOUND', ctx, new AppError(404, 'User not found', 'NOT_FOUND'));

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } }, select: publicUserFields });
    await audit.record({
      actorId: admin.id, action: 'USER_REVOKE_SESSIONS', outcome: 'SUCCESS', entityType: 'User', entityId: userId,
      metadata: note ? { note } : null, ...ctx,
    }, tx);
    return user;
  });
}

module.exports = { listUsers, getUserDetails, setUserActive, revokeSessions, lockRosterAndCheckActor, asLastAdminError, refuse, maskPhone };
