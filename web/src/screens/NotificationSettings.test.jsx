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
const SETTINGS = { big_purchase: true, big_purchase_minor: 50000, low_balance: true, low_balance_minor: 10000, joined: true, share_with: null }

beforeEach(() => {
  api.mockReset()
  api.mockImplementation((path, opts) => {
    if (opts?.method === 'PUT') return Promise.resolve(null)
    if (path.startsWith('/api/notifications/settings')) return Promise.resolve({ ...SETTINGS })
    return Promise.resolve({ members: MEMBERS })
  })
})

const lastPut = () => api.mock.calls.filter(([, o]) => o?.method === 'PUT').pop()?.[1].body

describe('NotificationSettings', () => {
  it('shows each alert with its switch and amount, and email as coming soon', async () => {
    render(<NotificationSettings me={me} household={household} />)
    expect(await screen.findByRole('switch', { name: 'Big purchase alerts' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Big purchase amount' })).toHaveValue('500')
    expect(screen.getByRole('textbox', { name: 'Low balance amount' })).toHaveValue('100')
    expect(screen.getByRole('switch', { name: /Email when a bank needs reconnecting/ })).toBeDisabled()
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

  it('turns down an amount that is not a positive number', async () => {
    render(<NotificationSettings me={me} household={household} />)
    const amt = await screen.findByRole('textbox', { name: 'Low balance amount' })
    const before = api.mock.calls.length
    fireEvent.change(amt, { target: { value: 'abc' } })
    fireEvent.blur(amt)
    expect(amt).toHaveAttribute('aria-invalid', 'true')
    expect(api.mock.calls.length).toBe(before)
  })

  it('shares with a partner, and says kids alerts always come to the adults', async () => {
    render(<NotificationSettings me={me} household={household} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Share my alerts with Sam' }))
    await act(async () => {})
    expect(lastPut()).toMatchObject({ share_with: 'u-sam' })
    expect(screen.getByText(/Mia never gets yours/)).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /Mia/ })).toBeNull()
  })

  it('shows no who-else section to a child', async () => {
    render(<NotificationSettings me={{ user_id: 'u-mia' }} household={{ ...household, role: 'child' }} />)
    await screen.findByRole('switch', { name: 'Big purchase alerts' })
    expect(screen.queryByText('Who else hears')).toBeNull()
  })
})
