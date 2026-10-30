// Made-up answers for /preview.html (#187): the Rivera family from the #185 drafts, in the shapes
// the screens' tests use. Dev only; nothing here reaches the build.
const ME = 'u-maya'
const acct = (id, name, type, subtype, minor, extra = {}) => ({
  id,
  name,
  type,
  subtype,
  currency: 'USD',
  current_balance_minor: minor,
  mask: id.slice(-4),
  ...extra,
})

const BANKS = [
  {
    id: 'b-chase',
    owner_user_id: ME,
    can_unlink: true,
    institution_name: 'Chase',
    status: 'active',
    last_synced_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
    accounts: [acct('a-4821', 'Everyday checking', 'depository', 'checking', 624018)],
  },
  {
    id: 'b-ally',
    owner_user_id: ME,
    can_unlink: true,
    institution_name: 'Ally',
    status: 'active',
    last_synced_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
    accounts: [
      acct('a-1180', 'High-yield savings', 'depository', 'savings', 1840000),
      acct('a-5512', 'Car loan', 'loan', 'auto', 1420000, {
        loan: {
          original_minor: 2200000,
          rate_percent: 6.4,
          next_payment_minor: 38600,
          next_payment_due_date: '2026-11-01',
          ytd_interest_minor: 75640,
          payoff_date: '2030-08-01',
          rate_type: 'fixed',
        },
      }),
    ],
  },
  {
    id: 'b-amex',
    owner_user_id: ME,
    can_unlink: true,
    institution_name: 'American Express',
    status: 'active',
    last_synced_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
    accounts: [
      acct('a-3006', 'Amex Gold', 'credit', 'credit card', 128640, {
        credit_limit_minor: 500000,
        card: {
          aprs: [{ percent: 24.99, type: 'purchase_apr' }],
          minimum_payment_minor: 3500,
          next_payment_due_date: '2026-10-28',
          is_overdue: false,
        },
      }),
    ],
  },
  {
    id: 'b-monzo',
    owner_user_id: ME,
    can_unlink: true,
    institution_name: 'Monzo',
    status: 'needs_reauth',
    accounts: [{ ...acct('a-0392', 'UK current account', 'depository', 'checking', 215000), currency: 'GBP' }],
  },
  {
    id: 'b-james',
    owner_user_id: 'u-james',
    institution_name: 'Chase',
    status: 'active',
    accounts: [acct('a-7713', 'Joint checking', 'depository', 'checking', 391255)],
  },
]
const MEMBERS = [
  { user_id: ME, display_name: 'Maya', role: 'owner', is_you: true },
  { user_id: 'u-james', display_name: 'James', role: 'adult' },
  { user_id: 'u-leo', display_name: 'Leo', role: 'teen' },
]
const DAY = (d) => `2026-10-${String(d).padStart(2, '0')}`
const tx = (id, d, merchant, cat, minor, owner = ME, extra = {}) => ({
  id,
  owner_user_id: owner,
  amount_minor: minor,
  currency: 'USD',
  date: DAY(d),
  merchant,
  category_primary: cat,
  bank_name: owner === ME ? 'Chase' : 'Chase',
  account_mask: owner === ME ? '4821' : '7713',
  ...extra,
})
const TXS = [
  tx('t1', 24, 'Whole Foods', 'FOOD_AND_DRINK', 8640, ME, { pending: true }),
  tx('t2', 24, 'Shell', 'TRANSPORTATION', 4810, 'u-james'),
  tx('t3', 23, 'Little Sprouts', 'GENERAL_SERVICES', 12000, 'u-james'),
  tx('t4', 23, 'Spotify', 'ENTERTAINMENT', 1699),
  tx('t5', 22, 'Nando’s', 'FOOD_AND_DRINK', 3875),
  // A place, for the map in the details (#60). Made up, like the rest.
  tx('t6', 22, 'Trader Joe’s', 'FOOD_AND_DRINK', 6430, ME, {
    whereabouts: { address: '142 E 14th St', city: 'New York', region: 'NY', postal_code: '10003', lat: 40.7339, lon: -73.9887 },
  }),
  tx('t7', 21, 'Con Edison', 'RENT_AND_UTILITIES', 14500, 'u-james'),
  tx('t8', 20, 'MTA', 'TRANSPORTATION', 3400),
  tx('t9', 18, 'Paycheck', 'INCOME', -320000, ME, { category_primary: 'INCOME' }),
]
const SUMMARY = {
  summary: [
    {
      currency: 'USD',
      spent_minor: 348600,
      money_in_minor: 601000,
      categories: [
        { category: 'RENT_AND_UTILITIES', currency: 'USD', amount_minor: 164000, count: 4 },
        { category: 'FOOD_AND_DRINK', currency: 'USD', amount_minor: 107600, count: 21 },
        { category: 'GENERAL_SERVICES', currency: 'USD', amount_minor: 42000, count: 3 },
        { category: 'TRANSPORTATION', currency: 'USD', amount_minor: 19000, count: 9 },
        { category: 'ENTERTAINMENT', currency: 'USD', amount_minor: 16000, count: 6 },
      ],
      merchants: [
        { merchant: 'Con Edison', amount_minor: 14500, count: 1 },
        { merchant: 'Little Sprouts', amount_minor: 12000, count: 1 },
        { merchant: 'Whole Foods', amount_minor: 8640, count: 1 },
      ],
    },
  ],
}
const DAILY_AMOUNTS = [1495, 62, 48, 90, 35, 120, 40, 55, 37.68, 30, 85, 170, 60, 110, 45, 72, 88, 64, 130, 75.2, 157.4, 145.23, 136.99, 134.5]
const DAILY = { days: DAILY_AMOUNTS.map((v, i) => ({ date: DAY(i + 1), currency: 'USD', amount_minor: Math.round(v * 100), count: 3, top: [] })) }
const months = (pairs) => pairs.map(([m, v]) => ({ month: `2026-${m}-01`, saved_minor: v }))
const GOALS = [
  {
    id: 'g-beach',
    owner_user_id: ME,
    name: 'Beach trip',
    target_minor: 500000,
    currency: 'USD',
    by_month: '2027-06-01',
    account_id: null,
    visibility: 'member',
    shared_with: 'u-james',
    can_manage: true,
    saved_minor: 340000,
    history: months([
      ['05', 240000],
      ['06', 260000],
      ['07', 290000],
      ['08', 315000],
      ['09', 340000],
    ]),
  },
  {
    id: 'g-paris',
    owner_user_id: ME,
    name: 'Paris trip',
    target_minor: 250000,
    currency: 'EUR',
    by_month: '2027-08-01',
    account_id: null,
    visibility: 'me',
    shared_with: null,
    can_manage: true,
    saved_minor: 80000,
    history: months([
      ['08', 60000],
      ['09', 70000],
      ['10', 80000],
    ]),
  },
  {
    id: 'g-car',
    owner_user_id: 'u-james',
    name: 'James’s new car',
    target_minor: 800000,
    currency: 'USD',
    by_month: null,
    account_id: 'a-9',
    visibility: 'everyone',
    shared_with: null,
    can_manage: false,
    saved_minor: null,
    history: null,
  },
]
// A budget's spending spread over its days so far, adding up to what it has spent.
const spread = (minor, from, n) => {
  const start = Date.parse(from)
  const w = Array.from({ length: n }, (_, i) => 1 + ((i * 7) % 5))
  const sum = w.reduce((a, b) => a + b, 0)
  const days = w.map((x, i) => ({ date: new Date(start + i * 86400e3).toISOString().slice(0, 10), amount_minor: Math.floor((minor * x) / sum) }))
  days[n - 1].amount_minor += minor - days.reduce((a, d) => a + d.amount_minor, 0)
  return days
}
const BUDGETS = [
  {
    id: 'bu1',
    category: 'RENT_AND_UTILITIES',
    amount_minor: 170000,
    period: 'month',
    from: '2026-10-01',
    to: '2026-11-01',
    spent_minor: 164000,
    days: spread(164000, '2026-10-01', 24),
    member_user_id: null,
    can_manage: true,
  },
  {
    id: 'bu2',
    category: 'FOOD_AND_DRINK',
    amount_minor: 90000,
    period: 'month',
    from: '2026-10-01',
    to: '2026-11-01',
    spent_minor: 81200,
    days: spread(81200, '2026-10-01', 24),
    member_user_id: null,
    can_manage: true,
  },
  {
    id: 'bu3',
    category: 'GENERAL_SERVICES',
    amount_minor: 50000,
    period: 'month',
    from: '2026-10-01',
    to: '2026-11-01',
    spent_minor: 42000,
    days: spread(42000, '2026-10-01', 24),
    member_user_id: null,
    can_manage: true,
  },
  {
    id: 'bu4',
    category: 'ENTERTAINMENT',
    amount_minor: 4000,
    period: 'week',
    from: '2026-10-19',
    to: '2026-10-26',
    spent_minor: 1800,
    days: spread(1800, '2026-10-19', 6),
    member_user_id: 'u-leo',
    can_manage: true,
  },
]
const PLAN = {
  id: 'p1',
  member_user_id: null,
  monthly_income_minor: 640000,
  currency: 'USD',
  template: '55-5-10-15-15',
  shares: { essentials: 55, guilt_free: 5, debt: 10, short_term: 15, long_term: 15 },
  from: '2026-10-01',
  to: '2026-11-01',
  progress: { essentials: 306200, guilt_free: 42400, debt: 38600, short_term: 50000, long_term: 0 },
  can_manage: true,
}

const ROUTES = [
  ['/api/me', { user_id: ME, display_name: 'Maya', households: [{ id: 'hh-1', name: 'The Rivera family', role: 'owner', home_currency: 'USD' }] }],
  ['/api/banks', { banks: BANKS }],
  [/\/api\/households\/[^/]+\/members/, { members: MEMBERS }],
  [
    /\/api\/households\/[^/]+\/invites/,
    { invites: [{ id: 'i1', email: 'rosa.martinez@fastmail.com', role: 'viewer', created_at: '2026-10-22T10:00:00Z', expires_at: '2026-10-29T10:00:00Z' }] },
  ],
  ['/api/transactions/summary', SUMMARY],
  ['/api/transactions/daily', DAILY],
  ['/api/transactions', { transactions: TXS }],
  ['/api/goals', { goals: GOALS }],
  [
    '/api/budgets',
    {
      today: '2026-10-24',
      budgets: BUDGETS,
      counting: [
        { user_id: ME, counted: true },
        { user_id: 'u-james', counted: true },
        { user_id: 'u-leo', counted: true, automatic: true },
      ],
    },
  ],
  ['/api/plans/suggestion', { monthly_income_minor: 640000 }],
  ['/api/plans', { plans: [PLAN] }],
  ['/api/sharing', { given: { 'u-james': ['balances', 'transactions'] }, received: { 'u-james': ['balances'] } }],
  ['/api/backup-codes', { left: 7, total: 10 }],
  ['/api/consent', { terms: 'current', privacy: 'current' }],
]

export async function fakeApi(path, opts = {}) {
  if (opts.method && opts.method !== 'GET') return null
  const hit = ROUTES.find(([m]) => (m instanceof RegExp ? m.test(path) : path.startsWith(m)))
  if (!hit) {
    console.warn('preview: no fake answer for', path)
    return {}
  }
  return structuredClone(hit[1])
}
