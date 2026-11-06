const { Router } = require('express');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { idParamSchema } = require('../utils/schemas/common.schemas');
const { listUsersQuerySchema, updateUserStatusSchema } = require('../utils/schemas/admin.schemas');
const adminController = require('../controllers/admin.controller');

const router = Router();

// Every route in this file requires a logged-in user.
router.use(authenticate);

router.get('/users', requirePermission('users:read'), validate(listUsersQuerySchema, 'query'), adminController.listUsers);

router.patch(
  '/users/:id/status',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  validate(updateUserStatusSchema),
  adminController.updateUserStatus
);

module.exports = router;
