import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChoosePassword, ResetRequest } from './ResetPassword.jsx'

// Password reset screens (#22, Dinesh picked A).
const auth = { resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: new Proxy(
      {},
      {
        get:
          (_, k) =>
          (...a) =>
            auth[k](...a),
      },
    ),
  },
}))

const typeInto = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('ResetRequest', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(auth).forEach((f) => f.mockReset())
  })

  it('sends the link back to Tallyn and says the same thing whether or not the account exists', async () => {
    for (const result of [{ error: null }, { error: { status: 400, message: 'User not found' } }]) {
      auth.resetPasswordForEmail.mockResolvedValueOnce(result)
      const { unmount } = render(<ResetRequest onBack={() => {}} />)
      typeInto('Email', 'you@example.com')
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send reset link' })))
      expect(auth.resetPasswordForEmail).toHaveBeenLastCalledWith('you@example.com', { redirectTo: window.location.origin })
      expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
      expect(screen.getByText(/If there's a Tallyn account for/)).toHaveTextContent('you@example.com')
      expect(screen.getByRole('button', { name: /Send another link in 60s/ })).toBeDisabled()
      unmount()
    }
  })

  it('only reports having to wait', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 429, message: 'rate limited' } })
    render(<ResetRequest onBack={() => {}} />)
    typeInto('Email', 'you@example.com')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send reset link' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Please wait a minute before asking for another link.')
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  })

  it('explains an expired link and offers a new one with the email filled in', () => {
    render(<ResetRequest initialEmail="you@example.com" expired onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('you@example.com')
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeInTheDocument()
  })
})

describe('ChoosePassword', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(auth).forEach((f) => f.mockReset())
  })

  it('waits for 8 characters, shows or hides the password', () => {
    render(<ChoosePassword email="you@example.com" onDone={() => {}} />)
    const save = screen.getByRole('button', { name: 'Save and sign in' })
    typeInto('New password', 'short')
    expect(save).toBeDisabled()
    expect(screen.getByText(/At least 8 characters/)).not.toHaveClass('password-rule-ok')
    typeInto('New password', 'Coffee-Lamp-Garden')
    expect(save).toBeEnabled()
    expect(screen.getByText(/At least 8 characters/)).toHaveClass('password-rule-ok')
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
  })

  it('saves, signs out the other devices, and leaves the note for Home', async () => {
    auth.updateUser.mockResolvedValue({ error: null })
    auth.signOut.mockResolvedValue({ error: null })
    const onDone = vi.fn()
    render(<ChoosePassword email="you@example.com" onDone={onDone} />)
    typeInto('New password', 'Coffee-Lamp-Garden')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save and sign in' })))
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Coffee-Lamp-Garden' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(localStorage.getItem('tallyn.passwordChanged')).toBe('1')
    expect(onDone).toHaveBeenCalled()
  })

  it('says so when the new password is the current one', async () => {
    auth.updateUser.mockResolvedValue({ error: { code: 'same_password', message: 'New password should be different' } })
    const onDone = vi.fn()
    render(<ChoosePassword email="you@example.com" onDone={onDone} />)
    typeInto('New password', 'Coffee-Lamp-Garden')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save and sign in' })))
    expect(screen.getByRole('alert')).toHaveTextContent("That's your current password. Choose a new one.")
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})
