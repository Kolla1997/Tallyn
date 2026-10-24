import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackupCodesGate, SaveBackupCodes, UseBackupCode } from './BackupCodes.jsx'

// Backup codes (#23, Dinesh picked A).
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
const refreshSession = vi.fn()
const listFactors = vi.fn()
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: { refreshSession: () => refreshSession(), mfa: { listFactors: () => listFactors(), challengeAndVerify: () => Promise.resolve({ error: null }) } },
  },
}))

const CODES = ['7KQ4-M9TX', 'R2WF-8HNC', 'D5PJ-QZ3K', 'X9LT-4MVB', 'H6CN-2RYW', 'B3ZQ-7KDP', 'M8VH-5TJL', 'F4XR-9NWC', 'Q7BD-3PHM', 'T2NK-6ZQV']
const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const tokenWithCodeAt = (ms) =>
  `${b64url({ alg: 'ES256' })}.${b64url({
    amr: [
      { method: 'password', timestamp: ms / 1000 - 60 },
      { method: 'totp', timestamp: ms / 1000 },
    ],
  })}.sig`
const Page = ({ children }) => <main>{children}</main>

beforeEach(() => {
  api.mockReset()
  refreshSession.mockReset()
  listFactors.mockReset()
  sessionStorage.clear()
})

describe('SaveBackupCodes', () => {
  it('making them fails: Try again instead of a dead end (#151)', async () => {
    api.mockRejectedValueOnce(new Error('internal')).mockResolvedValueOnce({ codes: CODES })
    await act(async () => render(<SaveBackupCodes onDone={vi.fn()} />))
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't make your codes.")
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(api).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })

  it('too long since the last code: asks for one more, then makes them (#151)', async () => {
    listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null })
    api.mockRejectedValueOnce(new Error('reauth_required')).mockResolvedValueOnce({ codes: CODES })
    await act(async () => render(<SaveBackupCodes onDone={vi.fn()} />))
    expect(screen.getByText(/we need one more code from your authenticator app/)).toBeInTheDocument()
    const boxes = screen.getAllByRole('textbox')
    '123456'.split('').forEach((d, i) => fireEvent.change(boxes[i], { target: { value: d } }))
    await act(async () => {})
    expect(api).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })

  it('makes one set (even in StrictMode), shows ten codes, and waits for the tick', async () => {
    api.mockResolvedValue({ codes: CODES })
    const onDone = vi.fn()
    await act(async () =>
      render(
        <StrictMode>
          <SaveBackupCodes onDone={onDone} />
        </StrictMode>,
      ),
    )
    expect(api).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledWith('/api/backup-codes', { method: 'POST' })
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('7KQ4-M9TX')).toBeInTheDocument()
    const go = screen.getByRole('button', { name: 'Continue to Tallyn' })
    expect(go).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /saved these codes/ }))
    fireEvent.click(go)
    expect(onDone).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Remind me next time' })).toBeNull()
  })

  it('code too old and authenticators can’t be read: says so, with Try again (#151)', async () => {
    api.mockRejectedValue(new Error('reauth_required'))
    listFactors.mockRejectedValue(new Error('Failed to fetch'))
    await act(async () => render(<SaveBackupCodes onDone={() => {}} />))
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't make your codes.")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('BackupCodesGate', () => {
  const now = Date.now()

  it('lets you straight in when the 2FA code is old', () => {
    render(
      <BackupCodesGate accessToken={tokenWithCodeAt(now - 60 * 60 * 1000)} page={Page}>
        <p>Home</p>
      </BackupCodesGate>,
    )
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
  })

  it('existing account without codes: asks once, with "Remind me next time"', async () => {
    api.mockImplementation((path, opts) => Promise.resolve(opts ? { codes: CODES } : { left: 0, total: 0 }))
    await act(async () =>
      render(
        <BackupCodesGate accessToken={tokenWithCodeAt(now)} page={Page}>
          <p>Home</p>
        </BackupCodesGate>,
      ),
    )
    expect(screen.getByText(/backup codes, so losing your phone/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remind me next time' }))
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(sessionStorage.getItem('tallyn.codesLater')).toBe('1')
  })

  it('existing account with codes: straight in', async () => {
    api.mockResolvedValue({ left: 9, total: 10 })
    await act(async () =>
      render(
        <BackupCodesGate accessToken={tokenWithCodeAt(now)} page={Page}>
          <p>Home</p>
        </BackupCodesGate>,
      ),
    )
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('just set up an authenticator (or recovered): a new set, no putting it off', async () => {
    sessionStorage.setItem('tallyn.just2FA', '1')
    api.mockImplementation((path, opts) => Promise.resolve(opts ? { codes: CODES } : { left: 9, total: 10 }))
    await act(async () =>
      render(
        <BackupCodesGate accessToken={tokenWithCodeAt(now)} page={Page}>
          <p>Home</p>
        </BackupCodesGate>,
      ),
    )
    expect(screen.getByRole('heading', { name: 'Save your backup codes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remind me next time' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Tallyn' }))
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(sessionStorage.getItem('tallyn.just2FA')).toBeNull()
  })
})

describe('UseBackupCode', () => {
  const type = (v) => fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: v } })

  it('waits for 8 characters, then recovers and refreshes the session', async () => {
    api.mockResolvedValue(null)
    render(<UseBackupCode onBack={() => {}} />)
    type('7kq4-m9t')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    type('7kq4-m9tx')
    expect(screen.getByLabelText('Backup code')).toHaveValue('7KQ4-M9TX')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
    expect(api).toHaveBeenCalledWith('/api/recovery/backup-code', { method: 'POST', body: { code: '7KQ4-M9TX' } })
    expect(sessionStorage.getItem('tallyn.recoveredWithCode')).toBe('1')
    expect(refreshSession).toHaveBeenCalled()
  })

  it('explains a wrong code, too many tries, and a half-finished recovery', async () => {
    render(<UseBackupCode onBack={() => {}} />)
    type('ZZZZ-ZZZZ')
    for (const [code, text] of [
      ['wrong_code', "That code didn't work."],
      ['too_many_requests', 'Wait 15 minutes'],
      ['recovery_failed', 'your other codes still work'],
    ]) {
      api.mockRejectedValueOnce(new Error(code))
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
      expect(screen.getByRole('alert')).toHaveTextContent(text)
    }
    expect(refreshSession).not.toHaveBeenCalled()
  })
})
