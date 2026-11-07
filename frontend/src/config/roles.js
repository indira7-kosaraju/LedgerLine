// Mirror of backend/src/config/permissions.js – used ONLY to decide what the UI shows.
// It is not security: the backend checks every permission again on every request.

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  ACCOUNT_HOLDER: 'Account holder',
  AUDITOR: 'Auditor',
}

const PERMISSIONS = {
  'accounts:create': ['ACCOUNT_HOLDER'],
  'accounts:read:any': ['ADMIN', 'AUDITOR'],
  'accounts:manage': ['ADMIN'],
  'transactions:create': ['ACCOUNT_HOLDER'],
  'transactions:read:any': ['ADMIN', 'AUDITOR'],
  'ledger:read': ['ADMIN', 'AUDITOR'],
  'audit:read': ['ADMIN', 'AUDITOR'],
  'users:manage': ['ADMIN'],
}

export function can(role, permission) {
  return PERMISSIONS[permission]?.includes(role) ?? false
}
