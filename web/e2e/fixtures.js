// Layout checks (#117): obviously fake data for every API call the pages
// make, and a fake signed-in session, so pages render without a real
// Supabase project or bank. Never real data (CLAUDE.md §7).

export const SUPABASE_URL = 'https://fakeproject.supabase.co'
const STORAGE_KEY = 'sb-fakeproject-auth-token'

const ME = 'aaaaaaaa-0000-4000-8000-000000000001'
const PAT = 'aaaaaaaa-0000-4000-8000-000000000002'
const ROBIN = 'aaaaaaaa-0000-4000-8000-000000000003'
const HH = 'bbbbbbbb-0000-4000-8000-000000000001'
const B1 = 'cccccccc-0000-4000-8000-000000000001'
const B2 = 'cccccccc-0000-4000-8000-000000000002'
const B3 = 'cccccccc-0000-4000-8000-000000000003'

const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => iso(new Date(today.getTime() - n * 86400000))
const daysAhead = (n) => iso(new Date(today.getTime() + n * 86400000))

const acct = (id, name, type, subtype, minor, extra = {}) => ({
  id,
  name,
  mask: '0000',
  type,
  subtype,
  currency: 'USD',
  current_balance_minor: minor,
  available_balance_minor: null,
  credit_limit_minor: null,
  card: null,
  loan: null,
  ...extra,
})

const BANKS = [
  {
    id: B1,
    institution_name: 'Fake Credit Union',
    owner_user_id: ME,
    status: 'active',
    last_synced_at: today.toISOString(),
    card_details: 'shared',
    can_unlink: true,
    accounts: [
      acct('dd-1', 'Everyday checking', 'depository', 'checking', 425000, { available_balance_minor: 410000 }),
      acct('dd-2', 'Rainy day savings', 'depository', 'savings', 1250000),
      acct('dd-3', 'Fake rewards card', 'credit', 'credit card', 86000, {
        credit_limit_minor: 500000,
        card: {
          aprs: [{ type: 'purchase_apr', percent: '22.99' }],
          minimum_payment_minor: 3500,
          next_payment_due_date: daysAhead(9),
          last_statement_balance_minor: 72000,
          last_statement_date: daysAgo(20),
          last_payment_minor: 50000,
          last_payment_date: daysAgo(25),
          is_overdue: false,
        },
      }),
    ],
  },
  {
    id: B2,
    institution_name: 'Fake Loan Bank',
    owner_user_id: ME,
    status: 'needs_reauth',
    last_synced_at: daysAgo(3) + 'T09:00:00Z',
    card_details: null,
    can_unlink: true,
    accounts: [
      acct('dd-4', 'Fake student loan', 'loan', 'student', 1800000, {
        loan: {
          kind: 'student',
          rate_percent: '5.5',
          rate_type: 'fixed',
          next_payment_minor: 21000,
          next_payment_due_date: daysAhead(14),
          last_payment_minor: 21000,
          last_payment_date: daysAgo(16),
          payoff_date: '2034-06-01',
          original_minor: 3000000,
          origination_date: '2020-09-01',
          past_due_minor: 0,
          is_overdue: false,
          ytd_interest_minor: 64000,
          ytd_principal_minor: 120000,
          repayment_plan: 'standard',
          term: null,
        },
      }),
    ],
  },
  {
    id: B3,
    institution_name: 'Fake Bank',
    owner_user_id: PAT,
    status: 'active',
    last_synced_at: today.toISOString(),
    card_details: null,
    can_unlink: false,
    accounts: [acct('dd-5', 'Pat checking', 'depository', 'checking', 230000)],
  },
]

const MEMBERS = [
  { user_id: ME, display_name: 'Sam Example', role: 'owner', is_you: true },
  { user_id: PAT, display_name: 'Pat Example', role: 'adult', is_you: false },
  { user_id: ROBIN, display_name: 'Robin Example', role: 'teen', is_you: false },
]

const CATS = ['FOOD_AND_DRINK', 'GENERAL_MERCHANDISE', 'TRANSPORTATION', 'ENTERTAINMENT', 'PERSONAL_CARE']
const MERCHANTS = ['Corner Cafe', 'Fake Market', 'City Transit', 'Fake Cinema', 'Fake Pharmacy']
const TXS = Array.from({ length: 30 }, (_, i) => ({
  id: `tx-${i}`,
  account_id: 'dd-1',
  account_name: 'Everyday checking',
  account_mask: '0000',
  bank_name: 'Fake Credit Union',
  owner_user_id: i % 4 === 3 ? PAT : ME,
  amount_minor: i === 5 ? -320000 : 1200 + i * 731,
  currency: 'USD',
  date: daysAgo(i),
  authorized_date: daysAgo(i),
  merchant: i === 5 ? 'Fake Employer Payroll' : MERCHANTS[i % 5],
  category_primary: i === 5 ? 'INCOME' : CATS[i % 5],
  category_detailed: null,
  pending: i === 0,
  payment_channel: 'in store',
  logo_url: null,
  whereabouts: null,
}))

const SPEND = CATS.map((c, i) => ({ category: c, currency: 'USD', amount_minor: 40000 - i * 6000, count: 6 - i }))
const SUMMARY = {
  summary: [
    {
      currency: 'USD',
      money_in_minor: 320000,
      spent_minor: SPEND.reduce((t, s) => t + s.amount_minor, 0),
      transfers_minor: 21000,
      categories: SPEND,
      merchants: MERCHANTS.map((m, i) => ({ merchant: m, amount_minor: 30000 - i * 4000, count: 5 - i })),
    },
  ],
}
const DAYS = Array.from({ length: 120 }, (_, i) => ({
  date: daysAgo(i),
  currency: 'USD',
  amount_minor: (i * 1733) % 9000,
  count: 1 + (i % 3),
  top: [{ merchant: MERCHANTS[i % 5], amount_minor: (i * 1733) % 9000, category: CATS[i % 5] }],
})).filter((d) => d.amount_minor > 0 && d.date.startsWith(String(today.getFullYear())))

// What each API path answers. First match wins.
// Budgets (#13): this month's and week's periods, with made-up daily totals.
const monthFrom = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)))
const monthTo = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)))
const weekFrom = daysAgo(today.getUTCDay())
const spentDays = (n, each) => Array.from({ length: Math.min(n, today.getUTCDate()) }, (_, i) => ({ date: daysAgo(i), amount_minor: each }))
const budget = (id, member, category, period, amount, days) => ({
  id: `eeeeeeee-0000-4000-8000-00000000000${id}`,
  member_user_id: member,
  category,
  period,
  amount_minor: amount,
  currency: 'USD',
  from: period === 'week' ? weekFrom : monthFrom,
  to: period === 'week' ? daysAhead(7 - today.getUTCDay()) : monthTo,
  spent_minor: days.reduce((t, d) => t + d.amount_minor, 0),
  days: [...days].reverse(),
  can_manage: true,
})
const BUDGETS = {
  today: iso(today),
  budgets: [
    budget(1, null, null, 'month', 300000, spentDays(10, 12000)),
    budget(2, null, 'FOOD_AND_DRINK', 'month', 60000, spentDays(8, 6500)),
    budget(3, null, 'ENTERTAINMENT', 'month', 10000, spentDays(3, 4000)),
    budget(4, ROBIN, null, 'week', 5000, spentDays(2, 1500)),
    budget(5, ME, 'PERSONAL_CARE', 'month', 8000, spentDays(1, 2500)),
  ],
  counting: [
    { user_id: ME, counted: true, automatic: false },
    { user_id: PAT, counted: false, automatic: false },
    { user_id: ROBIN, counted: true, automatic: true },
  ],
}

const ROUTES = [
  [/^\/api\/me$/, () => ({ user_id: ME, display_name: 'Sam Example', households: [{ id: HH, name: 'Example family', home_currency: 'USD', role: 'owner' }] })],
  [/^\/api\/consent$/, () => ({ versions: {}, needed: false })],
  [/^\/api\/backup-codes$/, () => ({ left: 8, total: 10, created_at: daysAgo(30) + 'T09:00:00Z' })],
  [/^\/api\/banks$/, () => ({ banks: BANKS })],
  [/^\/api\/households\/[^/]+\/members$/, () => ({ members: MEMBERS })],
  [/^\/api\/households\/[^/]+\/invites$/, () => ({ invites: [] })],
  [/^\/api\/sharing$/, () => ({ members: MEMBERS, given: { [PAT]: ['balances', 'transactions'] }, received: { [PAT]: ['balances'] } })],
  [/^\/api\/transactions\/summary$/, () => SUMMARY],
  [/^\/api\/transactions\/daily$/, () => ({ year: today.getFullYear(), days: DAYS })],
  [/^\/api\/transactions$/, () => ({ transactions: TXS, more: false })],
  [/^\/api\/spending$/, () => ({ month: iso(today).slice(0, 7), spending: SPEND })],
  [/^\/api\/budgets$/, () => BUDGETS],
]

// A fake session, unsigned: the app reads it from storage and never checks
// the signature (the Go API does, but it isn't running here). aal2 = signed
// in with 2FA; aal1 = password only, so the 2FA code screen shows.
function session(aal) {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const amr = [{ method: 'password', timestamp: now - 3600 }]
  if (aal === 'aal2') amr.push({ method: 'totp', timestamp: now - 3500 })
  const claims = {
    aud: 'authenticated',
    exp: now + 7200,
    iat: now,
    sub: ME,
    email: 'sam@example.com',
    role: 'authenticated',
    aal,
    amr,
    session_id: 'fake-session',
  }
  const factor = {
    id: 'ffffffff-0000-4000-8000-000000000001',
    factor_type: 'totp',
    status: 'verified',
    friendly_name: 'Fake phone',
    created_at: daysAgo(40) + 'T09:00:00Z',
    updated_at: daysAgo(40) + 'T09:00:00Z',
  }
  const user = {
    id: ME,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'sam@example.com',
    app_metadata: {},
    user_metadata: {},
    factors: [factor],
    created_at: daysAgo(60) + 'T09:00:00Z',
  }
  return {
    access_token: `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(claims)}.fake-signature`,
    token_type: 'bearer',
    expires_in: 7200,
    expires_at: now + 7200,
    refresh_token: 'fake-refresh-token',
    user,
  }
}

// Prepares a page: fake API answers, fake Supabase, and a session as asked
// ('aal2' signed in, 'aal1' at the 2FA code, null signed out).
export async function prepare(page, aal = 'aal2') {
  const s = aal ? session(aal) : null
  await page.addInitScript(
    ([key, value]) => {
      localStorage.clear()
      if (value) localStorage.setItem(key, value)
      localStorage.setItem('tallyn.lastActive', String(Date.now()))
    },
    [STORAGE_KEY, s ? JSON.stringify(s) : null],
  )
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    const hit = ROUTES.find(([re]) => re.test(url.pathname))
    if (!hit) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit[1](url)) })
  })
  await page.route(`${SUPABASE_URL}/**`, (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/user' && s) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(s.user) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}
