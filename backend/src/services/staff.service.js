// Staff management (ADMIN only, step 5): administrators and auditors.
//
// Rules (the API checks them; the database enforces the role rules again):
// - Only ADMIN ↔ AUDITOR. An account holder never becomes staff, staff never become account holders
//   (trigger users_role_transition) – staff cannot own customer accounts (trigger accounts_owner_is_holder).
// - Every change needs the acting admin's own password (a stolen session alone is not enough); wrong passwords
//   count toward the failed-login limits (routes/admin.routes.js).
// - Nobody changes their own role; the last active admin cannot be demoted (lock + trigger users_keep_one_active_admin).
// - New staff get a random temporary password, shown ONCE to the creating admin and never stored or logged in
//   plain text; they must change it before they can do anything else (users.mustChangePassword).
// - A role change ends all of that person's sessions.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const escapeLike = require('../utils/escapeLike');
const audit = require('./audit.service');
const { publicUserFields } = require('./auth.service');
const { lockRosterAndCheckActor, asLastAdminError, refuse } = require('./user.service');

const STAFF_ROLES = ['ADMIN', 'AUDITOR'];

async function listStaff({ page, limit, role, status, q }) {
  const where = { role: role ? role : { in: STAFF_ROLES } };
  if (status) where.isActive = status === 'ACTIVE';
  if (q) {
    where.OR = [
      { email: { contains: escapeLike(q), mode: 'insensitive' } },
      { fullName: { contains: escapeLike(q), mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: publicUserFields, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.user.count({ where }),
  ]);
  return { items, page, limit, total };
}

// Re-authentication for sensitive actions.
async function confirmAdminPassword(admin, password, action, entityId, ctx) {
  const row = await prisma.user.findUnique({ where: { id: admin.id }, select: { passwordHash: true } });
  if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
    throw await refuse(admin, action, entityId, 'WRONG_PASSWORD', ctx,
      new AppError(400, 'Your password is incorrect', 'INVALID_CURRENT_PASSWORD', [{ field: 'currentPassword', message: 'Your password is incorrect' }]));
  }
}

// 20 characters from an unambiguous alphabet, always with upper case, lower case and a digit
// (so it passes the normal password rules).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function temporaryPassword() {
  for (;;) {
    const bytes = crypto.randomBytes(20);
    const value = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
    if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) return value;
  }
}

async function createStaff(admin, { email, fullName, role, currentPassword }, ctx) {
  await confirmAdminPassword(admin, currentPassword, 'STAFF_CREATE', null, ctx);
  const password = temporaryPassword();
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  const now = new Date();
  try {
    const user = await prisma.$transaction(async (tx) => {
      await lockRosterAndCheckActor(tx, admin.id);
      // An existing user is never promoted – staff accounts are always new.
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new AppError(409, 'A user with this email already exists – existing users are never turned into staff', 'EMAIL_TAKEN');
      }
      const created = await tx.user.create({
        data: { email, fullName, role, passwordHash, mustChangePassword: true, onboardingStatus: 'APPROVED', onboardedAt: now },
        select: publicUserFields,
      });
      // The temporary password is NOT in the audit log.
      await audit.record({
        actorId: admin.id, action: 'STAFF_CREATE', outcome: 'SUCCESS', entityType: 'User', entityId: created.id,
        metadata: { email, role }, ...ctx,
      }, tx);
      return created;
    });
    return { user, temporaryPassword: password };
  } catch (err) {
    const known = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      ? new AppError(409, 'A user with this email already exists – existing users are never turned into staff', 'EMAIL_TAKEN')
      : err;
    if (known instanceof AppError) throw await refuse(admin, 'STAFF_CREATE', null, known.code, ctx, known);
    throw known;
  }
}

async function changeRole(admin, userId, { role, currentPassword, reason: note }, ctx) {
  if (admin.id === userId) {
    throw await refuse(admin, 'USER_CHANGE_ROLE', userId, 'CANNOT_CHANGE_OWN_ROLE', ctx,
      new AppError(400, 'You cannot change your own role', 'CANNOT_CHANGE_OWN_ROLE'));
  }
  await confirmAdminPassword(admin, currentPassword, 'USER_CHANGE_ROLE', userId, ctx);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockRosterAndCheckActor(tx, admin.id);
      const [target] = await tx.$queryRaw`SELECT role::text AS role, "isActive" FROM "users" WHERE id = ${userId}::uuid FOR UPDATE`;
      if (!target) throw new AppError(404, 'User not found', 'NOT_FOUND');
      if (!STAFF_ROLES.includes(target.role)) {
        throw new AppError(400, 'Only staff roles can be changed – account holders never become staff', 'ROLE_CHANGE_NOT_ALLOWED');
      }
      if (target.role === role) throw new AppError(409, `The user is already ${role}`, 'ROLE_UNCHANGED');
      if (target.role === 'ADMIN' && target.isActive) {
        const others = await tx.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: userId } } });
        if (others === 0) throw new AppError(409, 'At least one active administrator must remain', 'LAST_ACTIVE_ADMIN');
      }
      // New role → new sessions: every existing token of this person stops working.
      const user = await tx.user.update({ where: { id: userId }, data: { role, sessionVersion: { increment: 1 } }, select: publicUserFields });
      await audit.record({
        actorId: admin.id, action: 'USER_CHANGE_ROLE', outcome: 'SUCCESS', entityType: 'User', entityId: userId,
        metadata: { from: target.role, to: role, ...(note && { note }) }, ...ctx,
      }, tx);
      return user;
    });
  } catch (err) {
    const known = asLastAdminError(err);
    if (known instanceof AppError) throw await refuse(admin, 'USER_CHANGE_ROLE', userId, known.code, ctx, known);
    throw known;
  }
}

module.exports = { listStaff, createStaff, changeRole, temporaryPassword, STAFF_ROLES };
