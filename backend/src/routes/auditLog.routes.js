const { Router } = require('express');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { listAuditLogsQuerySchema } = require('../utils/schemas/admin.schemas');
const auditLogController = require('../controllers/auditLog.controller');

const router = Router();

// GET /api/audit-logs?outcome=REFUSED – ADMIN and AUDITOR only. Read-only: no POST/PUT/DELETE exists.
router.get('/', authenticate, requirePermission('audit:read'), validate(listAuditLogsQuerySchema, 'query'), auditLogController.list);

module.exports = router;
