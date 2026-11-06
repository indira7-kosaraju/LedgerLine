const { assertAccountAccess } = require('../services/accessControl.service');
const requestContext = require('../utils/requestContext');

// Usage: router.get('/:id', authenticate, requireAccountAccess('VIEW'), controller)
// Checks the account in req.params[paramName] and stores it on req.account.
function requireAccountAccess(action, paramName = 'id') {
  return async (req, res, next) => {
    req.account = await assertAccountAccess(req.user, req.params[paramName], action, requestContext(req));
    next();
  };
}

module.exports = { requireAccountAccess };
