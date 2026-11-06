const AppError = require('../utils/AppError');

// Runs when no route matched the request.
function notFound(req, res, next) {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND'));
}

module.exports = notFound;
