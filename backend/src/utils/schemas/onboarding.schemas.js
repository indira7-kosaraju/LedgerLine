const { z } = require('zod');
const { TERMS_VERSION, MINIMUM_AGE, MAXIMUM_AGE, INDIAN_STATES, OCCUPATIONS } = require('../../config/onboarding');

// Whole years between a YYYY-MM-DD birth date and today (UTC).
function ageOn(birth, today = new Date()) {
  const [y, m, d] = birth.split('-').map(Number);
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) age -= 1;
  return age;
}

// A real calendar date (rejects 2001-02-30), written as YYYY-MM-DD.
const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateOfBirth = z
  .string()
  .refine(isCalendarDate, 'Enter a valid date (YYYY-MM-DD)')
  .refine((v) => !isCalendarDate(v) || ageOn(v) >= MINIMUM_AGE, `You must be at least ${MINIMUM_AGE} years old`)
  .refine((v) => !isCalendarDate(v) || ageOn(v) <= MAXIMUM_AGE, 'Enter a valid date of birth');

// Indian mobile number: 10 digits starting 6–9, optionally written with +91 / 0, spaces or hyphens.
// Stored as +91XXXXXXXXXX.
const phone = z
  .string()
  .max(20)
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|0091|0)(?=\d{10}$)/, ''))
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a 10-digit Indian mobile number (starting with 6, 7, 8 or 9)')
  .transform((v) => `+91${v}`);

const city = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(z.string().min(2, 'City must be at least 2 characters').max(60, 'City must be at most 60 characters'))
  .refine((v) => /^[A-Za-z][A-Za-z .'-]*$/.test(v), 'City may only contain letters, spaces, ".", "\'" and "-"');

// strictObject: nothing else is accepted – in particular not "onboardingStatus", so nobody can approve themselves.
const submitOnboardingSchema = z.strictObject({
  dateOfBirth,
  phone,
  city,
  state: z.enum(INDIAN_STATES, { error: 'Choose a state or union territory' }),
  pinCode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code'),
  occupation: z.enum(OCCUPATIONS, { error: 'Choose an occupation' }),
  acceptTerms: z.literal(true, { error: 'You must accept the terms to continue' }),
  // The version the user actually saw – if the terms changed meanwhile, they must read them again.
  termsVersion: z.literal(TERMS_VERSION, { error: 'The terms have changed. Please review and accept them again.' }),
});

module.exports = { submitOnboardingSchema, ageOn };
