import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api.js'

// When the API says the session is over (12 hours, #92), Tallyn ends only
// this device's session and leaves the note (#116).
const signOut = vi.fn()
vi.mock('./supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'fake-token' } } }),
      signOut: (...a) => signOut(...a),
    },
  },
}))

const answer = (status, body) => Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(body) })

describe('api', () => {
  beforeEach(() => {
    localStorage.clear()
    signOut.mockReset()
    signOut.mockResolvedValue({ error: null })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the access token and JSON', async () => {
    const fetch = vi.fn(() => answer(200, { ok: true }))
    vi.stubGlobal('fetch', fetch)
    expect(await api('/api/me', { method: 'PUT', body: { display_name: 'Alex' } })).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith('/api/me', {
      method: 'PUT',
      headers: { Authorization: 'Bearer fake-token', 'Content-Type': 'application/json' },
      body: '{"display_name":"Alex"}',
    })
  })

  it('session_expired: signs out this device only, once, with the note', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => answer(401, { error: 'session_expired' })),
    )
    const results = await Promise.allSettled([api('/api/me'), api('/api/banks'), api('/api/members')])
    expect(results.every((r) => r.status === 'rejected' && r.reason.message === 'session_expired')).toBe(true)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(localStorage.getItem('tallyn.signOutNote')).toBe('max')
  })

  it('other errors don’t sign anyone out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => answer(401, { error: 'unauthorized' })),
    )
    await expect(api('/api/me')).rejects.toThrow('unauthorized')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => answer(500, { error: 'internal' })),
    )
    await expect(api('/api/me')).rejects.toThrow('internal')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('errors carry the HTTP status (#151)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => answer(403, { error: 'forbidden' })),
    )
    await expect(api('/api/invites/accept', { method: 'POST', body: {} })).rejects.toMatchObject({ message: 'forbidden', status: 403 })
  })
})
