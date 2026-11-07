import { api } from './client'
import { cleanParams } from './params'

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

// Every money movement needs an Idempotency-Key (the backend refuses requests without one).
// Use ONE key per operation: send the same key again only to retry that same operation.
// Each returns { transaction, account, replayed } – replayed: true means the server had
// already processed this operation and returned the ORIGINAL result (nothing moved twice).
async function moveMoney(path, body, idempotencyKey) {
  const response = await api.post(path, body, { headers: { 'Idempotency-Key': idempotencyKey } })
  return { ...response.data, replayed: response.headers['idempotent-replayed'] === 'true' }
}

// `amountPaise` is a STRING of whole paise ("125050" = ₹1,250.50).
export const deposit = ({ accountId, amountPaise, description }, idempotencyKey) =>
  moveMoney('/transactions/deposit', { accountId, amountPaise, description }, idempotencyKey)

export const withdraw = ({ accountId, amountPaise, description }, idempotencyKey) =>
  moveMoney('/transactions/withdraw', { accountId, amountPaise, description }, idempotencyKey)

// Destination: exactly one of toAccountId (own account) or toAccountNumber (anyone's).
export const transfer = ({ fromAccountId, toAccountId, toAccountNumber, amountPaise, description }, idempotencyKey) =>
  moveMoney('/transactions/transfer', { fromAccountId, toAccountId, toAccountNumber, amountPaise, description }, idempotencyKey)
