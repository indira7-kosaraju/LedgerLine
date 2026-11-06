const userService = require('../services/user.service');
const requestContext = require('../utils/requestContext');

async function listUsers(req, res) {
  res.status(200).json(await userService.listUsers(req.validatedQuery));
}

async function updateUserStatus(req, res) {
  const user = await userService.setUserActive(req.user, req.validatedParams.id, req.body.isActive, requestContext(req));
  res.status(200).json({ user });
}

module.exports = { listUsers, updateUserStatus };
