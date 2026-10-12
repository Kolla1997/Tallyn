import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpendingDots from './SpendingDots.jsx'

// Keyboard access for the year of dots (#98): one Tab stop, arrows between days.
const days = [
  { date: '2026-03-04', currency: 'USD', amount_minor: 2500, count: 1, top: [{ merchant: 'Corner Cafe', amount_minor: 2500 }] },
  { date: '2026-10-12', currency: 'USD', amount_minor: 4000, count: 2, top: [] },
]
const focus = (key) => act(() => dot(key).focus())
const dot = (key) => document.querySelector(`[data-key="${key}"]`)
const tabStops = () => [...document.querySelectorAll('.day-dot[tabindex="0"]')].map((el) => el.dataset.key)
const press = (key) => fireEvent.keyDown(document.activeElement, { key })

describe('SpendingDots keyboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('is one Tab stop: today, the picked day, or 1 January for another year', () => {
    const { rerender } = render(<SpendingDots year="2026" days={days} home="USD" selected="" onPick={() => {}} />)
    expect(document.querySelectorAll('.day-dot[data-key]')).toHaveLength(365)
    expect(tabStops()).toEqual(['2026-10-12'])
    rerender(<SpendingDots year="2026" days={days} home="USD" selected="2026-03-04" onPick={() => {}} />)
    expect(tabStops()).toEqual(['2026-03-04'])
    rerender(<SpendingDots year="2025" days={days} home="USD" selected="" onPick={() => {}} />)
    expect(tabStops()).toEqual(['2025-01-01'])
    expect(screen.getByRole('group', { name: /arrow keys/ })).toBeInTheDocument()
  })

  it('moves a day, a week, to the month ends and a month, across months', () => {
    render(<SpendingDots year="2026" days={days} home="USD" selected="" onPick={() => {}} />)
    focus('2026-01-31')
    const steps = [
      ['ArrowRight', '2026-02-01'],
      ['ArrowLeft', '2026-01-31'],
      ['ArrowDown', '2026-02-07'],
      ['ArrowUp', '2026-01-31'],
      ['PageDown', '2026-02-28'],
      ['PageUp', '2026-01-28'],
      ['Home', '2026-01-01'],
      ['End', '2026-01-31'],
    ]
    for (const [key, to] of steps) {
      press(key)
      expect(document.activeElement).toBe(dot(to))
      expect(tabStops()).toEqual([to])
    }
  })

  it('stays within the year', () => {
    render(<SpendingDots year="2026" days={days} home="USD" selected="" onPick={() => {}} />)
    focus('2026-01-03')
    press('ArrowUp')
    expect(document.activeElement).toBe(dot('2026-01-01'))
    press('ArrowLeft')
    expect(document.activeElement).toBe(dot('2026-01-01'))
    focus('2026-12-29')
    press('ArrowDown')
    expect(document.activeElement).toBe(dot('2026-12-31'))
  })

  it('shows the day card on focus, Esc hides it, Enter picks a spending day', () => {
    const onPick = vi.fn()
    render(<SpendingDots year="2026" days={days} home="USD" selected="" onPick={onPick} />)
    focus('2026-03-03')
    press('ArrowRight')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Wednesday, March 4, 2026')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Corner Cafe')
    press('Escape')
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(document.activeElement) // Enter on a button clicks it
    expect(onPick).toHaveBeenCalledWith('2026-03-04')
  })

  it('keeps the Tab stop with the card’s day before and after buttons', () => {
    render(<SpendingDots year="2026" days={days} home="USD" selected="" onPick={() => {}} />)
    focus('2026-03-04')
    fireEvent.click(screen.getByRole('button', { name: 'Day after' }))
    expect(document.activeElement).toBe(dot('2026-03-05'))
    expect(tabStops()).toEqual(['2026-03-05'])
  })
})
