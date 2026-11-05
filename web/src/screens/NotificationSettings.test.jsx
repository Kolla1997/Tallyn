import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Settings → Notifications (#268, draft C). Made-up people: Alex (you, owner),
// Sam (adult) and Mia (child).
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
const { default: NotificationSettings } = await import('./NotificationSettings.jsx')

const me = { user_id: 'u-alex' }
const household = { id: 'hh-1', name: 'Test family', role: 'owner' }
const MEMBERS = [
  { user_id: 'u-alex', display_name: 'Alex', role: 'owner' },
  { user_id: 'u-sam', display_name: 'Sam', role: 'adult' },
  { user_id: 'u-mia', display_name: 'Mia', role: 'child' },
]
const SETTINGS = {
  big_purchase: true,
  big_purchase_minor: 50000,
  low_balance: true,
  low_balance_minor: 10000,
  joined: true,
  share_with: null,
  email_reconnect: false,
  email_payment_due: false,
  email_kid_reconnect: [],
  email_weekly: false,
  email_include_shared: false,
  email_monthly: false,
  time_zone: null,
}

beforeEach(() => {
  api.mockReset()
  api.mockImplementation((path, opts) => {
    if (opts?.method === 'PUT') return Promise.resolve(null)
    if (path.startsWith('/api/notifications/settings')) return Promise.resolve({ ...SETTINGS })
    if (path === '/api/me/news') return Promise.resolve({ on: true, set: true })
    return Promise.resolve({ members: MEMBERS })
  })
})

const lastPut = () => api.mock.calls.filter(([, o]) => o?.method === 'PUT').pop()?.[1].body

describe('NotificationSettings', () => {
  it('product news: its own switch, saved for you, not the household (#281)', async () => {
    render(<NotificationSettings me={me} household={household} />)
    const sw = await screen.findByRole('switch', { name: 'Product news email' })
    expect(sw).toBeChecked()
    await act(async () => fireEvent.click(sw))
    const put = api.mock.calls.filter(([p, o]) => p === '/api/me/news' && o?.method === 'PUT').pop()
    expect(put[1].body).toEqual({ on: false })
    expect(sw).not.toBeChecked()
  })

  it('shows each alert with its switch and amount, and email off by default', async () => {
    render(<NotificationSettings me={me} household={household} />)
    expect(await screen.findByRole('switch', { name: 'Big purchase alerts' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Big purchase amount' })).toHaveValue('500')
    expect(screen.getByRole('textbox', { name: 'Low balance amount' })).toHaveValue('100')
    expect(screen.getByRole('switch', { name: 'Email when a bank needs reconnecting' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: "Email me when Mia's bank needs reconnecting" })).not.toBeChecked()
  })

  it("turns on emails, and a child's reconnect emails (#269)", async () => {
    render(<NotificationSettings me={me} household={household} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Email when a payment is due' }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ email_payment_due: true })
    fireEvent.click(screen.getByRole('switch', { name: "Email me when Mia's bank needs reconnecting" }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ email_kid_reconnect: ['u-mia'] })
    fireEvent.click(screen.getByRole('switch', { name: "Email me when Mia's bank needs reconnecting" }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ email_kid_reconnect: [] })
  })

  it('saves a switch and a new amount, and the sample follows the typing', async () => {
    render(<NotificationSettings me={me} household={household} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Low balance alerts' }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ low_balance: false })
    const amt = screen.getByRole('textbox', { name: 'Big purchase amount' })
    fireEvent.change(amt, { target: { value: '750' } })
    expect(screen.getByText('$750.00')).toBeInTheDocument()
    await act(async () => fireEvent.blur(amt))
    expect(lastPut()).toMatchObject({ big_purchase_minor: 75000 })
  })

  it('turns on the weekly summary, then what is shared, and saves the time zone (#273)', async () => {
    render(<NotificationSettings me={me} household={household} />)
    const shared = await screen.findByRole('switch', { name: "Include what's shared with me in the summaries" })
    expect(shared).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Weekly summary email' }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ email_weekly: true, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    expect(shared).not.toBeDisabled()
    fireEvent.click(shared)
    await act(async () => {})
    expect(lastPut()).toMatchObject({ email_include_shared: true })
  })

  it('turns on monthly highlights, which also lets what is shared be included (#274)', async () => {
    render(<NotificationSettings me={me} household={household} />)
    const shared = await screen.findByRole('switch', { name: "Include what's shared with me in the summaries" })
    fireEvent.click(screen.getByRole('switch', { name: 'Monthly highlights email' }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ email_monthly: true })
    expect(shared).not.toBeDisabled()
  })

  it('turns down an amount that is not a positive number', async () => {
    render(<NotificationSettings me={me} household={household} />)
    const amt = await screen.findByRole('textbox', { name: 'Low balance amount' })
    const before = api.mock.calls.length
    fireEvent.change(amt, { target: { value: 'abc' } })
    fireEvent.blur(amt)
    expect(amt).toHaveAttribute('aria-invalid', 'true')
    expect(amt).toHaveAccessibleDescription('Enter an amount over $0.') // said, not only red (#153)
    expect(api.mock.calls.length).toBe(before)
  })

  it('shares with a partner, and says kids alerts always come to the adults', async () => {
    render(<NotificationSettings me={me} household={household} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Share my alerts with Sam' }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ share_with: 'u-sam' })
    expect(screen.getByText(/Mia never gets yours/)).toBeInTheDocument()
    // Mia's alerts in the app can't be turned off; only her reconnect emails can be asked for (#269).
    expect(screen.getAllByRole('switch', { name: /Mia/ }).map((s) => s.getAttribute('aria-label'))).toEqual(["Email me when Mia's bank needs reconnecting"])
  })

  it('shows no who-else section to a child', async () => {
    render(<NotificationSettings me={{ user_id: 'u-mia' }} household={{ ...household, role: 'child' }} />)
    await screen.findByRole('switch', { name: 'Big purchase alerts' })
    expect(screen.queryByText('Who else hears')).toBeNull()
  })
})
