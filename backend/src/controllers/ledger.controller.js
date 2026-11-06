const ledgerService = require('../services/ledger.service');

// req.account was loaded and access-checked by requireAccountAccess('VIEW').
async function statement(req, res) {
  res.status(200).json(await ledgerService.getStatement(req.account, req.validatedQuery));
}

async function listEntries(req, res) {
  res.status(200).json(await ledgerService.listEntries(req.validatedQuery));
}

async function verify(req, res) {
  const result = await ledgerService.verifyLedger();
  // 200 when the books balance; 500 signals a real integrity problem that needs attention.
  res.status(result.ok ? 200 : 500).json(result);
}

module.exports = { statement, listEntries, verify };
