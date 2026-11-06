// Unit tests for the account ownership rules (no database needed).
// Run with: npm test
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canAccessAccount, ACCOUNT_ACTIONS } = require('../src/services/accessControl.service');

const { VIEW, MOVE_MONEY, MANAGE } = ACCOUNT_ACTIONS;

const owner = { id: 'user-1', role: 'ACCOUNT_HOLDER' };
const otherHolder = { id: 'user-2', role: 'ACCOUNT_HOLDER' };
const admin = { id: 'admin-1', role: 'ADMIN' };
const auditor = { id: 'auditor-1', role: 'AUDITOR' };

const ownersAccount = { id: 'acc-1', type: 'CUSTOMER', ownerId: 'user-1' };
const systemAccount = { id: 'sys', type: 'SYSTEM', ownerId: null };

const cases = [
  // [description, user, account, action, expectedAllowed, expectedReason]
  ['owner can view own account', owner, ownersAccount, VIEW, true],
  ['other holder cannot view', otherHolder, ownersAccount, VIEW, false, 'NOT_OWNER'],
  ['admin can view any account', admin, ownersAccount, VIEW, true],
  ['auditor can view any account', auditor, ownersAccount, VIEW, true],
  ['holder cannot view SYSTEM account', owner, systemAccount, VIEW, false, 'NOT_OWNER'],

  ['owner can move money', owner, ownersAccount, MOVE_MONEY, true],
  ['other holder cannot move money', otherHolder, ownersAccount, MOVE_MONEY, false, 'NOT_OWNER'],
  ['admin cannot move money', admin, ownersAccount, MOVE_MONEY, false, 'ROLE_CANNOT_MOVE_MONEY'],
  ['auditor cannot move money', auditor, ownersAccount, MOVE_MONEY, false, 'ROLE_CANNOT_MOVE_MONEY'],
  ['nobody moves money out of SYSTEM', owner, systemAccount, MOVE_MONEY, false, 'SYSTEM_ACCOUNT'],

  ['admin can manage customer account', admin, ownersAccount, MANAGE, true],
  ['admin cannot manage SYSTEM account', admin, systemAccount, MANAGE, false, 'SYSTEM_ACCOUNT'],
  ['owner cannot manage', owner, ownersAccount, MANAGE, false, 'ROLE_CANNOT_MANAGE'],
  ['auditor cannot manage', auditor, ownersAccount, MANAGE, false, 'ROLE_CANNOT_MANAGE'],

  ['unknown action is denied', admin, ownersAccount, 'DELETE_EVERYTHING', false, 'UNKNOWN_ACTION'],
];

for (const [name, user, account, action, allowed, reason] of cases) {
  test(name, () => {
    const result = canAccessAccount(user, account, action);
    assert.equal(result.allowed, allowed);
    if (!allowed) assert.equal(result.reason, reason);
  });
}

// An account with ownerId undefined must not match a user with id undefined.
test('missing ids never count as ownership', () => {
  const result = canAccessAccount({ id: undefined, role: 'ACCOUNT_HOLDER' }, { type: 'CUSTOMER', ownerId: undefined }, VIEW);
  assert.equal(result.allowed, false);
});
