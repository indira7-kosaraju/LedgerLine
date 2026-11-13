const { z } = require('zod');
const COMMON_PASSWORDS = require('../../config/commonPasswords');

// bcrypt only uses the first 72 BYTES of a password, so longer passwords
// would be silently truncated. We reject them instead.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), {
    message: 'Password must contain an uppercase letter, a lowercase letter and a number',
  })
  // Step 6: the most guessed passwords are refused even though they meet the character rules.
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), { message: 'This password is too common – choose a less predictable one' });

// Step 6: a password must not contain the name part of the email address ("asha.rao@…" → "asha.rao", "asha", "rao").
function passwordContainsEmail(password, email) {
  const local = String(email ?? '').split('@')[0].toLowerCase();
  const parts = [local, ...local.split(/[._+-]/)].filter((p) => p.length >= 4);
  const lower = password.toLowerCase();
  return parts.some((p) => lower.includes(p));
}

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email address').max(254));
const fullName = z.string().trim().min(2, 'Full name must be at least 2 characters').max(100);

// strictObject = unknown fields (like "role": "ADMIN") are REJECTED,
// so a user can never choose their own role at registration.
const registerSchema = z
  .strictObject({ email, password, fullName })
  .refine((d) => !passwordContainsEmail(d.password, d.email), {
    message: 'Password must not contain your email address',
    path: ['password'],
  });

const loginSchema = z.strictObject({
  email,
  // Don't apply the strength rules on login – just require something reasonable.
  password: z.string().min(1, 'Password is required').max(200),
});

// The current password is only compared, so – like login – no strength rules apply to it.
const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: password,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

module.exports = { registerSchema, loginSchema, changePasswordSchema, emailSchema: email, fullNameSchema: fullName, passwordContainsEmail };
