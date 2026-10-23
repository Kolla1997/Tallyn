// Plaid sandbox only (#113). Two ways to link a bank:
// - linkInBrowser: through Plaid Link in the page, as a person does (the
//   "connect a bank" test);
// - linkByAPI: Plaid's sandbox makes the public token, then our own
//   /api/plaid/exchange stores it. Only to set up other tests quickly.
import { expect } from '@playwright/test'
import { call } from './users.js'

const SANDBOX = 'https://sandbox.plaid.com'
const INSTITUTION = 'First Platypus Bank' // a Plaid sandbox test bank
const INSTITUTION_ID = 'ins_109508'

export async function linkByAPI(person) {
  const res = await fetch(`${SANDBOX}/sandbox/public_token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.E2E_PLAID_CLIENT_ID,
      secret: process.env.E2E_PLAID_SECRET,
      institution_id: INSTITUTION_ID,
      initial_products: ['transactions'],
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Plaid sandbox public token: ${body.error_code ?? res.status}`)
  await call(person.token, '/api/plaid/exchange', { method: 'POST', body: { household_id: person.householdId, public_token: body.public_token } })
}

// The banks and accounts the API shows this person: what the page should match.
export async function banksOf(person, householdId = person.householdId) {
  const { banks } = await call(person.token, `/api/banks?household_id=${householdId}`)
  return banks ?? []
}

// Clicks a button in Plaid Link if it shows up and can be clicked. Link's
// screens change now and then (phone number, saved banks), so optional steps
// are skipped. A greyed-out button counts as not shown.
async function clickIfShown(frame, name, timeout = 5000) {
  const b = frame.getByRole('button', { name }).first()
  try {
    await b.waitFor({ state: 'visible', timeout })
    if (!(await b.isEnabled())) return false
    await b.click({ timeout })
    return true
  } catch {
    return false
  }
}

// Goes through Plaid Link in the sandbox: skip the phone number, pick the test
// bank, sign in with Plaid's published sandbox login (user_good / pass_good),
// keep the accounts.
export async function linkInBrowser(page) {
  const frame = page.frameLocator('iframe[id^="plaid-link-iframe"]').first()

  // First screen (2026): phone number, with "Continue without phone number".
  const skipPhone = frame.getByRole('button', { name: /continue without phone number/i })
  const search = frame
    .getByRole('textbox', { name: /search/i })
    .or(frame.getByPlaceholder(/search/i))
    .first()
  await expect(skipPhone.or(search).first()).toBeVisible({ timeout: 30_000 })
  if (await skipPhone.isVisible()) await skipPhone.click()
  await clickIfShown(frame, /^(Get started|Continue)$/i, 3000) // older intro screen

  await search.fill(INSTITUTION)
  await frame
    .getByRole('button', { name: new RegExp(INSTITUTION, 'i') })
    .or(frame.getByText(INSTITUTION, { exact: true }))
    .first()
    .click()
  // Plaid may list related test banks (plain, OAuth, App2App): take the plain one.
  await clickIfShown(frame, new RegExp(`^${INSTITUTION}$`, 'i'))
  await clickIfShown(frame, /continue to login/i)

  await frame.getByRole('textbox', { name: /user/i }).first().fill('user_good')
  await frame
    .getByLabel(/password/i)
    .first()
    .fill('pass_good')
  await frame
    .getByRole('button', { name: /^(Submit|Sign in|Continue)$/i })
    .first()
    .click()

  // Choose accounts (all are kept), save-with-Plaid offers, then the last screen.
  for (let i = 0; i < 6; i++) {
    if (!(await clickIfShown(frame, /^(Continue|Allow|Confirm|Done|Finish without saving|Not now|Skip)$/i, 10_000))) break
  }
  await expect(page.locator('iframe[id^="plaid-link-iframe"]').first()).toBeHidden({ timeout: 30_000 })
}
