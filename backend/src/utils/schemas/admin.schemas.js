const { z } = require('zod');
const { paginationSchema } = require('./common.schemas');

const listUsersQuerySchema = z.strictObject({
  ...paginationSchema,
  role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR']).optional(),
});

const updateUserStatusSchema = z.strictObject({
  isActive: z.boolean(),
});

const listAuditLogsQuerySchema = z.strictObject({
  ...paginationSchema,
  outcome: z.enum(['SUCCESS', 'REFUSED', 'ERROR']).optional(),
  action: z.string().trim().max(64).optional(),
  actorId: z.uuid().optional(),
  entityId: z.string().trim().max(64).optional(),
});

module.exports = { listUsersQuerySchema, updateUserStatusSchema, listAuditLogsQuerySchema };
