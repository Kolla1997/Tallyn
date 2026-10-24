import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SetUp2FA from './SetUp2FA.jsx'

// Setting up 2FA (#7, #23, #114): the QR code and key, a half-finished setup
// cleared first, backup codes next, and the note after a recovery.
const mfa = { listFactors: vi.fn(), unenroll: vi.fn(), enroll: vi.fn(), challengeAndVerify: vi.fn() }
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
    },
  },
}))

beforeEach(() => {
  Object.values(mfa).forEach((f) => f.mockReset())
  sessionStorage.clear()
  mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'old', factor_type: 'totp', status: 'unverified' }] }, error: null })
  mfa.unenroll.mockResolvedValue({ error: null })
  mfa.enroll.mockResolvedValue({ data: { id: 'f-new', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'FAKESECRETKEY' } }, error: null })
})

describe('SetUp2FA', () => {
  it('clears a half-finished setup, then shows the QR code and key', async () => {
    await act(async () => render(<SetUp2FA onSignOut={() => {}} />))
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' })
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', issuer: 'Tallyn' })
    expect(screen.getByRole('heading', { name: 'Protect your account' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument()
    expect(screen.getByText('FAKESECRETKEY')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox', { name: /Digit/ })).toHaveLength(6)
    expect(screen.getByText(/Then you'll save backup codes/)).toBeInTheDocument()
    // Backup codes come next (#23).
    expect(sessionStorage.getItem('tallyn.just2FA')).toBe('1')
  })

  it('after a backup code: says the old authenticator is gone, and new codes follow', async () => {
    sessionStorage.setItem('tallyn.recoveredWithCode', '1')
    await act(async () => render(<SetUp2FA onSignOut={() => {}} />))
    expect(screen.getByText(/You're in with a backup code/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Set up your authenticator' })).toBeInTheDocument()
    expect(screen.getByText(/new set of backup codes/)).toBeInTheDocument()
    expect(sessionStorage.getItem('tallyn.recoveredWithCode')).toBeNull()
  })

  it('says so calmly when setup can’t start, with Try again (#152)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mfa.enroll.mockResolvedValue({ data: null, error: new Error('Enrollment is disabled') })
    await act(async () => render(<SetUp2FA onSignOut={() => {}} />))
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't start setting up your authenticator. Try again in a moment.")
    expect(screen.getByRole('alert')).not.toHaveTextContent('Enrollment is disabled')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
