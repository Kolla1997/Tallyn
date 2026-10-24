import { describe, expect, it } from 'vitest'
import { forecast, forecastWords, monthsLeft, nextMilestone, perMonth, summary, thisMonth, totals } from './goals.js'

// Savings goals (#14). Draft 2's made-up goals, on 24 October 2026.
const today = '2026-10-24'
const money = (minor, cur = 'USD') => `${cur === 'EUR' ? '€' : '$'}${(minor / 100).toLocaleString('en-US')}`
const beach = {
  name: 'Beach trip',
  target_minor: 500000,
  currency: 'USD',
  by_month: '2027-06-01',
  saved_minor: 340000,
  history: ['05', '06', '07', '08', '09']
    .map((m, i) => ({ month: `2026-${m}-01`, saved_minor: 180000 + i * 30000 }))
    .concat([{ month: '2026-10-01', saved_minor: 340000 }]),
}
const leo = {
  name: "Leo's school fund",
  target_minor: 100000,
  currency: 'USD',
  by_month: '2027-09-01',
  saved_minor: 41200,
  history: [
    { month: '2026-09-01', saved_minor: 35200 },
    { month: '2026-10-01', saved_minor: 41200 },
  ],
}
const paris = {
  name: 'Paris trip',
  target_minor: 200000,
  currency: 'EUR',
  by_month: '2027-08-01',
  saved_minor: 30000,
  history: [{ month: '2026-09-01', saved_minor: 30000 }],
}
const fund = { name: 'Emergency fund', target_minor: 600000, currency: 'USD', by_month: null, saved_minor: 397000, history: [] }
const priv = { name: "Pat's car fund", target_minor: 800000, currency: 'USD', by_month: '2027-12-01', saved_minor: null, history: null }

describe('goals', () => {
  it('works out what it takes each month', () => {
    expect(monthsLeft(beach, today)).toBe(8)
    expect(perMonth(beach, today)).toBe(20000) // $200 a month
    expect(perMonth(fund, today)).toBeNull() // no month
    expect(perMonth(priv, today)).toBeNull() // private
  })

  it("this month's set-asides tick when enough has landed since the 1st", () => {
    const list = thisMonth([beach, leo, paris, fund, priv], today)
    expect(list.map((s) => [s.goal.name, s.due, s.added, s.done])).toEqual([
      ['Beach trip', 25000, 40000, true], // ($5,000 − $3,000) over 8 months; $400 added
      ["Leo's school fund", 5891, 6000, true],
      ['Paris trip', 17000, 0, false], // €170 due, nothing yet
    ])
    expect(summary(list, today, money)).toMatchObject({
      title: '2 of 3 set-asides are done this month.',
      detail: 'Paris trip still needs €170 by 31 Oct.',
    })
  })

  it('a goal new this month joins the checklist next month', () => {
    const fresh = { ...leo, history: [{ month: '2026-10-01', saved_minor: 41200 }] }
    expect(thisMonth([fresh], today)).toEqual([])
  })

  it('forecasts from the pace so far, and says when it can’t yet', () => {
    const f = forecast(beach, today)
    expect(f).toMatchObject({ pace: 32000, landsName: 'March 2027', vs: 3 })
    expect(forecastWords(f, beach)).toBe('At this pace you’ll be there in March 2027, about 3 months early.')
    expect(forecastWords(forecast(paris, today), paris)).toBe('Paris trip hasn’t grown since it started, so there’s no date to show yet.')
    expect(forecast({ ...leo, history: [{ month: '2026-10-01', saved_minor: 41200 }] }, today)).toBeNull()
    expect(forecastWords(null, leo)).toBe('The forecast shows after this goal’s second month.')
    expect(forecast(priv, today)).toBeNull()
  })

  it('names the next milestone', () => {
    expect(nextMilestone(beach)).toEqual({ name: 'three quarters', left: 35000, at: 0.75 })
    expect(nextMilestone(paris)).toMatchObject({ name: 'a quarter', left: 20000 })
    expect(nextMilestone(priv)).toBeNull()
  })

  it('totals only the home currency, and counts the rest', () => {
    expect(totals([beach, leo, paris, fund, priv], 'USD')).toEqual({ saved: 778200, target: 1200000, count: 3, other: 1 })
  })
})
