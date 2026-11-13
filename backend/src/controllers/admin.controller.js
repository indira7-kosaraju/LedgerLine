const userService = require('../services/user.service');
const staffService = require('../services/staff.service');
const overviewService = require('../services/adminOverview.service');
const requestContext = require('../utils/requestContext');

async function overview(req, res) {
  res.status(200).json(await overviewService.getOverview());
}

async function listUsers(req, res) {
  res.status(200).json(await userService.listUsers(req.validatedQuery));
}

async function getUser(req, res) {
  res.status(200).json(await userService.getUserDetails(req.user, req.validatedParams.id, requestContext(req)));
}

async function updateUserStatus(req, res) {
  const user = await userService.setUserActive(req.user, req.validatedParams.id, req.body.isActive, req.body.reason, requestContext(req));
  res.status(200).json({ user });
}

async function revokeSessions(req, res) {
  const user = await userService.revokeSessions(req.user, req.validatedParams.id, req.body.reason, requestContext(req));
  res.status(200).json({ user });
}

async function listStaff(req, res) {
  res.status(200).json(await staffService.listStaff(req.validatedQuery));
}

// The temporary password is in this one response only – never stored in plain text, never logged.
async function createStaff(req, res) {
  const result = await staffService.createStaff(req.user, req.body, requestContext(req));
  res.set('Cache-Control', 'no-store');
  res.status(201).json(result);
}

async function changeRole(req, res) {
  const user = await staffService.changeRole(req.user, req.validatedParams.id, req.body, requestContext(req));
  res.status(200).json({ user });
}

module.exports = { overview, listUsers, getUser, updateUserStatus, revokeSessions, listStaff, createStaff, changeRole };
