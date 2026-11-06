const auditLogService = require('../services/auditLog.service');

async function list(req, res) {
  res.status(200).json(await auditLogService.listAuditLogs(req.validatedQuery));
}

module.exports = { list };
