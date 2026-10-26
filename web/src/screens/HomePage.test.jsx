import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeApi } from '../test/fakeApi.js'
import HomePage from './HomePage.jsx'

// Home (#114): your balance and net worth, Yours / Everyone, your accounts,
// money shared with you, spending this month, and who may link a bank.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
vi.mock('react-plaid-link', () => ({ usePlaidLink: () => ({ open: vi.fn(), ready: false }) }))

const me = { user_id: 'u-me', display_name: 'Sam' }
const owner = { id: 'hh-1', name: 'Test family', role: 'owner', home_currency: 'USD' }
const acct = (id, name, type, minor, extra = {}) => ({ id, name, type, subtype: type, currency: 'USD', current_balance_minor: minor, mask: '0000', ...extra })
const BANKS = [
  {
    id: 'b-1',
    owner_user_id: 'u-me',
    institution_name: 'Fake Credit Union',
    status: 'active',
    accounts: [
      acct('a-1', 'Everyday checking', 'depository', 100000),
      acct('a-2', 'Rainy day savings', 'depository', 250000),
      acct('a-3', 'Fake card', 'credit', 30000),
    ],
  },
  { id: 'b-2', owner_user_id: 'u-pat', institution_name: 'Fake Bank', status: 'active', accounts: [acct('a-4', 'Pat checking', 'depository', 40000)] },
]
const MEMBERS = [
  { user_id: 'u-me', display_name: 'Sam', role: 'owner', is_you: true },
  { user_id: 'u-pat', display_name: 'Pat', role: 'adult' },
]
const SPENDING = { summary: [{ currency: 'USD', categories: [{ category: 'FOOD_AND_DRINK', currency: 'USD', amount_minor: 6000, count: 3 }] }] }

function answers({ banks = BANKS, error } = {}) {
  routeApi(api, [
    ['/api/banks', error ?? { banks }],
    ['/api/households/hh-1/members', { members: MEMBERS }],
    ['/api/transactions/summary', SPENDING],
    ['/api/transactions/daily', { days: [] }],
    ['/api/transactions', { transactions: [] }],
    ['/api/goals', { goals: [] }],
  ])
}

async function open(household = owner) {
  await act(async () => render(<HomePage me={me} household={household} refreshKey={0} onChanged={() => {}} />))
}

// CountUp shows a number twice (on screen and for screen readers).
const has = (scope, text) => expect(within(scope).getAllByText(text).length).toBeGreaterThan(0)

describe('HomePage', () => {
  beforeEach(() => {
    api.mockReset()
  })

  // Home in the calm redesign (#187): the total on dark with net worth and what's owed, Yours /
  // Everyone, your accounts biggest first, cards, money shared with you, the spending trend.
  it('your balance and net worth, in the home currency', async () => {
    answers()
    await open()
    expect(screen.getByRole('heading', { name: 'Test family' })).toBeInTheDocument()
    expect(screen.getByText('Hello, Sam')).toBeInTheDocument()
    const total = screen.getByRole('region', { name: 'Your balance' })
    has(total, '$3,500.00') // checking + savings, not the card
    has(total, '$3,200.00') // net worth: 3,500 - 300
    expect(within(total).getByText(/after \$300\.00 owed on cards and loans/)).toBeInTheDocument()
  })

  it('Everyone switches the whole page to everyone you can see', async () => {
    answers()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }))
    const total = screen.getByRole('region', { name: 'Total balance' })
    has(total, '$3,900.00') // + Pat's 400
    has(total, '$3,600.00')
    expect(screen.getByRole('heading', { name: 'Everyone’s accounts' })).toBeInTheDocument()
  })

  it('your accounts: what you have, biggest first, and a link to all of them', async () => {
    answers()
    await open()
    const yours = screen.getByRole('region', { name: 'Your accounts' })
    const names = within(yours)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.name').textContent)
    expect(names).toEqual(['Rainy day savings', 'Everyday checking'])
    expect(within(yours).getByRole('link', { name: 'All 3 accounts' })).toBeInTheDocument()
    const card = screen.getByRole('region', { name: 'Credit card' })
    expect(within(card).getByText('$300.00')).toBeInTheDocument()
  })

  it('money shared with you is kept apart, with whose it is', async () => {
    answers()
    await open()
    const shared = screen.getByRole('region', { name: 'Shared with you' })
    expect(within(shared).getByText('Pat checking')).toBeInTheDocument()
    expect(within(shared).getByText(/From Pat/)).toBeInTheDocument()
    expect(within(shared).getByText('$400.00')).toBeInTheDocument()
  })

  it('spent this month comes from the month summary, not recent transactions (#147)', async () => {
    routeApi(api, [
      ['/api/banks', { banks: BANKS }],
      ['/api/households/hh-1/members', { members: MEMBERS }],
      ['/api/transactions/summary', { summary: [{ ...SPENDING.summary[0], spent_minor: 237926, money_in_minor: 500000 }] }],
      ['/api/transactions', { transactions: [] }], // older spending is past the recent list
    ])
    await open()
    expect(screen.getByText(/−\$2,379\.26 spent this month/)).toBeInTheDocument()
    const month = new Date().toLocaleDateString('en-US', { month: 'long' })
    expect(within(screen.getByRole('region', { name: `Your spending in ${month}` })).getByText('$2,379.26')).toBeInTheDocument()
  })

  it('nothing spent this month: no figure', async () => {
    answers()
    await open()
    expect(screen.queryByText(/spent this month/)).not.toBeInTheDocument()
  })

  it('only owners and adults can link a bank', async () => {
    answers()
    await open()
    expect(screen.getByRole('button', { name: 'Link a bank' })).toBeInTheDocument()
    api.mockReset()
    answers({ banks: [] })
    document.body.innerHTML = ''
    await open({ ...owner, role: 'viewer' })
    expect(screen.queryByRole('button', { name: 'Link a bank' })).toBeNull()
    expect(screen.getByText('You don’t have any banks linked.')).toBeInTheDocument()
  })

  it('no banks yet: says how to start', async () => {
    answers({ banks: [] })
    await open()
    expect(screen.getByText('Link a bank to see your total.')).toBeInTheDocument()
    expect(screen.getByText('You haven’t linked a bank yet. Use Link a bank above.')).toBeInTheDocument()
  })

  it('a first load that fails offers Try again, not a loader that never stops (#151)', async () => {
    answers({ error: new Error('internal') })
    await open()
    expect(screen.getByRole('heading', { name: "We couldn't load your money" })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    answers()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(screen.queryByRole('heading', { name: "We couldn't load your money" })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Your accounts' })).toBeInTheDocument()
  })

  it('a reload that fails keeps the money on screen, with a banner (#151)', async () => {
    answers()
    const { rerender } = await act(async () => render(<HomePage me={me} household={owner} refreshKey={0} onChanged={() => {}} />))
    answers({ error: new Error('internal') })
    await act(async () => rerender(<HomePage me={me} household={owner} refreshKey={1} onChanged={() => {}} />))
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't update your money just now.")
    expect(screen.getByRole('region', { name: 'Your accounts' })).toBeInTheDocument()
  })
})
