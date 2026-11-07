import { test, expect } from '@playwright/test'
import { ADMIN, AUDITOR, signUp, signIn, openAccount, depositViaApi, watchForErrors } from './helpers.js'

const sidebar = (page) => page.getByRole('navigation', { name: 'Main' })

test('account holder: own navigation only; admin pages are forbidden', async ({ page }) => {
  const problems = watchForErrors(page)
  await signUp(page)
  await page.goto('/dashboard')
  await expect(sidebar(page)).toHaveText(/Dashboard.*Accounts.*Transactions.*Deposit.*Withdraw.*Transfer/s)
  await expect(sidebar(page)).not.toContainText('Ledger')
  await expect(sidebar(page)).not.toContainText('Audit logs')
  await expect(sidebar(page)).not.toContainText('Users')

  for (const path of ['/ledger', '/audit-logs', '/admin/users']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/forbidden$/)
  }
  expect(problems).toEqual([])
})

test('admin: overview, freeze/unfreeze an account, deactivate a user who is signed in', async ({ page, browser }) => {
  const problems = watchForErrors(page)

  // A holder with an account, signed in in another browser.
  const holderContext = await browser.newContext()
  const holderPage = await holderContext.newPage()
  const holder = await signUp(holderPage, 'Frozen Holder')
  const account = await openAccount(holderPage)
  await depositViaApi(holderPage, account.id, 10000)

  await signIn(page, ADMIN)
  await expect(page.getByRole('heading', { name: 'System overview' })).toBeVisible()
  await expect(page.getByText('Books are balanced')).toBeVisible()
  await expect(sidebar(page)).toContainText('Users')
  await expect(sidebar(page)).not.toContainText('Deposit')

  await page.goto(`/accounts/${account.id}`)
  await page.getByRole('button', { name: 'Freeze account' }).click()
  await page.getByRole('dialog').getByLabel(/Reason/).fill('E2E check')
  await page.getByRole('dialog').getByRole('button', { name: 'Freeze account' }).click()
  await expect(page.getByText(/is now frozen/)).toBeVisible()
  await page.getByRole('button', { name: 'Unfreeze account' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Unfreeze account' }).click()
  await expect(page.getByText(/is now active/)).toBeVisible()

  await page.goto('/admin/users')
  await page.getByLabel('Search').fill(holder.email)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'Deactivate' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click()
  await expect(page.getByText(/is now deactivated/)).toBeVisible()

  await holderPage.goto('/accounts')
  await expect(holderPage).toHaveURL(/\/login$/) // their open session stopped working

  await page.getByRole('button', { name: 'Activate' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click()
  await expect(page.getByText(/is now active/)).toBeVisible()
  await holderContext.close()
  expect(problems).toEqual([])
})

test('auditor: read-only everywhere', async ({ page }) => {
  const problems = watchForErrors(page)
  await signIn(page, AUDITOR)
  await expect(page.getByText('Read-only access')).toBeVisible()
  await expect(sidebar(page)).toContainText('Ledger')
  await expect(sidebar(page)).not.toContainText('Deposit')
  await expect(sidebar(page)).not.toContainText('Users')

  await page.goto('/ledger')
  await expect(page.getByText('Books are balanced')).toBeVisible()
  await page.goto('/accounts')
  await page.locator('tbody a[href^="/accounts/"]').first().click()
  await expect(page.getByText('Statement', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Freeze|Close account/ })).toHaveCount(0)

  await page.goto('/deposit')
  await expect(page).toHaveURL(/\/forbidden$/)
  expect(problems).toEqual([])
})

test('mobile: menu works and the page never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page)
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Main menu' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Main menu' })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
