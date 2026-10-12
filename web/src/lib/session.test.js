import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_SESSION_MS, rememberSignOutNote, sessionOver, signedInAt, takeSignOutNote } from './session.js'

// Sign in again after 12 hours (#92).
const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = (payload) => `${b64url({ alg: 'ES256' })}.${b64url(payload)}.fake-signature`

describe('signedInAt', () => {
  it('is the oldest amr entry (a 2FA step-up does not restart it)', () => {
    const t = token({
      amr: [
        { method: 'totp', timestamp: 1_800_000_100 },
        { method: 'password', timestamp: 1_800_000_000 },
      ],
    })
    expect(signedInAt(t)).toBe(1_800_000_000_000)
  })
  it('is null when the token does not say', () => {
    expect(signedInAt(token({}))).toBeNull()
    expect(signedInAt(token({ amr: [{ method: 'password' }] }))).toBeNull()
    expect(signedInAt('not-a-token')).toBeNull()
    expect(signedInAt(undefined)).toBeNull()
  })
})

describe('sessionOver', () => {
  const at = 1_800_000_000_000
  it('is over at 12 hours, not before', () => {
    expect(sessionOver(at + MAX_SESSION_MS - 1, at)).toBe(false)
    expect(sessionOver(at + MAX_SESSION_MS, at)).toBe(true)
    expect(sessionOver(at + 3 * MAX_SESSION_MS, at)).toBe(true) // back after sleep
  })
  it('never ends a session whose sign-in time is unknown (the API still checks)', () => {
    expect(sessionOver(at, null)).toBe(false)
  })
})

describe('sign-out note', () => {
  beforeEach(() => localStorage.clear())
  it('shows once, for a known reason only', () => {
    rememberSignOutNote('max')
    expect(takeSignOutNote()).toBe('max')
    expect(takeSignOutNote()).toBe('')
    rememberSignOutNote('something else')
    expect(takeSignOutNote()).toBe('')
  })
})
