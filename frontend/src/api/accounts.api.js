import { api } from './client'
import { cleanParams } from './params'

// GET /api/accounts → { items, page, limit, total, summary: { totalBalance } }
export async function listAccounts(params, { signal } = {}) {
  const { data } = await api.get('/accounts', { params: cleanParams(params), signal })
  return data
}

export async function getAccount(id, { signal } = {}) {
  const { data } = await api.get(`/accounts/${encodeURIComponent(id)}`, { signal })
  return data.account
}

// GET /api/accounts/:id/balance → { accountId, accountNumber, status, balance, asOf }
export async function getBalance(id, { signal } = {}) {
  const { data } = await api.get(`/accounts/${encodeURIComponent(id)}/balance`, { signal })
  return data
}

// GET /api/accounts/:id/statement → { account, summary, entries, page, limit, total }
export async function getStatement(id, params, { signal } = {}) {
  const { data } = await api.get(`/accounts/${encodeURIComponent(id)}/statement`, { params: cleanParams(params), signal })
  return data
}

export async function createAccount() {
  const { data } = await api.post('/accounts', {})
  return data.account
}

// ADMIN only: { status: 'FROZEN' | 'ACTIVE' | 'CLOSED', reason? }
export async function updateAccountStatus(id, body) {
  const { data } = await api.patch(`/accounts/${encodeURIComponent(id)}/status`, body)
  return data.account
}
