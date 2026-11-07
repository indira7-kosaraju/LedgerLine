import { test, expect } from '@playwright/test'
import { AUDITOR, signUp, signIn, openAccount, depositViaApi, balance, apiGet, watchForErrors } from './helpers.js'

const sidebar = (page) => page.getByRole('navigation', { name: 'Main' })

async function fill(page, amount, description) {
  await page.getByLabel('Amount').fill(amount)
  if (description) await page.getByLabel('Description (optional)').fill(description)
}
const review = (page) => page.getByRole('button', { name: /^Review/ }).click()
const confirmButton = (page) => page.getByRole('dialog').getByRole('button', { name: /^(Deposit|Withdraw|Transfer) ₹/ })
const newBalance = (page) => page.getByText(/^New balance of/).locator('..')

test('Day 1 scenario through the forms: ₹5,000 + ₹2,000 − ₹1,000 − ₹500 = ₹5,500', async ({ page, browser }) => {
  const problems = watchForErrors(page)
  const receiverContext = await browser.newContext()
  const receiverPage = await receiverContext.newPage()
  await signUp(receiverPage, 'Ravi Receiver')
  const receiverAccount = await openAccount(receiverPage)

  await signUp(page, 'Sita Sender')
  const account = await openAccount(page)

  await page.goto('/deposit')
  await fill(page, '5000', 'Salary')
  await review(page)
  await expect(page.getByRole('dialog')).toContainText(account.accountNumber)
  await expect(page.getByRole('dialog')).toContainText('₹5,000.00')
  await confirmButton(page).click()
  await expect(page.getByText('Deposit complete')).toBeVisible()
  await expect(newBalance(page)).toContainText('₹5,000.00')

  await page.getByRole('button', { name: 'New deposit' }).click()
  await fill(page, '2,000')
  await review(page)
  await confirmButton(page).click()
  await expect(newBalance(page)).toContainText('₹7,000.00')

  await sidebar(page).getByText('Withdraw').click()
  await expect(page.getByText('Available balance: ₹7,000.00')).toBeVisible()
  await fill(page, '1000')
  await review(page)
  await confirmButton(page).click()
  await expect(page.getByText('Withdrawal complete')).toBeVisible()
  await expect(newBalance(page)).toContainText('₹6,000.00')

  await sidebar(page).getByText('Transfer').click()
  await page.getByLabel('Recipient account number').fill(receiverAccount.accountNumber)
  await fill(page, '500', 'Dinner')
  await review(page)
  await confirmButton(page).click()
  await expect(page.getByText('Transfer complete')).toBeVisible()
  await expect(newBalance(page)).toContainText('₹5,500.00')
  await expect(page.locator('main')).not.toContainText(`New balance of ${receiverAccount.accountNumber}`)

  expect(await balance(page, account.id)).toBe('₹5,500.00')
  expect(await balance(receiverPage, receiverAccount.id)).toBe('₹500.00')
  await receiverContext.close()
  expect(problems).toEqual([])
})

test('the form checks the FORMAT; the server decides – and refusals change nothing', async ({ page }) => {
  await signUp(page)
  const account = await openAccount(page)
  await depositViaApi(page, account.id, 100000) // ₹1,000

  await page.goto('/withdraw')
  for (const [bad, message] of [['abc', /at most 2 decimal/], ['10.555', /at most 2 decimal/], ['0', /more than ₹0.00/]]) {
    await fill(page, bad)
    await review(page)
    await expect(page.getByText(message)).toBeVisible()
    await expect(page.getByRole('dialog')).toBeHidden()
  }

  await fill(page, '1000.01')
  await review(page)
  await confirmButton(page).click()
  await expect(page.getByText('Not enough balance')).toBeVisible()
  await expect(page.getByText('Insufficient funds: available ₹1,000.00')).toBeVisible()
  expect(await balance(page, account.id)).toBe('₹1,000.00')

  await page.goto('/transfer')
  await page.getByLabel('Recipient account number').fill('LL0000000000')
  await fill(page, '10')
  await review(page)
  await confirmButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Destination account not found')
})

test('cancel sends nothing; a double-click sends one transaction', async ({ page }) => {
  await signUp(page)
  const account = await openAccount(page)
  await page.goto('/deposit')

  await fill(page, '50')
  await review(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  expect((await apiGet(page, '/transactions')).total).toBe(0)

  await review(page)
  await confirmButton(page).dblclick()
  await expect(page.getByText('Deposit complete')).toBeVisible()
  expect((await apiGet(page, '/transactions')).total).toBe(1)
  expect(await balance(page, account.id)).toBe('₹50.00')
})

test('lost response: the server processed it, "Retry safely" returns the original – money moves once', async ({ page }) => {
  await signUp(page)
  const account = await openAccount(page)
  const keys = []
  page.on('request', (r) => r.url().endsWith('/transactions/deposit') && keys.push(r.headers()['idempotency-key']))

  await page.goto('/deposit')
  await page.route('**/api/transactions/deposit', async (route) => {
    await route.fetch() // the request really reaches the server…
    await route.abort('connectionreset') // …but the answer is lost
  })
  await fill(page, '2500')
  await review(page)
  await confirmButton(page).click()
  await expect(page.getByText('We could not confirm this transaction')).toBeVisible()
  expect(await balance(page, account.id)).toBe('₹2,500.00') // it DID go through
  await page.unroute('**/api/transactions/deposit')

  await page.getByRole('button', { name: /Retry safely/ }).click()
  await expect(page.getByText('Already processed')).toBeVisible()
  expect(keys[1]).toBe(keys[0]) // same Idempotency-Key
  expect(await balance(page, account.id)).toBe('₹2,500.00') // NOT ₹5,000
  expect((await apiGet(page, '/transactions')).total).toBe(1)
})

test('history and details: filters, direction, and privacy of the other side', async ({ page, browser }) => {
  const otherContext = await browser.newContext()
  const otherPage = await otherContext.newPage()
  const other = await signUp(otherPage, 'Other Person')
  const otherAccount = await openAccount(otherPage)

  await signUp(page)
  const account = await openAccount(page)
  await depositViaApi(page, account.id, 10000)
  await depositViaApi(page, account.id, 20000)

  await page.goto('/transfer')
  await page.getByLabel('Recipient account number').fill(otherAccount.accountNumber)
  await fill(page, '75')
  await review(page)
  await confirmButton(page).click()
  await expect(page.getByText('Transfer complete')).toBeVisible()

  await page.goto('/transactions')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.getByLabel('Type').selectOption('DEPOSIT')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByLabel('Type').selectOption('TRANSFER')
  const row = page.locator('tbody tr', { hasText: otherAccount.accountNumber })
  await expect(row).toContainText('−₹75.00')

  await row.getByRole('link').click()
  await expect(page.getByText('−₹75.00')).toBeVisible()
  await expect(page.getByText('You', { exact: true })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(1) // only MY ledger entry
  await expect(page.getByText(/is not shown, for privacy/)).toBeVisible()
  const detailsUrl = page.url()

  // The receiver can open it too, sees only their credit and not who sent it.
  await otherPage.goto(detailsUrl)
  await expect(otherPage.getByText('+₹75.00')).toBeVisible()
  await expect(otherPage.getByText('Another LedgerLine user')).toBeVisible()

  // The auditor sees both entries and the sender.
  const auditorContext = await browser.newContext()
  const auditorPage = await auditorContext.newPage()
  await signIn(auditorPage, AUDITOR)
  await auditorPage.goto(detailsUrl)
  await expect(auditorPage.locator('tbody tr')).toHaveCount(2)

  // An unrelated user is refused.
  const strangerContext = await browser.newContext()
  const strangerPage = await strangerContext.newPage()
  await signUp(strangerPage, 'Stranger')
  await strangerPage.goto(detailsUrl)
  await expect(strangerPage.getByText('Access denied')).toBeVisible()

  expect(other.email).toBeTruthy()
  await Promise.all([otherContext.close(), auditorContext.close(), strangerContext.close()])
})
