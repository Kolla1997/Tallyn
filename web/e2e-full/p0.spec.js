// Browser end-to-end tests for the P0 paths (#113): the real app, Go API,
// Supabase test project and Plaid sandbox. Each test makes its own people
// and removes them afterwards. Rows in docs/04 Tech/Test Plan.md.
import { banksOf, linkByAPI, linkInBrowser } from './support/plaid.js'
import { expect, signIn, test } from './support/fixtures.js'
import { call } from './support/users.js'

const money = (minor) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100)
const OWED = new Set(['credit', 'loan'])

// What Home's "Your balance" should say: your own accounts that hold money.
function yourBalance(banks, userId) {
  let have = 0
  for (const b of banks) {
    if (b.owner_user_id !== userId) continue
    for (const a of b.accounts) if (a.currency === 'USD' && a.current_balance_minor != null && !OWED.has(a.type)) have += a.current_balance_minor
  }
  return have
}

test('sign in with password and 2FA code', async ({ page, person }) => {
  const me = await person({ name: 'Test Owner', household: 'E2E Household' })

  // A wrong code is refused, and the right one gets in.
  await page.goto('/')
  await page.getByLabel('Email').fill(me.email)
  await page.getByLabel('Password', { exact: true }).fill(me.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
  await page.getByLabel('Digit 1 of 6').fill('000000')
  await expect(page.getByRole('alert')).toContainText("That code didn't work")
  await page.goto('/') // start over with a fresh sign-in
  await page.evaluate(() => localStorage.clear())

  await signIn(page, me)
  await expect(page.getByRole('heading', { name: 'E2E Household' })).toBeVisible()
  await expect(page.getByText('Hello, Test Owner')).toBeVisible()
})

test('Home shows the total in the home currency', async ({ page, person }) => {
  const me = await person({ name: 'Test Owner', household: 'E2E Household' })
  await linkByAPI(me)
  const banks = await banksOf(me)
  expect(banks.length).toBe(1)

  await signIn(page, me)
  const card = page.getByRole('region', { name: 'Your balance' })
  await expect(card).toContainText('Your balance · USD')
  await expect(card.locator('.total-big')).toHaveText(money(yourBalance(banks, me.id)))
})

test('connect a sandbox bank, then see its accounts and transactions', async ({ page, person }) => {
  const me = await person({ name: 'Test Owner', household: 'E2E Household' })
  await signIn(page, me)
  await expect(page.getByRole('heading', { name: 'E2E Household' })).toBeVisible()

  await page.getByRole('button', { name: 'Link a bank' }).first().click()
  await linkInBrowser(page)

  // Every account Plaid gave us is on the Accounts page.
  await expect.poll(async () => (await banksOf(me)).length, { timeout: 30_000 }).toBe(1)
  const [bank] = await banksOf(me)
  await page.goto('/accounts')
  const connected = page.getByRole('region', { name: 'Connected banks' })
  await expect(connected).toContainText(bank.institution_name)
  for (const a of bank.accounts) await expect(page.getByText(a.name).first()).toBeVisible()

  // The first sync brings transactions in; the sandbox can take a minute or two.
  await expect
    .poll(async () => (await call(me.token, `/api/transactions?household_id=${me.householdId}`)).transactions?.length ?? 0, {
      timeout: 180_000,
      intervals: [5_000],
    })
    .toBeGreaterThan(0)
  await page.goto('/transactions')
  await expect(page.getByRole('region', { name: 'Transactions' }).locator('.tx-row').first()).toBeVisible()
})

test('invite a member, who accepts', async ({ page, browser, person }) => {
  const owner = await person({ name: 'Test Owner', household: 'E2E Household' })
  const member = await person({ name: 'Test Partner' })

  await signIn(page, owner, { path: '/family' })
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible()
  await page.getByRole('button', { name: 'Invite someone' }).click()
  await page.getByLabel('Their email').fill(member.email)
  await page.getByLabel('Role').selectOption('adult')
  await page.getByRole('button', { name: 'Create invite link' }).click()
  const link = (await page.locator('.invite-form .secret').textContent()).trim()
  expect(link).toMatch(/\/join#[A-Za-z0-9_-]{43}$/)

  // The member opens the link in their own browser, signs in and joins.
  const theirs = await browser.newContext()
  const p2 = await theirs.newPage()
  await p2.goto(link)
  await signIn(p2, member, { path: '/' })
  await expect(p2.getByRole('heading', { name: "You've been invited" })).toBeVisible()
  await p2.getByRole('button', { name: 'Join household' }).click()
  await expect(p2.getByRole('heading', { name: 'E2E Household' })).toBeVisible()
  await theirs.close()

  // The owner sees them in the household.
  await page.reload()
  await expect(page.getByRole('region', { name: 'People in your household' })).toContainText('Test Partner')
})

test('share balances with a member, then stop sharing', async ({ page, browser, person }) => {
  const owner = await person({ name: 'Test Owner', household: 'E2E Household' })
  const member = await person({ name: 'Test Partner' })
  const { token } = await call(owner.token, `/api/households/${owner.householdId}/invites`, { method: 'POST', body: { email: member.email, role: 'adult' } })
  await call(member.token, '/api/invites/accept', { method: 'POST', body: { token } })
  await linkByAPI(owner)

  const theirs = await browser.newContext()
  const p2 = await theirs.newPage()
  await signIn(p2, member)
  await expect(p2.getByRole('heading', { name: 'E2E Household' })).toBeVisible()
  await expect(p2.getByRole('heading', { name: 'Shared with you' })).toHaveCount(0) // nothing until shared

  // The owner shares balances with the member.
  await signIn(page, owner, { path: '/family' })
  await page
    .getByRole('region', { name: 'People in your household' })
    .getByRole('button', { name: /Test Partner/ })
    .click()
  const balances = page.getByRole('switch', { name: 'Balances' })
  await balances.check()
  await expect(balances).toBeChecked()

  await p2.reload()
  const shared = p2.getByRole('region', { name: 'Shared with you' })
  await expect(shared).toContainText('Test Owner')
  await expect(shared).toContainText('Shares balances')

  // And stops: the member no longer sees it.
  await balances.uncheck()
  await expect(balances).not.toBeChecked()
  await p2.reload()
  await expect(p2.getByRole('heading', { name: 'E2E Household' })).toBeVisible()
  await expect(p2.getByRole('heading', { name: 'Shared with you' })).toHaveCount(0)
  await theirs.close()
})
