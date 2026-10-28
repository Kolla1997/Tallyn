import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeApi, callsTo } from '../test/fakeApi.js'
import BudgetsPage from './BudgetsPage.jsx'

// Budgets (#13), calm redesign (#187): household budgets with a pace pill and pace line, budgets for
// one person as day notches with today outlined, your counting switch, and Add / Change. Made up.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

const me = { user_id: 'u-me' }
const owner = { id: 'hh-1', role: 'owner', home_currency: 'USD' }
const days = (total, n) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, amount_minor: Math.round(total / n) }))
const BUDGETS = [
  // 96% used with 24 of 31 days gone: ahead of pace.
  {
    id: 'b1',
    category: 'FOOD_AND_DRINK',
    amount_minor: 100000,
    period: 'month',
    from: '2026-10-01',
    to: '2026-11-01',
    spent_minor: 96000,
    days: days(96000, 24),
    member_user_id: null,
    can_manage: true,
  },
  {
    id: 'b2',
    category: null,
    amount_minor: 8000,
    period: 'month',
    from: '2026-10-01',
    to: '2026-11-01',
    spent_minor: 2000,
    days: days(2000, 24),
    member_user_id: 'u-leo',
    can_manage: true,
  },
]
const MEMBERS = [
  { user_id: 'u-me', display_name: 'Sam', role: 'owner' },
  { user_id: 'u-leo', display_name: 'Leo', role: 'teen' },
]

function answers() {
  routeApi(api, [
    ['/api/budgets/counting', null],
    [
      '/api/budgets',
      (path, opts) =>
        opts?.method === 'POST'
          ? { id: 'b-new' }
          : {
              today: '2026-10-24',
              budgets: BUDGETS,
              counting: [
                { user_id: 'u-me', counted: false },
                { user_id: 'u-leo', counted: true, automatic: true },
              ],
            },
    ],
    ['/api/households/hh-1/members', { members: MEMBERS }],
    ['/api/plans', { plans: [] }],
    ['/api/plans/suggestion', { monthly_income_minor: 0 }],
  ])
}
const open = async () => act(async () => render(<BudgetsPage me={me} household={owner} refreshKey={0} />))

describe('BudgetsPage', () => {
  beforeEach(() => {
    api.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows household budgets with their pace, and one person’s days', async () => {
    answers()
    await open()
    const household = within(screen.getByRole('region', { name: 'Household budgets' }))
    expect(household.getByRole('heading', { name: 'Food and drink' })).toBeInTheDocument()
    expect(household.getByText('Ahead of pace')).toBeInTheDocument()
    expect(household.getByText('$40.00 left')).toBeInTheDocument()
    const person = within(screen.getByRole('region', { name: 'Budgets for one person' }))
    expect(person.getByRole('heading', { name: 'Leo' })).toBeInTheDocument()
    const notches = document.querySelectorAll('.day-notches i')
    expect(notches).toHaveLength(31)
    expect(document.querySelectorAll('.day-notches i.today')).toHaveLength(1)
    expect(screen.getByText(/Counting in household budgets: Leo \(teen, automatically\)/)).toBeInTheDocument()
  })

  it('turns your counting on, and adds a budget', async () => {
    answers()
    await open()
    await act(async () => fireEvent.click(screen.getByRole('switch', { name: /Count my spending/ })))
    expect(callsTo(api, '/api/budgets/counting', 'PUT')[0][1].body).toEqual({ household_id: 'hh-1', count: true })

    fireEvent.click(screen.getAllByRole('button', { name: 'Add a budget' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add a budget' })
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '250' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Week' }))
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Add budget' })))
    expect(callsTo(api, '/api/budgets', 'POST')[0][1].body).toMatchObject({ household_id: 'hh-1', member_user_id: '', period: 'week', amount_minor: 25000 })
  })
})
