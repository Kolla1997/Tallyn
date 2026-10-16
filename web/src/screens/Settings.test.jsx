import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'

// Settings → Sign-in and security (#23, Dinesh picked A): your authenticators
// (never remove the last), adding another, and backup codes.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
const mfa = { listFactors: vi.fn(), enroll: vi.fn(), unenroll: vi.fn(), challengeAndVerify: vi.fn() }
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      mfa: new Proxy(
        {},
        {
          get:
            (_, k) =>
            (...a) =>
              mfa[k](...a),
        },
      ),
      signOut: vi.fn(),
    },
  },
}))

const phone = { id: 'f1', status: 'verified', friendly_name: 'iPhone', created_at: '2026-10-08T10:00:00Z' }
const onePassword = { id: 'f2', status: 'verified', friendly_name: '1Password', created_at: '2026-10-16T10:00:00Z' }

async function openSecurity(factors, codes = { left: 8, total: 10 }) {
  mfa.listFactors.mockResolvedValue({ data: { totp: factors } })
  api.mockResolvedValue(codes)
  window.history.replaceState(null, '', '/settings?section=security')
  await act(async () => render(<Settings me={{ display_name: 'Test' }} household={null} email="you@example.com" onSaved={() => {}} onSignOut={() => {}} />))
}

describe('Settings: authenticators', () => {
  beforeEach(() => {
    api.mockReset()
    Object.values(mfa).forEach((f) => f.mockReset())
  })

  it('one authenticator: listed by name, and it can’t be removed', async () => {
    await openSecurity([phone])
    expect(screen.getByText('1 authenticator app')).toBeInTheDocument()
    expect(screen.getByText('iPhone')).toBeInTheDocument()
    expect(screen.getByText('Your only one')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('two: each can be removed, after a fresh code', async () => {
    await openSecurity([phone, onePassword])
    expect(screen.getByText('2 authenticator apps')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    const dialog = screen.getByRole('dialog', { name: 'Remove 1Password?' })
    expect(within(dialog).getByLabelText(/6-digit code/)).toBeInTheDocument()
  })

  it('adding: a name first (not a duplicate), then the QR code; cancelling removes the half-added one', async () => {
    await openSecurity([phone])
    mfa.enroll.mockResolvedValue({ data: { id: 'f9', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'FAKESECRET' } }, error: null })
    mfa.unenroll.mockResolvedValue({ error: null })
    fireEvent.click(screen.getByRole('button', { name: '+ Add another' }))
    const dialog = screen.getByRole('dialog', { name: 'Add another authenticator' })
    fireEvent.change(within(dialog).getByLabelText('Give it a name'), { target: { value: 'iphone' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Show the QR code' })))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('already have one with that name')
    expect(mfa.enroll).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Give it a name'), { target: { value: '1Password' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Show the QR code' })))
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', issuer: 'Tallyn', friendlyName: '1Password' })
    expect(within(dialog).getByRole('img', { name: /QR code/ })).toBeInTheDocument()
    expect(within(dialog).getByText('FAKESECRET')).toBeInTheDocument()
    await act(async () => fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cancel' })[0]))
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f9' })
  })
})

describe('Settings: backup codes', () => {
  beforeEach(() => {
    api.mockReset()
    Object.values(mfa).forEach((f) => f.mockReset())
  })

  it('shows how many are left, and Regenerate asks for a fresh code', async () => {
    await openSecurity([phone], { left: 8, total: 10 })
    expect(screen.getByText(/8 of 10 left/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    const dialog = screen.getByRole('dialog', { name: 'Get new backup codes?' })
    expect(within(dialog).getByText(/current codes stop working/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/6-digit code/)).toBeInTheDocument()
  })

  it('none yet: "Get codes"', async () => {
    await openSecurity([phone], { left: 0, total: 0 })
    expect(screen.getByText(/None yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get codes' })).toBeInTheDocument()
  })
})
