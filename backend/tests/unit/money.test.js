const assert = require('node:assert/strict');
const { formatPaise, toMoney } = require('../../src/utils/money');
const { generateAccountNumber } = require('../../src/utils/accountNumber');

test('formatPaise uses Indian grouping and 2 decimals', () => {
  assert.equal(formatPaise(0n), '₹0.00');
  assert.equal(formatPaise(5n), '₹0.05');
  assert.equal(formatPaise(500000n), '₹5,000.00');
  assert.equal(formatPaise(10000000n), '₹1,00,000.00');
  assert.equal(formatPaise(1234567899n), '₹1,23,45,678.99');
  assert.equal(formatPaise(-150n), '-₹1.50');
});

test('formatPaise is exact for values beyond Number precision', () => {
  // 2^63 - 1 paise: a Number would round this; BigInt must not.
  assert.equal(formatPaise(9223372036854775807n), '₹92,23,37,20,36,85,47,758.07');
  // Cross-check the grouping against the built-in Indian formatter.
  const rupees = new Intl.NumberFormat('en-IN').format(9223372036854775807n / 100n);
  assert.equal(formatPaise(9223372036854775807n), `₹${rupees}.07`);
});

test('toMoney returns paise as a string', () => {
  assert.deepEqual(toMoney(500000n), { paise: '500000', formatted: '₹5,000.00', currency: 'INR' });
});

test('generateAccountNumber format', () => {
  for (let i = 0; i < 100; i++) assert.match(generateAccountNumber(), /^LL\d{10}$/);
});
