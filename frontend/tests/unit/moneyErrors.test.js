import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeMoneyError, moneyFieldErrors } from '../../src/utils/moneyErrors.js'
import { newIdempotencyKey } from '../../src/utils/idempotencyKey.js'

test('no answer from the server (network / 5xx) is "uncertain" – safe to retry with the same key', () => {
  for (const status of [0, 500, 502, 503]) {
    const result = describeMoneyError({ status, code: 'X', message: 'm' })
    assert.equal(result.uncertain, true, `status ${status}`)
    assert.match(result.message, /will not move the money twice/)
  }
})

test('business refusals keep the backend message and get a clear title', () => {
  const result = describeMoneyError({ status: 422, code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds: available ₹5.00' })
  assert.deepEqual(result, { title: 'Not enough balance', message: 'Insufficient funds: available ₹5.00', uncertain: false })
  assert.equal(describeMoneyError({ status: 422, code: 'SOMETHING_NEW', message: 'x' }).title, 'Transaction refused')
})

test('backend field names map to the form fields', () => {
  const error = { details: [{ field: 'amountPaise', message: 'too small' }, { field: 'toAccountNumber', message: 'bad' }, { field: 'unknown', message: 'ignored' }] }
  assert.deepEqual(moneyFieldErrors(error), { amount: 'too small', destination: 'bad' })
})

test('idempotency keys are UUID v4 – also without crypto.randomUUID (plain-http fallback)', () => {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  const withoutRandomUUID = { getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr) }
  const keys = new Set()
  for (let i = 0; i < 500; i++) {
    const key = newIdempotencyKey(withoutRandomUUID)
    assert.match(key, uuidV4)
    keys.add(key)
  }
  assert.equal(keys.size, 500) // no repeats
  assert.match(newIdempotencyKey(), uuidV4)
})
