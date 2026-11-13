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

export function validateChangePassword({ currentPassword, newPassword, confirmPassword }) {
  const errors = {}
  if (!currentPassword) errors.currentPassword = 'Current password is required'

  const failed = PASSWORD_RULES.filter((rule) => !rule.test(newPassword))
  if (!newPassword) errors.newPassword = 'New password is required'
  else if (failed.length) errors.newPassword = `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}`
  else if (byteLength(newPassword) > 72) errors.newPassword = 'Password is too long (maximum 72 bytes)'
  else if (newPassword === currentPassword) errors.newPassword = 'New password must be different from the current password'

  if (!confirmPassword) errors.confirmPassword = 'Please confirm your new password'
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'Passwords do not match'

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

// Onboarding (step 4). Mirrors backend/src/utils/schemas/onboarding.schemas.js; the lists of states and
// occupations and the minimum age come from GET /api/onboarding (`requirements`).
export function ageOn(dateOfBirth, today = new Date()) {
  const [y, m, d] = dateOfBirth.split('-').map(Number)
  let age = today.getUTCFullYear() - y
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) age -= 1
  return age
}

const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const normalisePhone = (phone) => phone.replace(/[\s-]/g, '').replace(/^(\+91|0091|0)(?=\d{10}$)/, '')

export function validateOnboardingDetails(values, requirements) {
  const errors = {}
  if (!values.dateOfBirth) errors.dateOfBirth = 'Date of birth is required'
  else if (!isCalendarDate(values.dateOfBirth)) errors.dateOfBirth = 'Enter a valid date'
  else if (ageOn(values.dateOfBirth) < requirements.minimumAge) errors.dateOfBirth = `You must be at least ${requirements.minimumAge} years old`
  else if (ageOn(values.dateOfBirth) > 120) errors.dateOfBirth = 'Enter a valid date of birth'

  if (!values.phone.trim()) errors.phone = 'Mobile number is required'
  else if (!/^[6-9]\d{9}$/.test(normalisePhone(values.phone))) errors.phone = 'Enter a 10-digit Indian mobile number (starting with 6, 7, 8 or 9)'

  const city = values.city.trim().replace(/\s+/g, ' ')
  if (city.length < 2) errors.city = 'City must be at least 2 characters'
  else if (city.length > 60) errors.city = 'City must be at most 60 characters'
  else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(city)) errors.city = 'City may only contain letters, spaces, ".", "\'" and "-"'

  if (!requirements.states.includes(values.state)) errors.state = 'Choose a state or union territory'
  if (!/^[1-9]\d{5}$/.test(values.pinCode.trim())) errors.pinCode = 'Enter a 6-digit PIN code'
  if (!requirements.occupations.includes(values.occupation)) errors.occupation = 'Choose an occupation'
  return errors
}

// Staff management (step 5). Mirrors backend/src/utils/schemas/admin.schemas.js (createStaffSchema).
export function validateStaff({ fullName, email, role, currentPassword }) {
  const errors = {}
  if (fullName.trim().length < 2) errors.fullName = 'Full name must be at least 2 characters'
  else if (fullName.trim().length > 100) errors.fullName = 'Full name must be at most 100 characters'
  if (!email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address'
  if (!['ADMIN', 'AUDITOR'].includes(role)) errors.role = 'Choose a staff role'
  if (!currentPassword) errors.currentPassword = 'Enter your password to confirm'
  return errors
}
