const { Router } = require('express');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  depositSchema,
  withdrawSchema,
  transferSchema,
  listTransactionsQuerySchema,
} = require('../utils/schemas/transaction.schemas');
const transactionController = require('../controllers/transaction.controller');

const router = Router();

router.use(authenticate);

// Only ACCOUNT_HOLDER has 'transactions:create'. Ownership of the specific
// account is checked inside the service, on the locked database row.
const canMove = requirePermission('transactions:create');

router.post('/deposit', canMove, validate(depositSchema, 'body', { auditAction: 'TXN_DEPOSIT' }), transactionController.deposit);
router.post('/withdraw', canMove, validate(withdrawSchema, 'body', { auditAction: 'TXN_WITHDRAWAL' }), transactionController.withdraw);
router.post('/transfer', canMove, validate(transferSchema, 'body', { auditAction: 'TXN_TRANSFER' }), transactionController.transfer);

router.get(
  '/',
  requirePermission('transactions:read:own', 'transactions:read:any'),
  validate(listTransactionsQuerySchema, 'query'),
  transactionController.list
);

module.exports = router;
