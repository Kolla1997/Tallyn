import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { signOutEverywhere, signOutHere } from './lib/session.js'

// Which sign-out goes where (#92, #116): the automatic ones (30 minutes idle,
// 12 hours) end only this device's session; the Sign out button everywhere.
const got = {}
const keep = (name) => (props) => {
  got[name] = props
  return props.children ?? null
}
vi.mock('./components/IdleGuard.jsx', () => ({ default: (p) => keep('idle')(p) }))
vi.mock('./components/SessionLimit.jsx', () => ({ default: (p) => keep('limit')(p) }))
vi.mock('./components/ConsentGate.jsx', () => ({ default: (p) => keep('consent')(p) }))
vi.mock('./screens/BackupCodes.jsx', () => ({ BackupCodesGate: (p) => keep('codes')(p) }))
vi.mock('./screens/Home.jsx', () => ({ default: (p) => keep('home')(p) }))
vi.mock('./lib/supabase.js', () => ({
  configured: true,
  supabase: {
    auth: {
      signOut: vi.fn(),
      onAuthStateChange: (cb) => {
        cb('INITIAL_SESSION', { access_token: 'fake', user: { email: 'you@example.com' } })
        return { data: { subscription: { unsubscribe() {} } } }
      },
      mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } }) },
    },
  },
}))

describe('App sign-outs', () => {
  it('automatic sign-outs end only this device; the Sign out button ends every session', async () => {
    window.history.replaceState(null, '', '/')
    await act(async () => render(<App />))
    expect(got.idle.onSignOut).toBe(signOutHere)
    expect(got.limit.onSignOut).toBe(signOutHere)
    expect(got.home.onSignOut).toBe(signOutEverywhere)
    expect(got.consent.onSignOut).toBe(signOutEverywhere)
  })
})
