import { api } from './client'
import { cleanParams } from './params'

// Admin and auditor APIs. The backend returns 403 for any other role.

// GET /api/audit-logs → { items, page, limit, total }
export async function listAuditLogs(params, { signal } = {}) {
  const { data } = await api.get('/audit-logs', { params: cleanParams(params), signal })
  return data
}

// GET /api/ledger/entries → { items, page, limit, total }
export async function listLedgerEntries(params, { signal } = {}) {
  const { data } = await api.get('/ledger/entries', { params: cleanParams(params), signal })
  return data
}

// GET /api/ledger/verify → { ok, checks, counts, sumOfAllBalances, problems, checkedAt }
// The backend answers 500 when the books do NOT balance; that is a valid
// result to display, not a crash, so 500 is accepted here too.
export async function verifyLedger({ signal } = {}) {
  const { data } = await api.get('/ledger/verify', { signal, validateStatus: (s) => s === 200 || s === 500 })
  if (typeof data?.ok !== 'boolean') throw new Error('Unexpected response from ledger verification')
  return data
}

// GET /api/admin/users → { items, page, limit, total }   (ADMIN only)
// Filters: role, status ('ACTIVE' | 'INACTIVE'), onboarding ('PENDING_PROFILE' | 'APPROVED'), q (name or email)
export async function listUsers(params, { signal } = {}) {
  const { data } = await api.get('/admin/users', { params: cleanParams(params), signal })
  return data
}

// PATCH /api/admin/users/:id/status → { user }   (ADMIN only; an admin cannot change their own status)
// `reason` (optional) is stored in the audit log.
export async function updateUserStatus(id, isActive, reason) {
  const { data } = await api.patch(`/admin/users/${encodeURIComponent(id)}/status`, { isActive, ...(reason ? { reason } : {}) })
  return data.user
}

// GET /api/audit-logs/verify → { ok, records, head: { chainSeq, hash, createdAt }, problems, checkedAt }   (step 6)
// Like the ledger check: 500 means "the chain is broken" – a valid result to display.
export async function verifyAuditTrail({ signal } = {}) {
  const { data } = await api.get('/audit-logs/verify', { signal, validateStatus: (s) => s === 200 || s === 500 })
  if (typeof data?.ok !== 'boolean') throw new Error('Unexpected response from audit trail verification')
  return data
}
