import { beforeEach, describe, expect, it } from 'vitest'
import { IDLE_MS, clearActive, hasLastActive, idleState, lastActive, markActive } from './idle.js'

// Sign out after 30 minutes without activity (#91).
describe('idleState', () => {
  const t0 = 1_800_000_000_000
  it('is active for 29 minutes', () => {
    expect(idleState(t0 + 29 * 60_000 - 1, t0).state).toBe('active')
  })
  it('warns for the last minute, counting down', () => {
    expect(idleState(t0 + 29 * 60_000, t0)).toEqual({ state: 'warn', secondsLeft: 60 })
    expect(idleState(t0 + 29 * 60_000 + 30_500, t0)).toEqual({ state: 'warn', secondsLeft: 30 })
  })
  it('signs out at 30 minutes, also when coming back much later (sleep)', () => {
    expect(idleState(t0 + IDLE_MS, t0).state).toBe('out')
    expect(idleState(t0 + 8 * 3_600_000, t0).state).toBe('out')
  })
})

describe('shared activity and the sign-in note', () => {
  beforeEach(() => localStorage.clear())
  it('shares the last activity through storage, for every tab', () => {
    markActive(123)
    expect(localStorage.getItem('tallyn.lastActive')).toBe('123')
    expect(lastActive()).toBe(123)
  })
  it('starts a fresh clock only after the sign-in page clears it', () => {
    markActive(123)
    expect(hasLastActive()).toBe(true)
    clearActive()
    expect(hasLastActive()).toBe(false)
  })
})
