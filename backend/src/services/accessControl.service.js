const { z } = require('zod');

const prisma = require('../config/prisma');
const { ROLES } = require('../config/permissions');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');

// What the user wants to do with a specific account.
const ACCOUNT_ACTIONS = Object.freeze({
  VIEW: 'VIEW', // see details, balance, statement
  MOVE_MONEY: 'MOVE_MONEY', // deposit into / withdraw from / transfer out of
  MANAGE: 'MANAGE', // change status (freeze, close)
});

// Pure function: no database, easy to unit test.
// Returns { allowed: true } or { allowed: false, reason }.
function canAccessAccount(user, account, action) {
  // Both ids must be real values: `undefined === undefined` is true in JavaScript,
  // which would otherwise make a broken user object "own" a broken account.
  const isOwner =
    account.type === 'CUSTOMER' && typeof user.id === 'string' && user.id.length > 0 && account.ownerId === user.id;

  switch (action) {
    case ACCOUNT_ACTIONS.VIEW:
      if (user.role === ROLES.ADMIN || user.role === ROLES.AUDITOR) return { allowed: true };
      if (user.role === ROLES.ACCOUNT_HOLDER && isOwner) return { allowed: true };
      return { allowed: false, reason: 'NOT_OWNER' };

    case ACCOUNT_ACTIONS.MOVE_MONEY:
      // Only the owning account holder. Admins/auditors never move money,
      // and nobody can move money out of the SYSTEM account through the API.
      if (user.role !== ROLES.ACCOUNT_HOLDER) return { allowed: false, reason: 'ROLE_CANNOT_MOVE_MONEY' };
      if (account.type !== 'CUSTOMER') return { allowed: false, reason: 'SYSTEM_ACCOUNT' };
      if (!isOwner) return { allowed: false, reason: 'NOT_OWNER' };
      return { allowed: true };

    case ACCOUNT_ACTIONS.MANAGE:
      if (user.role !== ROLES.ADMIN) return { allowed: false, reason: 'ROLE_CANNOT_MANAGE' };
      if (account.type !== 'CUSTOMER') return { allowed: false, reason: 'SYSTEM_ACCOUNT' };
      return { allowed: true };

    default:
      // Unknown action = deny. Never default to allow.
      return { allowed: false, reason: 'UNKNOWN_ACTION' };
  }
}

const uuidSchema = z.uuid();

// Loads the account and checks access. Throws 404/403 and records refusals.
// Returns the account so callers don't need to query it again.
async function assertAccountAccess(user, accountId, action, ctx = {}) {
  if (!uuidSchema.safeParse(accountId).success) {
    throw new AppError(400, 'Invalid account id', 'VALIDATION_ERROR');
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new AppError(404, 'Account not found', 'NOT_FOUND');
  }

  const decision = canAccessAccount(user, account, action);
  if (!decision.allowed) {
    await audit.recordSafe({
      actorId: user.id,
      action: `ACCOUNT_${action}`,
      outcome: 'REFUSED',
      entityType: 'Account',
      entityId: account.id,
      reason: decision.reason,
      ...ctx,
    });
    throw new AppError(403, 'You do not have access to this account', 'FORBIDDEN');
  }

  return account;
}

module.exports = { ACCOUNT_ACTIONS, canAccessAccount, assertAccountAccess };
