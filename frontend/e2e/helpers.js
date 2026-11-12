import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'

export const API = 'http://localhost:4001/api'
export const PASSWORD = 'Secret123'

// Test-only admin/auditor credentials from backend/.env.test (seeded by global-setup).
const testEnv = Object.fromEntries(
  readFileSync(new URL('../../backend/.env.test', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
export const ADMIN = { email: testEnv.SEED_ADMIN_EMAIL, password: testEnv.SEED_ADMIN_PASSWORD }
export const AUDITOR = { email: testEnv.SEED_AUDITOR_EMAIL, password: testEnv.SEED_AUDITOR_PASSWORD }

export const uniqueEmail = (prefix = 'e2e') => `${prefix}-${randomUUID().slice(0, 8)}@example.com`

// Demo onboarding details (step 4) – obviously fake, like the app asks for.
export const DEMO_DETAILS = { dateOfBirth: '1990-01-01', phone: '9000000000', city: 'Bengaluru', state: 'Karnataka', pinCode: '560001', occupation: 'OTHER' }

// Registers through the API inside the page's browser context, so the session cookie
// lands in the browser – the page is then signed in, exactly like after the form.
// Completes onboarding too (approved automatically) unless { onboard: false }.
export async function signUp(page, fullName = 'E2E User', { onboard = true } = {}) {
  const email = uniqueEmail()
  const res = await page.request.post(`${API}/auth/register`, { data: { email, password: PASSWORD, fullName } })
  expect(res.status()).toBe(201)
  let { user } = await res.json()
  if (onboard) {
    const { onboarding } = await apiGet(page, '/onboarding')
    const done = await apiPost(page, '/onboarding', { ...DEMO_DETAILS, acceptTerms: true, termsVersion: onboarding.requirements.termsVersion })
    expect(done.status()).toBe(200)
    user = (await done.json()).user
  }
  return { email, password: PASSWORD, user }
}

// Cookie-authenticated API call from the page's context (needs the CSRF header like the app).
export async function apiPost(page, path, data, headers = {}) {
  return page.request.post(API + path, { data, headers: { 'X-Requested-With': 'XMLHttpRequest', ...headers } })
}

export async function apiGet(page, path) {
  const res = await page.request.get(API + path)
  return res.json()
}

export async function openAccount(page) {
  const res = await apiPost(page, '/accounts', {})
  expect(res.status()).toBe(201)
  return (await res.json()).account
}

export async function depositViaApi(page, accountId, amountPaise) {
  const res = await apiPost(page, '/transactions/deposit', { accountId, amountPaise }, { 'Idempotency-Key': randomUUID() })
  expect(res.status()).toBe(201)
}

export async function balance(page, accountId) {
  return (await apiGet(page, `/accounts/${accountId}/balance`)).balance.formatted
}

export async function signIn(page, { email, password }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

// Fails the test if the page throws a JavaScript error or the server answers 5xx
// (Chrome's own "Failed to load resource" logs for expected 4xx are ignored).
export function watchForErrors(page) {
  const problems = []
  page.on('pageerror', (e) => problems.push(`JS error: ${e.message}`))
  page.on('response', (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`))
  return problems
}

export const json = (status, body, headers = {}) => ({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
