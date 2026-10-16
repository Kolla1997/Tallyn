import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Verify2FA from './Verify2FA.jsx'

// During a password reset (#22) the 2FA code comes first, with a note, and the
// way out cancels the reset instead of switching account.
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: () =>
          Promise.resolve({
            data: {
              totp: [
                { id: 'f1', status: 'verified' },
                { id: 'f2', status: 'verified' },
              ],
            },
          }),
      },
    },
  },
}))

describe('Verify2FA', () => {
  it('signing in: no note, "Use a different account"', async () => {
    const onSignOut = vi.fn()
    await act(async () => render(<Verify2FA onSignOut={onSignOut} />))
    expect(screen.queryByText(/before choosing a new password/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Use a different account' }))
    expect(onSignOut).toHaveBeenCalled()
  })

  it('resetting: says why, and "Cancel reset"', async () => {
    const onSignOut = vi.fn()
    const onCancelReset = vi.fn()
    await act(async () => render(<Verify2FA onSignOut={onSignOut} recovering onCancelReset={onCancelReset} />))
    expect(screen.getByText(/enter your authenticator code before choosing a new password/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reset' }))
    expect(onCancelReset).toHaveBeenCalled()
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('lost your phone: "Can\'t get a code?" offers a backup code (#23)', async () => {
    await act(async () => render(<Verify2FA onSignOut={() => {}} />))
    expect(screen.getAllByRole('textbox', { name: /Digit/ })).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: "Can't get a code?" }))
    expect(screen.getByText(/Use one of the backup codes you saved/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use a backup code' }))
    expect(screen.getByRole('heading', { name: 'Use a backup code' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to the/ }))
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument()
  })
})
