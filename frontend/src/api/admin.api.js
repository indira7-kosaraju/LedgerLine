import { api } from './client'
import { cleanParams } from './params'

// ADMIN-only APIs (step 5). The backend returns 403 for every other role.

// GET /api/admin/overview → { users, accounts, customerFunds, transactions, refusedLast24h, recentSignups, recentAdminActions }
export async function getOverview({ signal } = {}) {
  const { data } = await api.get('/admin/overview', { signal })
  return data
}

// GET /api/admin/users/:id → { user, profile (masked), accounts, activity }
export async function getUserDetails(id, { signal } = {}) {
  const { data } = await api.get(`/admin/users/${encodeURIComponent(id)}`, { signal })
  return data
}

// POST /api/admin/users/:id/revoke-sessions → { user }
export async function revokeSessions(id, reason) {
  const { data } = await api.post(`/admin/users/${encodeURIComponent(id)}/revoke-sessions`, reason ? { reason } : {})
  return data.user
}

// GET /api/admin/staff → { items, page, limit, total }   (ADMIN and AUDITOR users)
export async function listStaff(params, { signal } = {}) {
  const { data } = await api.get('/admin/staff', { params: cleanParams(params), signal })
  return data
}

// POST /api/admin/staff → { user, temporaryPassword }  – the temporary password is shown ONCE.
export async function createStaff({ email, fullName, role, currentPassword }) {
  const { data } = await api.post('/admin/staff', { email, fullName, role, currentPassword })
  return data
}

// PATCH /api/admin/staff/:id/role → { user }   (ADMIN ↔ AUDITOR only; needs the admin's own password)
export async function changeStaffRole(id, { role, currentPassword, reason }) {
  const { data } = await api.patch(`/admin/staff/${encodeURIComponent(id)}/role`, { role, currentPassword, ...(reason ? { reason } : {}) })
  return data.user
}
