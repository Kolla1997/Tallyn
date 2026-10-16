import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IdleGuard from './IdleGuard.jsx'

// Sign out after 30 minutes without activity (#91, #114): the warning for the
// last minute, Stay, Esc, and coming back after sleep.
const MIN = 60 * 1000
const start = new Date(2026, 9, 16, 9).getTime()

describe('IdleGuard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(start)
  })
  afterEach(() => vi.useRealTimers())

  const dialog = () => screen.queryByRole('alertdialog', { hidden: true })
  const open = () => dialog()?.hasAttribute('open')

  it('warns at 29 minutes, counting down, and signs out at 30 with the note', () => {
    const onSignOut = vi.fn()
    render(<IdleGuard onSignOut={onSignOut} />)
    act(() => vi.advanceTimersByTime(29 * MIN - 1000))
    expect(open()).toBe(false)
    act(() => vi.advanceTimersByTime(2000))
    expect(open()).toBe(true)
    expect(dialog()).toHaveTextContent('Still there?')
    expect(dialog()).toHaveTextContent(/sign you out in (59|60) seconds/)
    expect(document.activeElement).toHaveTextContent('Stay signed in')
    act(() => vi.advanceTimersByTime(MIN))
    expect(onSignOut).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('tallyn.signOutNote')).toBe('idle')
  })

  it('Stay signed in, or Esc, starts the 30 minutes again', () => {
    const onSignOut = vi.fn()
    render(<IdleGuard onSignOut={onSignOut} />)
    act(() => vi.advanceTimersByTime(29 * MIN + 5000))
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in', hidden: true }))
    expect(open()).toBe(false)
    act(() => vi.advanceTimersByTime(29 * MIN + 5000))
    expect(open()).toBe(true)
    fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(open()).toBe(false)
    act(() => vi.advanceTimersByTime(20 * MIN))
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('activity keeps you signed in', () => {
    const onSignOut = vi.fn()
    render(<IdleGuard onSignOut={onSignOut} />)
    for (let i = 0; i < 4; i++) {
      act(() => vi.advanceTimersByTime(20 * MIN))
      fireEvent.keyDown(window, { key: 'a' })
    }
    expect(open()).toBe(false)
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('coming back after sleep, past 30 minutes: signs out straight away', () => {
    localStorage.setItem('tallyn.lastActive', String(start - 2 * 60 * MIN))
    const onSignOut = vi.fn()
    render(<IdleGuard onSignOut={onSignOut} />)
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
