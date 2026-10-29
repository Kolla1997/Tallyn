import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SignIn from './SignIn.jsx'

// Calm errors on sign-in and sign-up (#152): never Supabase's own text, and
// sign-up never reveals who already has an account.
const auth = { signInWithPassword: vi.fn(), signUp: vi.fn() }
vi.mock('../lib/supabase.js', () => ({
  supabase: { auth: { signInWithPassword: (...a) => auth.signInWithPassword(...a), signUp: (...a) => auth.signUp(...a) } },
}))

const fill = () => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fake-password-1' } })
}
const supabaseError = (code) => Object.assign(new Error('raw supabase text'), { code })

describe('SignIn errors', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(auth).forEach((f) => f.mockReset())
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('a wrong password gets Coinroof’s words, not Supabase’s', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: supabaseError('invalid_credentials') })
    render(<SignIn />)
    fill()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' })))
    expect(screen.getByRole('alert')).toHaveTextContent("That email and password don't match. Check them and try again.")
    expect(screen.queryByText(/raw supabase text/)).not.toBeInTheDocument()
  })

  it('sign-up for an email that already has an account looks like any sign-up', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: supabaseError('user_already_exists') })
    render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: /Create a new account/ }))
    fill()
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create account' })))
    expect(screen.getByText(/We sent a link to/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
