import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORD_RULES, fieldErrorsFromApi, normalisePhone, validateChangePassword, validateLogin, validateOnboardingDetails, validateRegister } from '../../src/utils/validation.js'

const valid = { fullName: 'Asha Rao', email: 'asha@example.com', password: 'Secret123', confirmPassword: 'Secret123' }

test('a valid registration has no errors', () => {
  assert.deepEqual(validateRegister(valid), {})
})

test('registration errors match the backend rules', () => {
  assert.ok(validateRegister({ ...valid, fullName: 'A' }).fullName)
  assert.ok(validateRegister({ ...valid, email: 'not-an-email' }).email)
  assert.ok(validateRegister({ ...valid, password: 'secret123', confirmPassword: 'secret123' }).password) // no uppercase
  assert.ok(validateRegister({ ...valid, password: `Aa1${'é'.repeat(40)}`, confirmPassword: `Aa1${'é'.repeat(40)}` }).password) // > 72 bytes
  assert.equal(validateRegister({ ...valid, confirmPassword: 'Different1' }).confirmPassword, 'Passwords do not match')
})

test('password checklist rules', () => {
  const met = (p) => PASSWORD_RULES.filter((r) => r.test(p)).map((r) => r.id)
  assert.deepEqual(met('Secret123'), ['length', 'upper', 'lower', 'digit'])
  assert.deepEqual(met('abc'), ['lower'])
})

test('login only requires an email and a password', () => {
  assert.deepEqual(validateLogin({ email: 'a@b.co', password: 'x' }), {})
  assert.deepEqual(Object.keys(validateLogin({ email: '', password: '' })).sort(), ['email', 'password'])
})

test('backend field errors map to form fields (first message wins)', () => {
  const error = { details: [{ field: 'email', message: 'taken' }, { field: 'email', message: 'second' }, { field: 'password', message: 'weak' }] }
  assert.deepEqual(fieldErrorsFromApi(error), { email: 'taken', password: 'weak' })
  assert.deepEqual(fieldErrorsFromApi(undefined), {})
})

test('change password: same rules as registration, and the new password must differ', () => {
  const ok = { currentPassword: 'Secret123', newPassword: 'Changed456', confirmPassword: 'Changed456' }
  assert.deepEqual(validateChangePassword(ok), {})
  assert.ok(validateChangePassword({ ...ok, currentPassword: '' }).currentPassword)
  assert.ok(validateChangePassword({ ...ok, newPassword: 'weak', confirmPassword: 'weak' }).newPassword)
  assert.equal(
    validateChangePassword({ ...ok, newPassword: 'Secret123', confirmPassword: 'Secret123' }).newPassword,
    'New password must be different from the current password',
  )
  assert.equal(validateChangePassword({ ...ok, confirmPassword: 'Other1234' }).confirmPassword, 'Passwords do not match')
})

const REQUIREMENTS = { minimumAge: 18, states: ['Karnataka', 'Delhi'], occupations: ['SALARIED', 'OTHER'] }
const GOOD = { dateOfBirth: '1990-01-01', phone: '+91 90000-00000', city: 'Bengaluru', state: 'Karnataka', pinCode: '560001', occupation: 'OTHER' }

test('onboarding: valid demo details pass; phone formats are normalised like on the server', () => {
  assert.deepEqual(validateOnboardingDetails(GOOD, REQUIREMENTS), {})
  assert.equal(normalisePhone('+91 98765-43210'), '9876543210')
  assert.equal(normalisePhone('09876543210'), '9876543210')
})

test('onboarding: under 18, impossible dates, bad phone, PIN, state, occupation and city are reported per field', () => {
  const almost18 = new Date()
  almost18.setUTCFullYear(almost18.getUTCFullYear() - 18)
  almost18.setUTCDate(almost18.getUTCDate() + 1)
  const errors = validateOnboardingDetails(
    { dateOfBirth: almost18.toISOString().slice(0, 10), phone: '12345', city: 'City 42', state: 'Atlantis', pinCode: '012345', occupation: 'ASTRONAUT' },
    REQUIREMENTS,
  )
  assert.deepEqual(Object.keys(errors).sort(), ['city', 'dateOfBirth', 'occupation', 'phone', 'pinCode', 'state'])
  assert.match(errors.dateOfBirth, /at least 18/)
  assert.equal(validateOnboardingDetails({ ...GOOD, dateOfBirth: '2001-02-30' }, REQUIREMENTS).dateOfBirth, 'Enter a valid date')
})
