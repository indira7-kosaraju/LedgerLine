import { test, expect } from '@playwright/test'
import { PASSWORD, signUp, uniqueEmail, watchForErrors } from './helpers.js'

test('register: validation messages, then success lands on the dashboard', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/register')

  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Full name must be at least 2 characters')).toBeVisible()
  await expect(page.getByText('Email is required')).toBeVisible()

  await page.getByLabel('Full name').fill('Asha Rao')
  await page.getByLabel('Email').fill(uniqueEmail('reg'))
  await page.getByLabel('Password', { exact: true }).fill('Secret1')
  await expect(page.getByText('✓').first()).toBeVisible() // live checklist
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Show password' }).first().click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByLabel('Confirm password').fill('Different1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Passwords do not match')).toBeVisible()

  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('Account created. Welcome to LedgerLine, Asha Rao!')).toBeVisible()
  expect(problems).toEqual([])
})

test('the session token is NOT readable by JavaScript (HttpOnly cookie)', async ({ page }) => {
  await signUp(page)
  await page.goto('/dashboard')
  expect(await page.evaluate(() => document.cookie)).not.toContain('ll_session')
  const cookie = (await page.context().cookies()).find((c) => c.name === 'll_session')
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' })
})

test('the session survives a page reload', async ({ page }) => {
  const { user } = await signUp(page, 'Reload Tester')
  await page.goto('/dashboard')
  await page.reload()
  await expect(page.getByRole('heading', { name: user.fullName })).toBeVisible()
})

test('protected pages redirect to sign-in and come back after signing in', async ({ page }) => {
  const account = await signUp(page)
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('You have been signed out.')).toBeVisible()

  await page.goto('/transactions')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Please sign in to continue.')).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/transactions$/)
})

test('wrong password shows one generic message and clears the field', async ({ page }) => {
  const account = await signUp(page)
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill('WrongPass1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
})

test('signed-in users are sent from /login to the dashboard', async ({ page }) => {
  await signUp(page) // the browser now holds a valid session cookie
  await page.goto('/login')
  await expect(page).toHaveURL(/\/dashboard$/)
})
