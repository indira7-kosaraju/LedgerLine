import { test, expect } from '@playwright/test'
import { ADMIN, PASSWORD, signIn, signUp, uniqueEmail, watchForErrors } from './helpers.js'

// Step 5 – admin dashboard, user management, staff management.
const sidebar = (page) => page.getByRole('navigation', { name: 'Main' })

test('admin dashboard: overview figures, admin actions, newest users, Staff in the navigation', async ({ page }) => {
  const problems = watchForErrors(page)
  await signIn(page, ADMIN)
  await expect(page.getByRole('heading', { name: 'System overview' })).toBeVisible()
  for (const label of ['Onboarding pending', 'Customer funds', 'Refused attempts', 'Recent admin actions', 'Newest users']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(sidebar(page)).toContainText('Staff')
  expect(problems).toEqual([])
})

test('staff lifecycle: create an auditor → temporary password once → forced change → promoted to admin (with password check)', async ({ page, browser }) => {
  const problems = watchForErrors(page)
  const email = uniqueEmail('staff')
  await signIn(page, ADMIN)
  await page.goto('/admin/staff')

  // Create – the admin's own password is required
  await page.getByRole('button', { name: 'Add staff member' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Full name').fill('E2E Auditor')
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByLabel('Role').selectOption('AUDITOR')
  await dialog.getByRole('button', { name: 'Create staff account' }).click()
  await expect(dialog.getByText('Enter your password to confirm')).toBeVisible()
  await dialog.getByLabel('Your password (to confirm)').fill(ADMIN.password)
  await dialog.getByRole('button', { name: 'Create staff account' }).click()

  // The temporary password is shown once
  await expect(page.getByText('Temporary password – shown only now')).toBeVisible()
  const temporaryPassword = (await page.getByTestId('temporary-password').textContent()).trim()
  expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{20}$/)
  await page.getByRole('button', { name: 'I have handed it over' }).click()
  await expect(page.getByTestId('temporary-password')).toHaveCount(0)
  const row = page.locator('tbody tr', { hasText: email })
  await expect(row.getByText('Temporary password')).toBeVisible()

  // The new auditor signs in and is held on the profile page until the password is changed
  const staffContext = await browser.newContext()
  const staffPage = await staffContext.newPage()
  await staffPage.goto('/login')
  await staffPage.getByLabel('Email').fill(email)
  await staffPage.getByLabel('Password', { exact: true }).fill(temporaryPassword)
  await staffPage.getByRole('button', { name: 'Sign in' }).click()
  await expect(staffPage).toHaveURL(/\/profile$/)
  await expect(staffPage.getByText('Change your temporary password')).toBeVisible()
  await staffPage.goto('/audit-logs')
  await expect(staffPage).toHaveURL(/\/profile$/)
  await staffPage.getByLabel('Current password').fill(temporaryPassword)
  await staffPage.getByLabel('New password', { exact: true }).fill('MyOwnAudit456')
  await staffPage.getByLabel('Confirm new password').fill('MyOwnAudit456')
  await staffPage.getByRole('button', { name: 'Change password' }).click()
  await expect(staffPage.getByText(/Password changed/)).toBeVisible()
  await staffPage.goto('/audit-logs')
  await expect(staffPage.getByRole('heading', { name: 'Audit log' })).toBeVisible()

  // Promote to administrator: wrong password first, then the right one
  await page.reload()
  await page.locator('tbody tr', { hasText: email }).getByRole('button', { name: 'Make administrator' }).click()
  await dialog.getByLabel('Reason (optional, stored in the audit log)').fill('E2E promotion')
  await dialog.getByLabel('Your password (to confirm)').fill('WrongPass1')
  await dialog.getByRole('button', { name: 'Make administrator' }).click()
  await expect(dialog.getByText('Your password is incorrect')).toBeVisible()
  await dialog.getByLabel('Your password (to confirm)').fill(ADMIN.password)
  await dialog.getByRole('button', { name: 'Make administrator' }).click()
  await expect(page.getByText(/is now Administrator\. Their sessions were ended\./)).toBeVisible()

  // Their old session ended with the role change
  await staffPage.goto('/audit-logs')
  await expect(staffPage).toHaveURL(/\/login$/)
  await staffContext.close()
  expect(problems).toEqual([])
})

test('user details: minimised personal data, "sign out everywhere" ends the holder\'s session', async ({ page, browser }) => {
  const holderContext = await browser.newContext()
  const holderPage = await holderContext.newPage()
  const holder = await signUp(holderPage, 'Details Holder')
  await holderPage.goto('/dashboard')

  await signIn(page, ADMIN)
  await page.goto(`/admin/users?q=${encodeURIComponent(holder.email)}`)
  await page.getByRole('link', { name: 'Details Holder' }).click()
  await expect(page.getByRole('heading', { name: 'Details Holder' })).toBeVisible()
  await expect(page.getByText('+91 ••••••0000')).toBeVisible()
  await expect(page.getByText('1990-01-01')).toHaveCount(0) // date of birth never shown – only the age
  await expect(page.getByText('560001')).toHaveCount(0) // no PIN code

  await page.getByRole('button', { name: 'Sign out everywhere' }).click()
  await page.getByRole('dialog').getByLabel(/Reason/).fill('E2E: lost phone')
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect(page.getByText('Details Holder was signed out everywhere.')).toBeVisible()
  await expect(page.getByText('E2E: lost phone')).toHaveCount(0) // notes stay in the audit metadata, not in the UI table

  await holderPage.goto('/accounts')
  await expect(holderPage).toHaveURL(/\/login$/)
  await holderContext.close()
})

test('users list: filter by onboarding status', async ({ page }) => {
  const pending = await signUp(page, 'Pending Person', { onboard: false })
  await page.context().clearCookies()
  await signIn(page, ADMIN)
  await page.goto(`/admin/users?q=${encodeURIComponent(pending.email)}`)
  await page.getByLabel('Onboarding').selectOption('PENDING_PROFILE')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr').getByText('Pending', { exact: true })).toBeVisible()
  await page.getByLabel('Onboarding').selectOption('APPROVED')
  await expect(page.getByText('No users match these filters.')).toBeVisible()
})

test('an account holder cannot open any admin page', async ({ page }) => {
  await signUp(page, 'Curious Holder')
  for (const path of ['/admin/staff', '/admin/users']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/forbidden$/)
  }
  await expect(page.getByText(PASSWORD)).toHaveCount(0)
})
