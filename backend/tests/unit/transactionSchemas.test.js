const assert = require('node:assert/strict');
const { depositSchema, transferSchema } = require('../../src/utils/schemas/transaction.schemas');

const accountId = '3dcf9ad1-466c-4841-b737-0a7da98edd11';
const otherId = '039ce447-f752-4ab7-bafb-399dd182e0e6';

test('amountPaise accepts whole numbers and digit strings, converts to BigInt', () => {
  assert.equal(depositSchema.parse({ accountId, amountPaise: 500000 }).amountPaise, 500000n);
  assert.equal(depositSchema.parse({ accountId, amountPaise: '500000' }).amountPaise, 500000n);
  assert.equal(typeof depositSchema.parse({ accountId, amountPaise: 1 }).amountPaise, 'bigint');
});

test('amountPaise rejects zero, negatives, decimals and non-numbers', () => {
  for (const bad of [0, -1, '0', '-5', 100.5, '100.5', '1e5', 'abc', '', true, null, [], {}, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(depositSchema.safeParse({ accountId, amountPaise: bad }).success, false, `should reject ${JSON.stringify(bad)}`);
  }
});

test('deposit rejects unknown fields', () => {
  assert.equal(depositSchema.safeParse({ accountId, amountPaise: 100, balance: 1 }).success, false);
});

test('transfer needs exactly one destination', () => {
  assert.equal(transferSchema.safeParse({ fromAccountId: accountId, amountPaise: 100 }).success, false);
  assert.equal(
    transferSchema.safeParse({ fromAccountId: accountId, toAccountId: otherId, toAccountNumber: 'LL1234567890', amountPaise: 100 }).success,
    false
  );
  assert.equal(transferSchema.safeParse({ fromAccountId: accountId, toAccountId: otherId, amountPaise: 100 }).success, true);
  assert.equal(transferSchema.safeParse({ fromAccountId: accountId, toAccountNumber: 'LL1234567890', amountPaise: 100 }).success, true);
});
