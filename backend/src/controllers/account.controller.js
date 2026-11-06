const accountService = require('../services/account.service');
const requestContext = require('../utils/requestContext');

async function create(req, res) {
  const account = await accountService.createAccount(req.user, req.body, requestContext(req));
  res.status(201).json({ account });
}

async function list(req, res) {
  res.status(200).json(await accountService.listAccounts(req.user, req.validatedQuery));
}

// req.account was loaded and access-checked by requireAccountAccess.
async function getById(req, res) {
  res.status(200).json({ account: await accountService.getAccount(req.account) });
}

async function getBalance(req, res) {
  res.status(200).json(await accountService.getBalance(req.account.id));
}

async function updateStatus(req, res) {
  const account = await accountService.updateStatus(req.user, req.account.id, req.body, requestContext(req));
  res.status(200).json({ account });
}

module.exports = { create, list, getById, getBalance, updateStatus };
