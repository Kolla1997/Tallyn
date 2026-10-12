import { render, screen } from '@testing-library/react'
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
})
