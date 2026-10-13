import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import SignIn from './SignIn.jsx'

// After signing out for inactivity (#91), the sign-in page says why, once,
// and clears the old activity clock so the next sign-in starts fresh.
describe('SignIn after an idle sign-out', () => {
  beforeEach(() => localStorage.clear())
  const note = /signed out after 30 minutes without activity/i

  it('shows the note once', () => {
    localStorage.setItem('tallyn.signOutNote', 'idle')
    localStorage.setItem('tallyn.lastActive', '123')
    const { unmount } = render(<SignIn />)
    expect(screen.getByRole('status')).toHaveTextContent(note)
    expect(localStorage.getItem('tallyn.lastActive')).toBeNull()
    unmount()
    render(<SignIn />)
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })

  it('says nothing after an ordinary sign-out', () => {
    render(<SignIn />)
    expect(screen.queryByText(note)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('says why after 12 hours (#92)', () => {
    localStorage.setItem('tallyn.signOutNote', 'max')
    render(<SignIn />)
    expect(screen.getByRole('status')).toHaveTextContent('For your security, Tallyn asks you to sign in again every 12 hours.')
  })

  it('Forgot password? opens the reset form, and back returns (#22)', () => {
    render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to sign in/ }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('an expired reset link opens on the expired screen (#22)', () => {
    render(<SignIn expired onExpiredSeen={() => {}} />)
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
  })

  it('sign-up asks for at least 8 characters (#22)', () => {
    render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: /Create a new account/ }))
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '8')
  })
})
