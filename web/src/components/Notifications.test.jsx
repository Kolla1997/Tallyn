import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describe as words, groups, needsYou, when } from '../lib/notifications.js'

// In-app notifications (#267, draft C): the bell, its list and Home's strip.
// All data is made up.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
vi.mock('../screens/Banks.jsx', () => ({ ReconnectBank: ({ label }) => <button type="button">{label}</button> }))

const { NeedsYou, NotificationBell } = await import('./Notifications.jsx')

const now = new Date()
const LIST = [
  {
    id: 'n1',
    household_id: 'hh-1',
    kind: 'reconnect',
    ref_id: 'b1',
    data: { bank: 'Fake Bank' },
    needs_action: true,
    created_at: now.toISOString(),
    read: false,
    resolved: false,
  },
  {
    id: 'n2',
    household_id: 'hh-1',
    kind: 'big_purchase',
    ref_id: 't1',
    data: { merchant: 'Fake Store', amount_minor: 64218, currency: 'USD', account: 'Checking' },
    created_at: now.toISOString(),
    read: false,
    resolved: false,
  },
  {
    id: 'n3',
    household_id: 'hh-1',
    kind: 'joined',
    ref_id: 'u1',
    data: { name: 'Sam', household: 'Test family' },
    created_at: '2020-01-02T10:00:00Z',
    read: true,
    resolved: false,
  },
]

beforeEach(() => {
  api.mockReset()
  api.mockImplementation((path) => Promise.resolve(path === '/api/notifications' ? { notifications: structuredClone(LIST) } : null))
})

describe('notification words', () => {
  it('says what happened without account numbers, with money in tabular figures', () => {
    const big = words(LIST[1])
    expect(big.to).toBe('/transactions')
    expect(big.parts).toEqual(['You spent ', { b: '$642.18', money: true }, ' at Fake Store from Checking.'])
    expect(words({ kind: 'low_balance', data: { account: 'Checking', balance_minor: 8430, threshold_minor: 10000, currency: 'USD' } }).parts[2]).toBe(
      ', under your $100.00 alert.',
    )
    expect(words(LIST[0]).parts[0]).toEqual({ b: 'Fake Bank needs you to sign in again.' })
    // Someone else's alert names them (#268): a child's, or a partner's shared with you.
    expect(
      words({ kind: 'big_purchase', data: { person: 'Mia', merchant: 'Fake Store', amount_minor: 60000, currency: 'USD', account: 'Savings' } }).parts[0],
    ).toEqual({ b: 'Mia' })
    expect(words({ kind: 'reconnect', data: { person: 'Mia', bank: 'Fake Bank' } }).parts[1]).toBe(' Only Mia can do it.')
  })

  it('says when a payment is due, and when it is overdue (#269)', () => {
    const due = words({ kind: 'payment_due', data: { account: 'Fake Card', due_date: '2026-11-07', amount_minor: 2000, currency: 'USD' } })
    expect(due.to).toBe('/debts')
    expect(due.parts).toEqual(['Fake Card: ', { b: '$20.00', money: true }, ' ', 'due Saturday, Nov 7.'])
    const late = words({ kind: 'payment_due', data: { account: 'Fake Card', due_date: '2026-11-07', amount_minor: 2000, currency: 'USD', overdue: true } })
    expect(late.parts[0]).toEqual({ b: 'Fake Card payment is overdue.' })
  })

  it('groups Today and Earlier, and picks out what needs you', () => {
    expect(groups(LIST, now).map(([g, l]) => [g, l.length])).toEqual([
      ['Today', 2],
      ['Earlier', 1],
    ])
    expect(needsYou(LIST).map((n) => n.id)).toEqual(['n1'])
    expect(needsYou([{ ...LIST[0], resolved: true }])).toEqual([])
    expect(when('2026-11-02T15:00:00', new Date('2026-11-03T09:00:00'))).toBe('Yesterday')
  })
})

describe('NotificationBell', () => {
  it('shows the unread count, opens the list and adds it up', async () => {
    render(<NotificationBell />)
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    fireEvent.click(bell)
    const panel = screen.getByRole('region', { name: 'Notifications' })
    expect(within(panel).getByText('Today')).toBeInTheDocument()
    expect(within(panel).getByText('$642.18')).toHaveClass('tabular-nums')
    expect(within(panel).getByText('2 new')).toBeInTheDocument()
    expect(within(panel).getByText('1 needs you')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull()
  })

  it('Mark all read clears the count and tells the server', async () => {
    render(<NotificationBell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark all read' })))
    expect(api).toHaveBeenCalledWith('/api/notifications/read', { method: 'POST', body: {} })
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })
})

describe('closing alerts', () => {
  it('the × closes one; Close all closes a day; both tell the server', async () => {
    render(<NotificationBell />)
    fireEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))
    const panel = screen.getByRole('region', { name: 'Notifications' })
    await act(async () => fireEvent.click(within(panel).getAllByRole('button', { name: 'Close this alert' })[1]))
    expect(api).toHaveBeenCalledWith('/api/notifications/dismiss', { method: 'POST', body: { ids: ['n2'] } })
    expect(within(panel).queryByText(/Fake Store/)).toBeNull()
    await act(async () => fireEvent.click(within(panel).getAllByRole('button', { name: 'Close all' })[0]))
    expect(api).toHaveBeenLastCalledWith('/api/notifications/dismiss', { method: 'POST', body: { ids: ['n1'] } })
    expect(within(panel).queryByText('Today')).toBeNull()
  })

  it('a closed bank to reconnect stays on Home until it is fixed', async () => {
    api.mockImplementation((path) => Promise.resolve(path === '/api/notifications' ? { notifications: [{ ...LIST[0], dismissed: true, read: true }] } : null))
    render(<NeedsYou householdId="hh-1" />)
    expect(await screen.findByRole('status')).toHaveTextContent('Fake Bank needs you to sign in again.')
  })
})

describe('NeedsYou', () => {
  it('shows only alerts that need action, for this household, with Reconnect', async () => {
    render(<NeedsYou householdId="hh-1" />)
    const strip = await screen.findByRole('status')
    expect(strip).toHaveTextContent('Fake Bank needs you to sign in again.')
    expect(within(strip).getByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    expect(screen.queryByText(/Fake Store/)).toBeNull()
  })

  it('shows nothing for another household', async () => {
    const { container } = render(<NeedsYou householdId="hh-2" />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })
})
