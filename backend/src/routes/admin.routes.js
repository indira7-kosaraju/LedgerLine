const { Router } = require('express');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { loginIpLimiter, changePasswordAccountLimiter } = require('../middleware/rateLimiters');
const { idParamSchema } = require('../utils/schemas/common.schemas');
const {
  listUsersQuerySchema, updateUserStatusSchema, revokeSessionsSchema, createStaffSchema, changeRoleSchema, listStaffQuerySchema,
} = require('../utils/schemas/admin.schemas');
const adminController = require('../controllers/admin.controller');

const router = Router();

// Every route in this file requires a logged-in user; each one also requires an ADMIN permission.
router.use(authenticate);

router.get('/overview', requirePermission('admin:overview'), adminController.overview);

// Users
router.get('/users', requirePermission('users:read'), validate(listUsersQuerySchema, 'query'), adminController.listUsers);
router.get('/users/:id', requirePermission('users:read'), validate(idParamSchema, 'params'), adminController.getUser);
router.patch(
  '/users/:id/status',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  validate(updateUserStatusSchema),
  adminController.updateUserStatus
);
router.post(
  '/users/:id/revoke-sessions',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  validate(revokeSessionsSchema),
  adminController.revokeSessions
);

// Staff (step 5). The admin's own password is checked on every change; wrong passwords count toward the
// failed-login limits per IP and per account, like a login (password guessing through a stolen session).
const confirmLimits = [loginIpLimiter, changePasswordAccountLimiter];
router.get('/staff', requirePermission('staff:manage'), validate(listStaffQuerySchema, 'query'), adminController.listStaff);
router.post('/staff', requirePermission('staff:manage'), ...confirmLimits, validate(createStaffSchema, 'body', { auditAction: 'STAFF_CREATE' }), adminController.createStaff);
router.patch(
  '/staff/:id/role',
  requirePermission('staff:manage'),
  ...confirmLimits,
  validate(idParamSchema, 'params'),
  validate(changeRoleSchema, 'body', { auditAction: 'USER_CHANGE_ROLE' }),
  adminController.changeRole
);

module.exports = router;
