const AppError = require('../utils/AppError');

// Usage:
//   validate(schema)            → checks req.body, replaces it with the cleaned data
//   validate(schema, 'query')   → checks req.query,  result in req.validatedQuery
//   validate(schema, 'params')  → checks req.params, result in req.validatedParams
// (In Express 5, req.query can't be overwritten, so cleaned query/params go in new fields.)
const TARGETS = {
  body: 'body',
  query: 'validatedQuery',
  params: 'validatedParams',
};

function validate(schema, source = 'body') {
  if (!TARGETS[source]) throw new Error(`validate: unknown source "${source}"`);

  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || `(${source})`,
        message: issue.message,
      }));
      return next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details));
    }
    req[TARGETS[source]] = result.data;
    next();
  };
}

module.exports = validate;
