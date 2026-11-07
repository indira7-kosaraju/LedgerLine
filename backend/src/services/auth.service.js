const bcrypt = require('bcrypt');
const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { signAccessToken } = require('../utils/jwt');
const audit = require('./audit.service');

// Fields that are safe to send to the client. passwordHash is NEVER included.
const publicUserFields = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

// A real bcrypt hash of a random value. Used when the email doesn't exist so
// login takes the same time either way – attackers can't discover which
// emails are registered by measuring response time.
const DUMMY_HASH = bcrypt.hashSync(require('crypto').randomBytes(16).toString('hex'), env.BCRYPT_SALT_ROUNDS);

async function register({ email, password, fullName }, ctx) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  let user;
  try {
    user = await prisma.user.create({
      // role is not taken from the request: every self-registered user is an ACCOUNT_HOLDER.
      data: { email, passwordHash, fullName, role: 'ACCOUNT_HOLDER' },
      select: { ...publicUserFields, sessionVersion: true },
    });
  } catch (err) {
    // P2002 = unique constraint failed → the email is already registered.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      await audit.recordSafe({ action: 'AUTH_REGISTER', outcome: 'REFUSED', reason: 'EMAIL_TAKEN', metadata: { email }, ...ctx });
      throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }

  await audit.recordSafe({ actorId: user.id, action: 'AUTH_REGISTER', outcome: 'SUCCESS', entityType: 'User', entityId: user.id, ...ctx });

  return { user: toPublicUser(user), token: signAccessToken(user) };
}

// Only the allow-listed fields ever leave the server – never passwordHash or sessionVersion,
// and not any column added in the future by accident.
function toPublicUser(user) {
  return Object.fromEntries(Object.keys(publicUserFields).map((key) => [key, user[key]]));
}

async function login({ email, password }, ctx) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt.compare, even when the user doesn't exist (see DUMMY_HASH).
  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk || !user.isActive) {
    const reason = !user ? 'UNKNOWN_EMAIL' : !passwordOk ? 'WRONG_PASSWORD' : 'USER_INACTIVE';
    await audit.recordSafe({
      actorId: user?.id ?? null,
      action: 'AUTH_LOGIN',
      outcome: 'REFUSED',
      reason,
      metadata: { email },
      ...ctx,
    });
    // Same message for every case, so we don't reveal which part was wrong.
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  await audit.recordSafe({ actorId: user.id, action: 'AUTH_LOGIN', outcome: 'SUCCESS', entityType: 'User', entityId: user.id, ...ctx });

  return { user: toPublicUser(user), token: signAccessToken(user) };
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserFields });
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return user;
}

module.exports = { register, login, getProfile, publicUserFields };
