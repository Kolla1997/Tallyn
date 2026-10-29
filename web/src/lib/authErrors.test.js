import { afterEach, describe, expect, it, vi } from 'vitest'
import { authMessage, isExistingAccount, SOMETHING_WRONG, UNREACHABLE } from './authErrors.js'

// Calm words instead of Supabase's text (#152).
const err = (props) => Object.assign(new Error('raw supabase text'), props)

describe('authMessage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps each known code to Coinroof copy, never the raw text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(authMessage(err({ code: 'invalid_credentials' }))).toBe("That email and password don't match. Check them and try again.")
    expect(authMessage(err({ code: 'email_not_confirmed' }))).toBe('Confirm your email first: open the link we sent you, then sign in.')
    expect(authMessage(err({ code: 'over_email_send_rate_limit' }))).toBe('Too many tries. Wait a few minutes, then try again.')
    expect(authMessage(err({ status: 429 }))).toBe('Too many tries. Wait a few minutes, then try again.')
    expect(authMessage(err({ code: 'weak_password' }))).toBe('Choose a longer or less common password.')
  })

  it('not reaching Supabase, and anything unknown', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(authMessage(err({ name: 'AuthRetryableFetchError' }))).toBe(UNREACHABLE)
    expect(authMessage(new TypeError('Failed to fetch'))).toBe(UNREACHABLE)
    expect(authMessage(err({ code: 'something_new' }))).toBe(SOMETHING_WRONG)
    expect(log).toHaveBeenCalled() // the raw error is kept for debugging
    expect(authMessage(null)).toBe('')
  })

  it('spots sign-up for an email that already has an account', () => {
    expect(isExistingAccount(err({ code: 'user_already_exists' }))).toBe(true)
    expect(isExistingAccount(err({ code: 'email_exists' }))).toBe(true)
    expect(isExistingAccount(err({ code: 'invalid_credentials' }))).toBe(false)
  })
})
