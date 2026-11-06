const { Router } = require('express');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { listLedgerQuerySchema } = require('../utils/schemas/transaction.schemas');
const ledgerController = require('../controllers/ledger.controller');

const router = Router();

// ADMIN and AUDITOR only. Read-only: there are no write routes for the ledger.
router.use(authenticate, requirePermission('ledger:read'));

router.get('/entries', validate(listLedgerQuerySchema, 'query'), ledgerController.listEntries);
router.get('/verify', ledgerController.verify);

module.exports = router;
