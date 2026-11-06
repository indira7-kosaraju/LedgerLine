const AppError = require('../utils/AppError');
const requestContext = require('../utils/requestContext');
const audit = require('../services/audit.service');

// Usage:
//   validate(schema)            → checks req.body, replaces it with the cleaned data
//   validate(schema, 'query')   → checks req.query,  result in req.validatedQuery
//   validate(schema, 'params')  → checks req.params, result in req.validatedParams
//   validate(schema, 'body', { auditAction: 'TXN_DEPOSIT' })
//                               → also records rejected input as a REFUSED audit entry
// (In Express 5, req.query can't be overwritten, so cleaned query/params go in new fields.)
const TARGETS = {
  body: 'body',
  query: 'validatedQuery',
  params: 'validatedParams',
};

function validate(schema, source = 'body', { auditAction } = {}) {
  if (!TARGETS[source]) throw new Error(`validate: unknown source "${source}"`);

  return async (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || `(${source})`,
        message: issue.message,
      }));
      if (auditAction) {
        await audit.recordSafe({
          actorId: req.user?.id ?? null,
          action: auditAction,
          outcome: 'REFUSED',
          reason: 'VALIDATION_ERROR',
          metadata: { details },
          ...requestContext(req),
        });
      }
      return next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details));
    }
    req[TARGETS[source]] = result.data;
    next();
  };
}

module.exports = validate;
