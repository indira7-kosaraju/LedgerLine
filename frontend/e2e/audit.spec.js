import { test, expect } from '@playwright/test'
import { ADMIN, AUDITOR, PASSWORD, signIn, uniqueEmail, watchForErrors } from './helpers.js'

// Step 6 – tamper-evident audit trail, audit filters, password rules.

test('auditor: the audit log page verifies the hash chain and filters by entity and date', async ({ page }) => {
  const problems = watchForErrors(page)
  await signIn(page, AUDITOR)
  await expect(page.getByText('Audit trail intact')).toBeVisible() // also on the auditor dashboard
  await page.goto('/audit-logs')
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible()
  await expect(page.getByText('Audit trail intact')).toBeVisible()
  await expect(page.getByText(/Latest record #\d+ · hash [0-9a-f]{16}…/)).toBeVisible()

  await page.getByLabel('Entity').selectOption('User')
  const today = new Date().toISOString().slice(0, 10)
  await page.getByLabel('From').fill(today)
  await expect(page).toHaveURL(/entity=User/)
  await expect(page.locator('tbody tr').first()).toContainText('User ·')
  await expect(page.getByRole('columnheader', { name: '#' })).toBeVisible()
  expect(problems).toEqual([])
})

test('admin dashboard shows the audit trail check next to the ledger check', async ({ page }) => {
  await signIn(page, ADMIN)
  await expect(page.getByText('Books are balanced')).toBeVisible()
  await expect(page.getByText('Audit trail intact')).toBeVisible()
})

test('registration refuses a very common password and one containing the email name', async ({ page }) => {
  await page.goto('/register')
  const email = uniqueEmail('rules')
  await page.getByLabel('Full name').fill('Password Rules')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Welcome123')
  await page.getByLabel('Confirm password').fill('Welcome123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('This password is too common – choose a less predictable one')).toBeVisible()

  const name = email.split('@')[0].split('-')[1] // the random part, e.g. "3f9c2a1b"
  const withName = `Ab${name}9`
  await page.getByLabel('Password', { exact: true }).fill(withName)
  await page.getByLabel('Confirm password').fill(withName)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Password must not contain your email address')).toBeVisible()

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
})
