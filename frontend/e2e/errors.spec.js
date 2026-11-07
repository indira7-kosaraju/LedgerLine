import { test, expect } from '@playwright/test'
import { ADMIN, signUp, signIn, openAccount, json } from './helpers.js'

const sidebar = (page) => page.getByRole('navigation', { name: 'Main' })

test('500 → "Something went wrong" + Try again, which recovers', async ({ page }) => {
  await signUp(page)
  await openAccount(page)
  await page.route('**/api/accounts?*', (r) => r.fulfill(json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })))
  await page.goto('/accounts')
  await expect(page.getByRole('alert')).toContainText('Something went wrong')
  await page.unroute('**/api/accounts?*')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('main a[href^="/accounts/"]')).toHaveCount(1)
})

test('network down → "Connection problem"', async ({ page }) => {
  await signUp(page)
  await page.route('**/api/transactions?*', (r) => r.abort())
  await page.goto('/transactions')
  await expect(page.getByText('Connection problem')).toBeVisible()
  await expect(page.getByText('Cannot reach the LedgerLine server')).toBeVisible()
})

test('429 → tells the user how long to wait (Retry-After)', async ({ page }) => {
  await signUp(page)
  await page.route('**/api/transactions?*', (r) =>
    r.fulfill(json(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { 'Retry-After': '42', 'Access-Control-Expose-Headers': 'Retry-After' })),
  )
  await page.goto('/transactions')
  await expect(page.getByText('Too many requests. Please try again in 42 seconds.')).toBeVisible()
})

test('400 with field details → message under the right field', async ({ page }) => {
  await signUp(page)
  await openAccount(page)
  await page.route('**/api/transactions/deposit', (r) =>
    r.fulfill(json(400, { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'amountPaise', message: 'amountPaise must be greater than 0' }] } })),
  )
  await page.goto('/deposit')
  await page.getByLabel('Amount').fill('10')
  await page.getByRole('button', { name: 'Review deposit' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Deposit ₹/ }).click()
  await expect(page.getByText('amountPaise must be greater than 0')).toBeVisible()
  await expect(page.getByText('Please check the form')).toBeVisible()
})

test('403 → "Access denied" without a pointless retry button', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.route('**/api/audit-logs?*', (r) => r.fulfill(json(403, { error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' } })))
  await page.goto('/audit-logs')
  await expect(page.getByText('Access denied')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('404 → "Not found"', async ({ page }) => {
  await signUp(page)
  await page.goto('/accounts/00000000-0000-4000-8000-000000000000')
  await expect(page.getByText('Not found', { exact: true })).toBeVisible()
})

test('a page crash shows an error card, the app keeps working', async ({ page }) => {
  await signUp(page)
  await page.route('**/api/accounts?*', (r) => r.fulfill(json(200, { items: [{ id: 'broken', status: 'ACTIVE' }], total: 1, page: 1, limit: 100, summary: { totalBalance: { formatted: '₹0.00' } } })))
  await page.goto('/accounts')
  await expect(page.getByText('This page ran into a problem')).toBeVisible()
  await page.unroute('**/api/accounts?*')
  await sidebar(page).getByText('Dashboard').click()
  await expect(page.getByRole('heading', { name: 'Your accounts' })).toBeVisible()
})

test('401 mid-session → sign-in with a notice, then back to the same page', async ({ page }) => {
  const account = await signUp(page)
  const acc = await openAccount(page)
  await page.goto(`/accounts/${acc.id}`)
  await expect(page.getByText('Current balance')).toBeVisible()

  await page.context().clearCookies() // the session disappears (expired / revoked)
  await page.getByRole('button', { name: 'Refresh balance' }).click()
  await expect(page).toHaveURL(/\/login$/)
  // Exactly ONE notice, even though the page had several requests fail with 401 at once.
  await expect(page.getByText('Your session has expired. Please sign in again.')).toHaveCount(1)

  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`/accounts/${acc.id}$`))
})
