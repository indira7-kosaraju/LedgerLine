// Small helper so every audit log records where a request came from.
function requestContext(req) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
  };
}

module.exports = requestContext;
