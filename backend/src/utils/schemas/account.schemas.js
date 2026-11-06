const { z } = require('zod');
const { paginationSchema } = require('./common.schemas');

// Body is optional; only INR is supported. Unknown fields such as
// "balance" or "ownerId" are rejected, so clients can't set them.
const createAccountSchema = z.strictObject({
  currency: z.literal('INR').default('INR'),
});

const listAccountsQuerySchema = z.strictObject({
  ...paginationSchema,
  // Filters below are only honoured for ADMIN / AUDITOR (see account.service.js).
  ownerId: z.uuid().optional(),
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']).optional(),
  type: z.enum(['CUSTOMER', 'SYSTEM']).optional(),
});

const updateAccountStatusSchema = z.strictObject({
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']),
  reason: z.string().trim().min(3).max(200).optional(),
});

module.exports = { createAccountSchema, listAccountsQuerySchema, updateAccountStatusSchema };
