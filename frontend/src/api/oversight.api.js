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
// Filters: role, status ('ACTIVE' | 'INACTIVE'), q (name or email)
export async function listUsers(params, { signal } = {}) {
  const { data } = await api.get('/admin/users', { params: cleanParams(params), signal })
  return data
}

// PATCH /api/admin/users/:id/status → { user }   (ADMIN only; an admin cannot change their own status)
export async function updateUserStatus(id, isActive) {
  const { data } = await api.patch(`/admin/users/${encodeURIComponent(id)}/status`, { isActive })
  return data.user
}
