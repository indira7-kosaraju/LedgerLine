// Client-side checks give instant feedback while typing.
// They are a convenience only – the backend validates everything again.
// These rules mirror backend/src/utils/schemas/auth.schemas.js.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One number', test: (p) => /\d/.test(p) },
]

// bcrypt only uses the first 72 bytes of a password (not characters – emoji use 4 bytes).
const byteLength = (s) => new TextEncoder().encode(s).length

export function validateLogin({ email, password }) {
  const errors = {}
  if (!email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address'
  if (!password) errors.password = 'Password is required'
  return errors
}

export function validateRegister({ fullName, email, password, confirmPassword }) {
  const errors = {}
  if (fullName.trim().length < 2) errors.fullName = 'Full name must be at least 2 characters'
  else if (fullName.trim().length > 100) errors.fullName = 'Full name must be at most 100 characters'

  if (!email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address'

  const failed = PASSWORD_RULES.filter((rule) => !rule.test(password))
  if (!password) errors.password = 'Password is required'
  else if (failed.length) errors.password = `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}`
  else if (byteLength(password) > 72) errors.password = 'Password is too long (maximum 72 bytes)'

  if (!confirmPassword) errors.confirmPassword = 'Please confirm your password'
  else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match'

  return errors
}

// Turns the backend's { details: [{ field, message }] } into { field: message }.
export function fieldErrorsFromApi(error) {
  const result = {}
  for (const { field, message } of error?.details ?? []) {
    if (!result[field]) result[field] = message
  }
  return result
}
