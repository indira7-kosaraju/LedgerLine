const { Router } = require('express');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { requireAccountAccess } = require('../middleware/accountAccess');
const validate = require('../middleware/validate');
const { createAccountSchema, listAccountsQuerySchema, updateAccountStatusSchema } = require('../utils/schemas/account.schemas');
const { statementQuerySchema } = require('../utils/schemas/transaction.schemas');
const accountController = require('../controllers/account.controller');
const ledgerController = require('../controllers/ledger.controller');

const router = Router();

router.use(authenticate);

// Two checks on routes with :id:
//   1. requirePermission  – is this ROLE allowed this kind of action at all?
//   2. requireAccountAccess – is this USER allowed on THIS account (ownership)?

router.post('/', requirePermission('accounts:create'), validate(createAccountSchema), accountController.create);

router.get(
  '/',
  requirePermission('accounts:read:own', 'accounts:read:any'),
  validate(listAccountsQuerySchema, 'query'),
  accountController.list
);

router.get(
  '/:id',
  requirePermission('accounts:read:own', 'accounts:read:any'),
  requireAccountAccess('VIEW'),
  accountController.getById
);

router.get(
  '/:id/balance',
  requirePermission('accounts:read:own', 'accounts:read:any'),
  requireAccountAccess('VIEW'),
  accountController.getBalance
);

router.get(
  '/:id/statement',
  requirePermission('accounts:read:own', 'accounts:read:any'),
  requireAccountAccess('VIEW'),
  validate(statementQuerySchema, 'query'),
  ledgerController.statement
);

router.patch(
  '/:id/status',
  requirePermission('accounts:manage'),
  requireAccountAccess('MANAGE'),
  validate(updateAccountStatusSchema),
  accountController.updateStatus
);

module.exports = router;
