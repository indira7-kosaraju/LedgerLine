import { test, expect } from '@playwright/test'
import { API, DEMO_DETAILS, PASSWORD, apiPost, signUp, uniqueEmail, watchForErrors } from './helpers.js'

// Step 4 – onboarding in the browser: register → demo warning → details → terms → approved → first account.
test('register, complete onboarding (with validation), then open the first account', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Onboarding Tester')
  await page.getByLabel('Email').fill(uniqueEmail('onb'))
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.getByText('Demo application – do not enter real personal information')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Onboarding' })).toBeVisible()

  // Step 1 – client-side checks first
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Date of birth is required')).toBeVisible()
  const tooYoung = new Date()
  tooYoung.setUTCFullYear(tooYoung.getUTCFullYear() - 17)
  await page.getByLabel('Date of birth').fill(tooYoung.toISOString().slice(0, 10))
  await page.getByLabel('Mobile number').fill('12345')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('You must be at least 18 years old', { exact: true })).toBeVisible()
  await expect(page.getByText('Enter a 10-digit Indian mobile number (starting with 6, 7, 8 or 9)')).toBeVisible()

  await page.getByLabel('Date of birth').fill(DEMO_DETAILS.dateOfBirth)
  await page.getByLabel('Mobile number').fill('90000 00000')
  await page.getByLabel('City').fill(DEMO_DETAILS.city)
  await page.getByLabel('State / union territory').selectOption(DEMO_DETAILS.state)
  await page.getByLabel('PIN code').fill(DEMO_DETAILS.pinCode)
  await page.getByLabel('Occupation').selectOption('OTHER')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 2 – review shows the normalised number; the terms must be accepted
  await expect(page.getByText('+919000000000')).toBeVisible()
  await page.getByRole('button', { name: 'Complete onboarding' }).click()
  await expect(page.getByText('You must accept the terms to continue')).toBeVisible()
  await page.getByLabel(/I have read and accept the terms/).check()
  await page.getByRole('button', { name: 'Complete onboarding' }).click()

  // Approved automatically → dashboard, onboarding item gone, first account can be opened
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('Onboarding complete – you can now open your first account.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Onboarding' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open my first account' }).click()
  await expect(page.getByText(/Account LL\d{10} opened\./)).toBeVisible()
  expect(problems).toEqual([])
})

test('before onboarding: no "open account" buttons, money pages show the notice, and the API refuses', async ({ page }) => {
  await signUp(page, 'Not Yet Onboarded', { onboard: false })

  await page.goto('/accounts')
  await expect(page.getByText('Complete your onboarding first')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open new account' })).toHaveCount(0)

  for (const path of ['/deposit', '/withdraw', '/transfer']) {
    await page.goto(path)
    await expect(page.getByText('Complete your onboarding first')).toBeVisible()
  }

  // The UI is not the protection – the server refuses on its own.
  const res = await apiPost(page, '/accounts', {})
  expect(res.status()).toBe(403)
  expect((await res.json()).error.code).toBe('ONBOARDING_INCOMPLETE')

  await page.getByRole('link', { name: 'Start onboarding' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
})

test('a completed onboarding shows the summary instead of the form', async ({ page }) => {
  await signUp(page, 'Already Onboarded')
  await page.goto('/onboarding')
  await expect(page.getByRole('heading', { name: 'Onboarding complete' })).toBeVisible()
  await expect(page.getByText('+919000000000')).toBeVisible()
  expect((await page.request.get(`${API}/onboarding`)).status()).toBe(200)
})
