const { z } = require('zod');
const { paginationSchema } = require('./common.schemas');
const { emailSchema, fullNameSchema } = require('./auth.schemas');

const listUsersQuerySchema = z.strictObject({
  ...paginationSchema,
  role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  onboarding: z.enum(['PENDING_PROFILE', 'APPROVED']).optional(),
  // Search by name or email
  q: z.string().trim().min(1).max(64).optional(),
});

// An optional note from the admin, stored in the audit log (never shown to the affected user).
const reason = z.string().trim().max(200, 'Reason must be at most 200 characters').optional()
  .transform((v) => (v ? v : undefined));

const updateUserStatusSchema = z.strictObject({
  isActive: z.boolean(),
  reason,
});

const revokeSessionsSchema = z.strictObject({ reason });

// The admin's own password – re-checked for every staff change (a stolen session alone is not enough).
const currentPassword = z.string().min(1, 'Enter your password to confirm').max(200);

// Only staff roles can be given here – an ACCOUNT_HOLDER is never created or produced by staff management.
const staffRole = z.enum(['ADMIN', 'AUDITOR'], { error: 'Role must be ADMIN or AUDITOR' });

const createStaffSchema = z.strictObject({
  email: emailSchema,
  fullName: fullNameSchema,
  role: staffRole,
  currentPassword,
});

const changeRoleSchema = z.strictObject({
  role: staffRole,
  currentPassword,
  reason,
});

const listStaffQuerySchema = z.strictObject({
  ...paginationSchema,
  role: staffRole.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  q: z.string().trim().min(1).max(64).optional(),
});

const listAuditLogsQuerySchema = z.strictObject({
  ...paginationSchema,
  outcome: z.enum(['SUCCESS', 'REFUSED', 'ERROR']).optional(),
  action: z.string().trim().max(64).optional(),
  // e.g. "TXN_" → all transaction actions. Uppercase letters and underscores only.
  actionPrefix: z.string().trim().regex(/^[A-Z_]{1,32}$/, 'actionPrefix must be uppercase letters and underscores').optional(),
  actorId: z.uuid().optional(),
  entityId: z.string().trim().max(64).optional(),
  entityType: z.enum(['User', 'Account', 'Transaction']).optional(),
  // Time window (ISO dates or date-times): from ≤ createdAt < to
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine((q) => !q.from || !q.to || q.from < q.to, { message: '"from" must be before "to"', path: ['to'] });

module.exports = {
  listUsersQuerySchema, updateUserStatusSchema, revokeSessionsSchema, createStaffSchema, changeRoleSchema, listStaffQuerySchema,
  listAuditLogsQuerySchema,
};
