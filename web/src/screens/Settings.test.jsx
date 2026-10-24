import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'

// Settings → Sign-in and security (#23, Dinesh picked A): your authenticators
// (never remove the last), adding another, and backup codes.
const api = vi.fn()
const apiFile = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a), apiFile: (...a) => apiFile(...a) }))
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

  it('Sign out says it ends every session, as it does (#92, #1)', async () => {
    await openSecurity([phone])
    expect(screen.getByText('Everywhere you’re signed in')).toBeInTheDocument()
    expect(screen.queryByText('Of this device')).toBeNull()
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

describe('Settings: profile, legal and coming soon (#114)', () => {
  beforeEach(() => {
    api.mockReset()
    Object.values(mfa).forEach((f) => f.mockReset())
  })

  async function openSection(section) {
    window.history.replaceState(null, '', `/settings?section=${section}`)
    const onSaved = vi.fn()
    await act(async () =>
      render(
        <Settings
          me={{ display_name: 'Sam' }}
          household={{ id: 'hh-1', name: 'Test family', role: 'owner' }}
          email="you@example.com"
          onSaved={onSaved}
          onSignOut={() => {}}
        />,
      ),
    )
    return onSaved
  }

  it('saves your name and says how your family sees you', async () => {
    api.mockResolvedValue(null)
    const onSaved = await openSection('profile')
    fireEvent.change(screen.getByLabelText('Your name, as your family sees it'), { target: { value: 'Alex' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(api).toHaveBeenCalledWith('/api/me', { method: 'PUT', body: { display_name: 'Alex' } })
    expect(screen.getByRole('status')).toHaveTextContent('Saved. Your family now sees you as Alex.')
    expect(onSaved).toHaveBeenCalled()
  })

  it('says when your name can’t be saved', async () => {
    api.mockRejectedValue(new Error('invalid_name'))
    await openSection('profile')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't save your name.")
  })

  it('legal: both documents with their versions', async () => {
    await openSection('legal')
    expect(screen.getByRole('link', { name: /Terms of Service.*Version/ })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: /Privacy Policy.*Version/ })).toHaveAttribute('href', '/privacy')
  })

  it('what isn’t built yet says so, without links to tickets', async () => {
    await openSection('notifications')
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0)
    expect(document.querySelector('a[href*="github.com"]')).toBeNull()
  })

  // Download your data (#54): a fresh code first, then the ZIP from the server.
  describe('download your data', () => {
    const enterCode = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }))
      const dialog = screen.getByRole('dialog', { name: 'Download your data?' })
      expect(within(dialog).getByText(/Only your own data/)).toBeInTheDocument()
      fireEvent.change(within(dialog).getByLabelText(/6-digit code/), { target: { value: '123456' } })
      await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Download' })))
      return dialog
    }

    beforeEach(() => {
      apiFile.mockReset()
      mfa.listFactors.mockResolvedValue({ data: { totp: [phone] } })
      mfa.challengeAndVerify.mockResolvedValue({ error: null })
      URL.createObjectURL = vi.fn(() => 'blob:fake')
      URL.revokeObjectURL = vi.fn()
    })

    it('saves the ZIP after a fresh code', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      apiFile.mockResolvedValue({ blob: new Blob(['zip']), name: 'tallyn-data-2026-10-24.zip' })
      await openSection('data')
      await enterCode()
      expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
      expect(apiFile).toHaveBeenCalledWith('/api/me/export', expect.stringMatching(/^tallyn-data-\d{4}-\d{2}-\d{2}\.zip$/))
      expect(click).toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: 'Download your data?' })).not.toBeInTheDocument()
      click.mockRestore()
    })

    it('says so calmly after 3 downloads an hour', async () => {
      apiFile.mockRejectedValue(Object.assign(new Error('too_many_requests'), { status: 429 }))
      await openSection('data')
      const dialog = await enterCode()
      expect(within(dialog).getByRole('alert')).toHaveTextContent('You can download your data 3 times an hour. Try again later.')
    })
  })
})
