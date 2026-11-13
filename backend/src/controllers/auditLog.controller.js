const auditLogService = require('../services/auditLog.service');

async function list(req, res) {
  res.status(200).json(await auditLogService.listAuditLogs(req.validatedQuery));
}

async function verify(req, res) {
  const result = await auditLogService.verifyAuditChain();
  // 500 when the chain is broken – like /api/ledger/verify: a broken audit trail is a server-side integrity failure.
  res.status(result.ok ? 200 : 500).json(result);
}

module.exports = { list, verify };
