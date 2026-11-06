const env = require('../config/env');
const AppError = require('../utils/AppError');

// Central error handler. Express recognises it because it has 4 arguments.
// Rule: known errors get their own message; unknown errors get a generic
// message so we never leak stack traces, SQL, or secrets to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }

  // Body larger than the limit set in app.js
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }

  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  // Unexpected error: log full details on the server only.
  console.error('Unhandled error:', err);

  const body = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
  if (env.NODE_ENV === 'development') body.error.debug = err.message;
  return res.status(500).json(body);
}

module.exports = errorHandler;
