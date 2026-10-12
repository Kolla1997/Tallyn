import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SessionLimit from './SessionLimit.jsx'

// Sign in again after 12 hours (#92): signs out at 12 hours with the note.
const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const tokenAt = (ms) => `${b64url({ alg: 'ES256' })}.${b64url({ amr: [{ method: 'password', timestamp: ms / 1000 }] })}.sig`
const HOUR = 60 * 60 * 1000
const start = new Date(2026, 9, 12, 8).getTime()

describe('SessionLimit', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(start)
  })
  afterEach(() => vi.useRealTimers())

  it('signs out at 12 hours and leaves the note', () => {
    const onSignOut = vi.fn()
    render(<SessionLimit accessToken={tokenAt(start)} onSignOut={onSignOut} />)
    act(() => vi.advanceTimersByTime(12 * HOUR - 60 * 1000))
    expect(onSignOut).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(60 * 1000))
    expect(onSignOut).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('tallyn.signOutNote')).toBe('max')
    act(() => vi.advanceTimersByTime(5 * 60 * 1000))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('signs out straight away when the tab opens after 12 hours', () => {
    const onSignOut = vi.fn()
    render(<SessionLimit accessToken={tokenAt(start - 13 * HOUR)} onSignOut={onSignOut} />)
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
