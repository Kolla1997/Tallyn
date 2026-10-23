import { describe, expect, it } from 'vitest'
import { coverChoices, fromMinor, pace, periodInfo, runningTotals, tone, toMinor } from './budgets.js'

// The sums behind the Budgets page (#13).
const oct = { from: '2026-10-01', to: '2026-11-01' }
const week = { from: '2026-10-18', to: '2026-10-25' }

describe('periodInfo', () => {
  it('counts today as gone', () => {
    expect(periodInfo(oct, '2026-10-21')).toMatchObject({ days: 31, day: 21, left: 10 })
    expect(periodInfo(week, '2026-10-21')).toMatchObject({ days: 7, day: 4, left: 3 })
    expect(periodInfo(oct, '2026-10-31')).toMatchObject({ day: 31, left: 0, elapsed: 1 })
  })
  it('stays inside the period when the dates are a day off', () => {
    expect(periodInfo(oct, '2026-09-30').day).toBe(1)
    expect(periodInfo(oct, '2026-11-01').day).toBe(31)
  })
})

describe('tone and pace', () => {
  it('turns amber at 80% and red past 100%', () => {
    expect(tone(7900, 10000)).toBe('ok')
    expect(tone(8000, 10000)).toBe('warn')
    expect(tone(10000, 10000)).toBe('warn')
    expect(tone(10001, 10000)).toBe('over')
  })
  it('compares spending with how far through the period we are', () => {
    expect(pace(5000, 10000, 0.5)).toBe('on')
    expect(pace(6200, 10000, 0.5)).toBe('on')
    expect(pace(6300, 10000, 0.5)).toBe('ahead')
    expect(pace(10000, 10000, 0.5)).toBe('full')
    expect(pace(10001, 10000, 0.5)).toBe('over')
  })
})

describe('runningTotals', () => {
  it('adds up each day to today, with days without spending flat', () => {
    const b = {
      ...week,
      days: [
        { date: '2026-10-18', amount_minor: 500 },
        { date: '2026-10-20', amount_minor: 250 },
      ],
    }
    expect(runningTotals(b, '2026-10-21')).toEqual([
      [0, 0],
      [1, 500],
      [2, 500],
      [3, 750],
      [4, 750],
    ])
  })
})

describe('amounts', () => {
  it('reads what people type', () => {
    expect(toMinor('250', 'USD')).toBe(25000)
    expect(toMinor('1,250.5', 'USD')).toBe(125050)
    expect(toMinor('$80.05', 'USD')).toBe(8005)
    expect(toMinor('1200', 'JPY')).toBe(1200)
  })
  it('reads a comma decimal and other currencies (#146)', () => {
    expect(toMinor('12,50', 'EUR')).toBe(1250) // not 1,250.00
    expect(toMinor('12,5', 'EUR')).toBe(1250)
    expect(toMinor('0,99', 'GBP')).toBe(99)
    expect(toMinor('1.250,50', 'EUR')).toBe(125050)
    expect(toMinor('1 250,50', 'EUR')).toBe(125050)
    expect(toMinor('1 250,50', 'EUR')).toBe(125050)
    expect(toMinor("1'250.50", 'CHF')).toBe(125050)
    expect(toMinor('1,250', 'EUR')).toBe(125000) // three digits: thousands
    expect(toMinor('1,200', 'JPY')).toBe(1200)
    for (const t of ['€250', '250 €', '£250', 'EUR 250', '250 EUR', 'eur250']) expect(toMinor(t, 'EUR')).toBe(25000)
  })
  it('turns down amounts that could be read two ways (#146)', () => {
    for (const bad of ['1.250', '1,250,50', '12 50', '1,25,000', '€', 'EUR']) expect(toMinor(bad, 'EUR')).toBeNull()
    expect(toMinor('12,5', 'JPY')).toBeNull()
  })
  it('turns down what isn’t an amount above zero', () => {
    for (const bad of ['', '0', '0.00', '-5', '12.345', 'abc', '1e3', '12.5.1']) expect(toMinor(bad, 'USD')).toBeNull()
    expect(toMinor('12.5', 'JPY')).toBeNull()
    expect(toMinor('1000000001', 'USD')).toBeNull()
  })
  it('shows a saved amount in the field', () => {
    expect(fromMinor(125050, 'USD')).toBe('1250.50')
    expect(fromMinor(1200, 'JPY')).toBe('1200')
  })
})

describe('coverChoices', () => {
  const members = [
    { user_id: 'me', role: 'owner' },
    { user_id: 'ann', role: 'adult' },
    { user_id: 'leo', role: 'teen' },
    { user_id: 'mia', role: 'child' },
  ]
  it('lets owners and adults set the household, their own and the kids’', () => {
    expect(coverChoices('owner', 'me', members)).toEqual(['', 'me', 'leo', 'mia'])
    expect(coverChoices('adult', 'ann', members)).toEqual(['', 'ann', 'leo', 'mia'])
  })
  it('lets viewers set only their own, and kids none', () => {
    expect(coverChoices('viewer', 'v', members)).toEqual(['v'])
    expect(coverChoices('teen', 'leo', members)).toEqual([])
  })
})
