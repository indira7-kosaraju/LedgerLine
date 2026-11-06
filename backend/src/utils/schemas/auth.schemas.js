const { z } = require('zod');

// bcrypt only uses the first 72 BYTES of a password, so longer passwords
// would be silently truncated. We reject them instead.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), {
    message: 'Password must contain an uppercase letter, a lowercase letter and a number',
  });

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email address').max(254));

// strictObject = unknown fields (like "role": "ADMIN") are REJECTED,
// so a user can never choose their own role at registration.
const registerSchema = z.strictObject({
  email,
  password,
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
});

const loginSchema = z.strictObject({
  email,
  // Don't apply the strength rules on login – just require something reasonable.
  password: z.string().min(1, 'Password is required').max(200),
});

module.exports = { registerSchema, loginSchema };
