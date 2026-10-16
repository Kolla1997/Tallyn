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
    ['/api/transactions', { transactions: [] }],
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

  it('your balance, net worth and what you can see, in the home currency', async () => {
    answers()
    await open()
    expect(screen.getByRole('heading', { name: 'Test family' })).toBeInTheDocument()
    expect(screen.getByText('Hello, Sam')).toBeInTheDocument()
    const total = screen.getByRole('region', { name: 'Your balance' })
    has(total, '$3,500.00') // checking + savings, not the card
    has(total, '$3,200.00') // net worth: 3,500 - 300
    has(total, '$3,900.00') // everyone you can see: + Pat's 400
    has(total, '$400.00') // shared with you
    expect(within(total).getByText(/minus what you owe, \$300\.00/)).toBeInTheDocument()
  })

  it('Everyone switches the whole page to everyone you can see', async () => {
    answers()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }))
    const total = screen.getByRole('region', { name: 'Total balance' })
    has(total, '$3,900.00')
    has(total, '$3,600.00')
    expect(screen.getByRole('heading', { name: 'Everyone’s accounts' })).toBeInTheDocument()
  })

  it('your accounts: have, owe, and the biggest balances first', async () => {
    answers()
    await open()
    const yours = screen.getByRole('region', { name: 'Your accounts' })
    expect(within(yours).getByRole('link', { name: /You have.*\$3,500\.00.*2 accounts/ })).toBeInTheDocument()
    expect(within(yours).getByRole('link', { name: /You owe.*\$300\.00.*1 account/ })).toBeInTheDocument()
    const names = within(yours)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.name').textContent)
    expect(names).toEqual(['Rainy day savings', 'Everyday checking', 'Fake card'])
    expect(within(yours).getByRole('link', { name: 'All 3 accounts' })).toBeInTheDocument()
  })

  it('money shared with you is kept apart, per person', async () => {
    answers()
    await open()
    const shared = screen.getByRole('region', { name: 'Shared with you' })
    expect(within(shared).getByText('Pat')).toBeInTheDocument()
    expect(within(shared).getByText(/Shares balances · 1 account/)).toBeInTheDocument()
    expect(within(shared).getByText('$400.00')).toBeInTheDocument()
    expect(within(shared).getByText('owes nothing')).toBeInTheDocument()
  })

  it('spending this month by category, with shares and counts', async () => {
    answers()
    await open()
    const month = new Date().toLocaleDateString('en-US', { month: 'long' })
    const spending = screen.getByRole('region', { name: `Your spending in ${month}` })
    has(spending, '$60.00')
    expect(within(spending).getByText('Food and drink')).toBeInTheDocument()
    expect(within(spending).getByText('100% · 3 purchases')).toBeInTheDocument()
    expect(
      within(spending)
        .getByRole('link', { name: /Food and drink/ })
        .getAttribute('href'),
    ).toMatch(/category=FOOD_AND_DRINK&month=\d{4}-\d{2}/)
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

  it('says so when the money can’t load', async () => {
    answers({ error: new Error('internal') })
    await open()
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your household's money.")
  })
})
