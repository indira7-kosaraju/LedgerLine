import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORD_RULES, fieldErrorsFromApi, validateLogin, validateRegister } from '../../src/utils/validation.js'

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
