import { api } from './client'
import { cleanParams } from './accounts.api'

// GET /api/transactions → { items, page, limit, total }
// Account holders get only their own; admins and auditors get all.
export async function listTransactions(params, { signal } = {}) {
  const { data } = await api.get('/transactions', { params: cleanParams(params), signal })
  return data
}

// GET /api/transactions/:id → { transaction, ledgerEntries, entriesHidden }
export async function getTransaction(id, { signal } = {}) {
  const { data } = await api.get(`/transactions/${encodeURIComponent(id)}`, { signal })
  return data
}

// Money movement. `amountPaise` is a STRING of whole paise ("125050" = ₹1,250.50).
// The backend validates and executes everything; these calls only send the request.
// Each returns { transaction, account } – `account` is the caller's account with its new balance.

export async function deposit({ accountId, amountPaise, description }) {
  const { data } = await api.post('/transactions/deposit', { accountId, amountPaise, description })
  return data
}

export async function withdraw({ accountId, amountPaise, description }) {
  const { data } = await api.post('/transactions/withdraw', { accountId, amountPaise, description })
  return data
}

// Destination: exactly one of toAccountId (own account) or toAccountNumber (anyone's).
export async function transfer({ fromAccountId, toAccountId, toAccountNumber, amountPaise, description }) {
  const { data } = await api.post('/transactions/transfer', { fromAccountId, toAccountId, toAccountNumber, amountPaise, description })
  return data
}
