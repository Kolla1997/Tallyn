import { beforeEach, describe, expect, it } from 'vitest'
import {
  captureRecoveryFromURL,
  endRecovery,
  recoveryState,
  rememberPasswordChanged,
  rememberResetAsked,
  resetAskedEmail,
  takePasswordChanged,
} from './recovery.js'

// Password reset (#22): recognising the link, an expired link, and the note.
const at = (url) => window.history.replaceState(null, '', url)

describe('captureRecoveryFromURL', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    endRecovery()
  })

  it('starts a reset from the link, leaving the address for Supabase', () => {
    at('/#access_token=fake&type=recovery')
    captureRecoveryFromURL()
    expect(recoveryState()).toBe('pending')
    expect(window.location.hash).toContain('type=recovery')
  })

  it('an expired link after asking for a reset: says so and cleans the address', () => {
    rememberResetAsked('you@example.com')
    at('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    captureRecoveryFromURL()
    expect(recoveryState()).toBe('expired')
    expect(window.location.hash).toBe('')
    expect(resetAskedEmail()).toBe('you@example.com')
  })

  it('ignores an expired link nobody asked a reset for (an old sign-up email, say)', () => {
    at('/#error=access_denied&error_code=otp_expired')
    captureRecoveryFromURL()
    expect(recoveryState()).toBe('')
  })

  it('ignores ordinary addresses', () => {
    at('/transactions?day=2026-10-11')
    captureRecoveryFromURL()
    expect(recoveryState()).toBe('')
  })
})

describe('password changed note', () => {
  it('shows once and forgets the reset request', () => {
    rememberResetAsked('you@example.com')
    rememberPasswordChanged()
    expect(resetAskedEmail()).toBeNull()
    expect(takePasswordChanged()).toBe(true)
    expect(takePasswordChanged()).toBe(false)
  })
})
