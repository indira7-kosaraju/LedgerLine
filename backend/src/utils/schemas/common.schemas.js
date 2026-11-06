const { z } = require('zod');

const idParamSchema = z.strictObject({ id: z.uuid('Invalid id') });

// ?page=1&limit=20 – query strings are text, so coerce to numbers.
const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

module.exports = { idParamSchema, paginationSchema };
