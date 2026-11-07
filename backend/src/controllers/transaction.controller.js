const transactionService = require('../services/transaction.service');
const requestContext = require('../utils/requestContext');

// Sends a money-movement outcome. A replay (same Idempotency-Key as an earlier request)
// returns the ORIGINAL status and body, marked with the Idempotent-Replayed header.
function sendOutcome(res, { status, body, replayed }) {
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.status(status).json(body);
}

async function deposit(req, res) {
  sendOutcome(res, await transactionService.deposit(req.user, req.body, requestContext(req), req.idempotency));
}

async function withdraw(req, res) {
  sendOutcome(res, await transactionService.withdraw(req.user, req.body, requestContext(req), req.idempotency));
}

async function transfer(req, res) {
  sendOutcome(res, await transactionService.transfer(req.user, req.body, requestContext(req), req.idempotency));
}

async function list(req, res) {
  res.status(200).json(await transactionService.listTransactions(req.user, req.validatedQuery));
}

async function getById(req, res) {
  res.status(200).json(await transactionService.getTransaction(req.user, req.validatedParams.id, requestContext(req)));
}

module.exports = { deposit, withdraw, transfer, list, getById };
