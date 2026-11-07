// Run with: npm test   (Node's built-in test runner – the frontend is ES modules)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount } from '../../src/utils/money.js'

test('valid rupee amounts become whole paise (text-only, no floating point)', () => {
  const cases = {
    '500': '50000',
    '1250.50': '125050',
    '1,250.5': '125050',
    '0.07': '7',
    '0.1': '10',
    '0.3': '30', // 0.1 + 0.2 !== 0.3 in floating point – irrelevant here
    '007': '700',
    '  42 ': '4200',
    '99999999.99': '9999999999',
  }
  for (const [input, paise] of Object.entries(cases)) {
    assert.equal(parseAmount(input).paise, paise, `input ${JSON.stringify(input)}`)
  }
})

test('the confirmation display is formatted in Indian style', () => {
  assert.equal(parseAmount('1250.5').display, '₹1,250.50')
  assert.equal(parseAmount('100000').display, '₹1,00,000.00')
})

test('invalid amounts are rejected with a message', () => {
  for (const bad of ['', '0', '0.00', '-5', '1e5', '10.555', 'abc', '.5', '5.', '123456789', '1.2.3', null, undefined]) {
    const result = parseAmount(bad)
    assert.ok(result.error, `should reject ${JSON.stringify(bad)}`)
    assert.equal(result.paise, undefined)
  }
})
