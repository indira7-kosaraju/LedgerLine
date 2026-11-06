const transactionService = require('../services/transaction.service');
const requestContext = require('../utils/requestContext');

async function deposit(req, res) {
  res.status(201).json(await transactionService.deposit(req.user, req.body, requestContext(req)));
}

async function withdraw(req, res) {
  res.status(201).json(await transactionService.withdraw(req.user, req.body, requestContext(req)));
}

async function transfer(req, res) {
  res.status(201).json(await transactionService.transfer(req.user, req.body, requestContext(req)));
}

async function list(req, res) {
  res.status(200).json(await transactionService.listTransactions(req.user, req.validatedQuery));
}

module.exports = { deposit, withdraw, transfer, list };
