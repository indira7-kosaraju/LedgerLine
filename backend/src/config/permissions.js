// Single source of truth for "which role may do what".
// Routes ask for a permission (e.g. 'audit:read'), never for a role directly,
// so changing who can do something only requires editing this file.
//
// ":own" permissions still need an ownership check on the specific record –
// that happens in services/accessControl.service.js.

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  ACCOUNT_HOLDER: 'ACCOUNT_HOLDER',
  AUDITOR: 'AUDITOR',
});

const { ADMIN, ACCOUNT_HOLDER, AUDITOR } = ROLES;

const PERMISSIONS = Object.freeze({
  // Accounts
  'accounts:create': [ACCOUNT_HOLDER],
  'accounts:read:own': [ACCOUNT_HOLDER],
  'accounts:read:any': [ADMIN, AUDITOR],
  'accounts:manage': [ADMIN], // freeze / unfreeze / close

  // Money movement – only account holders, only from their own accounts.
  // ADMIN and AUDITOR can never move money (separation of duties).
  'transactions:create': [ACCOUNT_HOLDER],
  'transactions:read:own': [ACCOUNT_HOLDER],
  'transactions:read:any': [ADMIN, AUDITOR],

  // Ledger and audit trail
  'ledger:read': [ADMIN, AUDITOR],
  'audit:read': [ADMIN, AUDITOR],

  // Onboarding (step 4): an account holder's own status and profile
  'onboarding:own': [ACCOUNT_HOLDER],

  // User administration
  'users:read': [ADMIN],
  'users:manage': [ADMIN],
});

function hasPermission(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unknown permission: ${permission}`); // catches typos in route code
  return allowed.includes(role);
}

module.exports = { ROLES, PERMISSIONS, hasPermission };
