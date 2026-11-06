const AppError = require('../utils/AppError');

// Usage: router.post('/x', validate(someZodSchema), controller)
// Replaces req.body with the cleaned, validated data (trimmed, lowercased, etc.).
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      }));
      return next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details));
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
