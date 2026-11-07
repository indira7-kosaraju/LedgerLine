import { api } from './client'
import { cleanParams } from './accounts.api'

// GET /api/transactions → { items, page, limit, total }
// Account holders get only their own; admins and auditors get all.
export async function listTransactions(params, { signal } = {}) {
  const { data } = await api.get('/transactions', { params: cleanParams(params), signal })
  return data
}
