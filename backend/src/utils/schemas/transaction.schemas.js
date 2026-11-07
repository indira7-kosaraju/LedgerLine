const { z } = require('zod');
const { paginationSchema } = require('./common.schemas');

// Amounts are whole paise: 500000 = ₹5,000.00.
// Accepted: a JSON integer (500000) or a string of digits ("500000").
// Rejected: decimals (100.5), negatives, "1e5", booleans, etc.
// The value is converted to BigInt here, so no floating-point math ever touches money.
const amountPaise = z
  .union([z.int(), z.string().regex(/^\d{1,18}$/)], {
    error: 'amountPaise must be a whole number of paise, e.g. 500000 for ₹5,000',
  })
  .transform((v) => BigInt(v))
  .refine((v) => v > 0n, 'amountPaise must be greater than 0');

const description = z.string().trim().min(1).max(140).optional();

const depositSchema = z.strictObject({
  accountId: z.uuid('Invalid accountId'),
  amountPaise,
  description,
});

const withdrawSchema = depositSchema;

// Destination can be given by id or by account number (exactly one).
const transferSchema = z
  .strictObject({
    fromAccountId: z.uuid('Invalid fromAccountId'),
    toAccountId: z.uuid('Invalid toAccountId').optional(),
    toAccountNumber: z.string().trim().regex(/^LL\d{10}$/, 'Invalid toAccountNumber').optional(),
    amountPaise,
    description,
  })
  .refine((b) => Boolean(b.toAccountId) !== Boolean(b.toAccountNumber), {
    message: 'Provide exactly one of toAccountId or toAccountNumber',
    path: ['toAccountId'],
  });

const listTransactionsQuerySchema = z.strictObject({
  ...paginationSchema,
  accountId: z.uuid().optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER']).optional(),
  // Search by transaction reference, e.g. "TXN-20261107-9F3A"
  q: z.string().trim().min(1).max(40).optional(),
});

const statementQuerySchema = z.strictObject({
  ...paginationSchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const listLedgerQuerySchema = z.strictObject({
  ...paginationSchema,
  accountId: z.uuid().optional(),
  transactionId: z.uuid().optional(),
});

module.exports = {
  depositSchema,
  withdrawSchema,
  transferSchema,
  listTransactionsQuerySchema,
  statementQuerySchema,
  listLedgerQuerySchema,
};
