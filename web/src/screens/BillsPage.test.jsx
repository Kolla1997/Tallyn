import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, routeApi } from '../test/fakeApi.js'
import BillsPage from './BillsPage.jsx'

// Bills (#127, Dinesh picked C of the calendar draft). All names and amounts are made up.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

const household = { id: 'hh-1', name: 'Test home', role: 'owner', home_currency: 'USD' }
const bill = (id, name, day, amount, extra = {}) => ({
  id,
  name,
  category: null,
  amount_minor: amount,
  currency: 'USD',
  varies: false,
  frequency: 'monthly',
  due_day: day,
  starts_on: '2026-11',
  paused: false,
  note: null,
  ...extra,
})
const BILLS = [bill('rent', 'Rent', 1, 150000), bill('net', 'Internet', 3, 7000), bill('gas', 'Gas', 9, 6490, { varies: true })]
const DUES = [
  { bill_id: 'rent', due: '2026-11-01', status: 'paid', expected_minor: 150000, paid_minor: 150000, paid_on: '2026-11-01', match: null },
  { bill_id: 'net', due: '2026-11-03', status: 'late', expected_minor: 7000, paid_minor: null, paid_on: null, match: null },
  {
    bill_id: 'gas',
    due: '2026-11-09',
    status: 'due',
    expected_minor: 6490,
    paid_minor: null,
    paid_on: null,
    match: { transaction_id: 't1', name: 'City Gas', amount_minor: 7135, date: '2026-11-08' },
  },
]

function answers(bills = BILLS, dues = DUES) {
  routeApi(api, [
    [/^\/api\/bills\/[a-z]+\/payments\//, null],
    ['/api/bills', (path, opts) => (opts?.method === 'POST' ? { id: 'new' } : { today: '2026-11-09', month: '2026-11', bills, dues })],
  ])
}
const open = async () => act(async () => render(<BillsPage household={household} refreshKey={0} />))

describe('BillsPage', () => {
  beforeEach(() => {
    api.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-09T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the month, today with late bills and a bank match first, and what is left', async () => {
    answers()
    await open()
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
    expect(screen.getByText('3 bills · $1,634.90 this month')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday, November 9, 1 bill, today' })).toHaveAttribute('aria-pressed', 'true')
    const side = within(screen.getByRole('complementary'))
    expect(side.getByText(/City Gas \$71\.35 on Nov 8 looks like Gas/)).toBeInTheDocument()
    expect(side.getByText('Late')).toBeInTheDocument()
    expect(side.getByText('Internet')).toBeInTheDocument()
    expect(side.getByText('$134.90')).toBeInTheDocument() // left: 70.00 + 64.90
    expect(side.getByText(/Paid \$1,500\.00 of \$1,634\.90/)).toBeInTheDocument()
  })

  it('marks a bill paid at its amount', async () => {
    answers()
    await open()
    const side = within(screen.getByRole('complementary'))
    await act(async () => fireEvent.click(side.getAllByRole('button', { name: 'Mark paid' })[0]))
    const [[path, opts]] = callsTo(api, '/api/bills/net/payments/2026-11-03', 'PUT')
    expect(path).toBe('/api/bills/net/payments/2026-11-03')
    expect(opts.body).toEqual({ paid_minor: 7000, paid_on: '2026-11-09' })
  })

  it('takes the bank match into the paid dialog', async () => {
    answers()
    await open()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, mark paid' })))
    const dialog = within(screen.getByRole('dialog', { name: 'Gas · due Nov 9' }))
    expect(dialog.getByLabelText('Amount paid (USD)')).toHaveValue('71.35')
    expect(dialog.getByLabelText('Paid on')).toHaveValue('2026-11-08')
    await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Mark paid' })))
    const [[, opts]] = callsTo(api, '/api/bills/gas/payments/2026-11-09', 'PUT')
    expect(opts.body).toEqual({ paid_minor: 7135, paid_on: '2026-11-08', transaction_id: 't1' })
  })

  it('picks another day', async () => {
    answers()
    await open()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Sunday, November 1, 1 bill/ })))
    const side = within(screen.getByRole('complementary'))
    expect(side.getByRole('heading', { name: 'Sunday, November 1' })).toBeInTheDocument()
    expect(side.getByText('Paid Nov 1')).toBeInTheDocument()
    expect(side.queryByText('Late')).not.toBeInTheDocument()
  })

  it('adds a bill', async () => {
    answers([], [])
    await open()
    expect(screen.getByRole('heading', { name: 'No bills yet' })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Add a bill' })[0]))
    const dialog = within(screen.getByRole('dialog', { name: 'Add a bill' }))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Rent' } })
    fireEvent.change(dialog.getByLabelText('Amount (USD)'), { target: { value: '1,500' } })
    fireEvent.change(dialog.getByLabelText('Due on day'), { target: { value: '1' } })
    await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Add bill' })))
    const [[, opts]] = callsTo(api, '/api/bills', 'POST')
    expect(opts.body).toMatchObject({ household_id: 'hh-1', name: 'Rent', amount_minor: 150000, due_day: 1, frequency: 'monthly', starts_on: '2026-11' })
  })

  it('shows a linked card on its due day, read-only, with its minimum in Left to pay', async () => {
    routeApi(api, [
      ['/api/bills', { today: '2026-11-09', month: '2026-11', bills: BILLS, dues: DUES }],
      [
        '/api/banks',
        {
          banks: [
            {
              accounts: [
                {
                  id: 'a-amex',
                  name: 'Gold Card',
                  mask: '3006',
                  currency: 'USD',
                  card: {
                    next_payment_due_date: '2026-11-20',
                    minimum_payment_minor: 4000,
                    last_statement_balance_minor: 125840,
                    last_statement_date: '2026-10-25',
                  },
                },
              ],
            },
          ],
        },
      ],
    ])
    await open()
    expect(screen.getByText('4 bills · $1,674.90 this month')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Friday, November 20, 1 bill/ })))
    const side = within(screen.getByRole('complementary'))
    expect(side.getByText('Gold Card ••3006')).toBeInTheDocument()
    expect(side.getByText('Statement $1,258.40')).toBeInTheDocument()
    expect(side.getByRole('link', { name: 'Open in Debts' })).toHaveAttribute('href', '/debts')
    expect(side.queryByRole('button', { name: 'Mark paid' })).not.toBeInTheDocument()
    expect(side.getByText('$174.90')).toBeInTheDocument() // 70.00 + 64.90 + 40.00 minimum
  })

  it('tells non-owners bills are for owners', async () => {
    routeApi(api, [['/api/bills', Object.assign(new Error('forbidden'), { status: 403 })]])
    await open()
    expect(screen.getByRole('heading', { name: 'Bills are for household owners' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a bill' })).not.toBeInTheDocument()
  })
})
