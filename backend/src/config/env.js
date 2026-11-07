// Loads .env and validates every variable at startup.
// If something is missing or invalid, the server refuses to start
// instead of failing later in a confusing way.
require('dotenv').config({ quiet: true });
const { z } = require('zod');

const envSchema = z.object({
  // Secure default: if NODE_ENV is not set, behave like production (no debug details in errors).
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of exact origins, e.g. "http://localhost:5173,https://app.example.com".
  // "*" is rejected: with cookies (credentials) it would let ANY website use a signed-in session.
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((o) => o.trim()).filter(Boolean))
    .refine((origins) => origins.length > 0, 'CORS_ORIGIN must list at least one origin')
    .refine(
      (origins) => origins.every((o) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(o)),
      'CORS_ORIGIN entries must be exact origins like http://localhost:5173 (no "*", no path, no trailing slash)'
    ),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// connection string'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('1h'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(100000).default(600),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print only variable names and problems – never the values (they may be secrets).
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

module.exports = Object.freeze(parsed.data);
