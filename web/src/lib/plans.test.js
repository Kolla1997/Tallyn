import { describe, expect, it } from 'vitest'
import { answer, jobs, ownSharesOk, suggestionMonths, TEMPLATES } from './plans.js'

// Plan from your income (#133). The numbers are draft 3A's: $6,400 a month,
// day 24 of October. All made up.
const money = (minor) => `$${(minor / 100).toLocaleString('en-US')}`
const plan = (template, shares, progress) => ({
  monthly_income_minor: 640000,
  template,
  shares,
  from: '2026-10-01',
  to: '2026-11-01',
  progress: { essentials: 0, guilt_free: 0, debt: 0, short_term: 0, long_term: 0, ...progress },
})
const draft = { essentials: 278000, guilt_free: 36500, debt: 60000, short_term: 40000, long_term: 96000 }
const today = '2026-10-24'

describe('plans', () => {
  it('turns a plan into jobs with what is planned, used and their state', () => {
    const list = jobs(plan('55-5-10-15-15', TEMPLATES['55-5-10-15-15'].shares, draft), today)
    expect(list.map((j) => [j.name, j.planned, j.used, j.state])).toEqual([
      ['Essentials', 352000, 278000, 'on'],
      ['Guilt-free', 32000, 36500, 'over'],
      ['Debt / Invest', 64000, 60000, 'tomove'],
      ['Short-term goals', 96000, 40000, 'tomove'],
      ['Long-term wealth', 96000, 96000, 'done'],
    ])
  })

  it('answers first, in words', () => {
    const p = plan('55-5-10-15-15', TEMPLATES['55-5-10-15-15'].shares, draft)
    expect(answer(jobs(p, today), p, today, money)).toEqual({
      title: "You're mostly on track this month.",
      detail: 'Guilt-free is $45 over, and $560 is still to move to savings. 24 of 31 days gone.',
    })
    const calm = plan('55-5-10-15-15', TEMPLATES['55-5-10-15-15'].shares, { essentials: 100000 })
    expect(answer(jobs(calm, today), calm, today, money).title).toBe("You're on track this month.")
    const two = plan('55-5-10-15-15', TEMPLATES['55-5-10-15-15'].shares, { essentials: 400000, guilt_free: 40000 })
    expect(answer(jobs(two, today), two, today, money).title).toBe('A few jobs need a look this month.')
  })

  it('50/30/20 adds loan payments, savings and investments into one job', () => {
    const list = jobs(plan('50-30-20', TEMPLATES['50-30-20'].shares, draft), today)
    expect(list.map((j) => [j.name, j.planned, j.used])).toEqual([
      ['Needs', 320000, 278000],
      ['Wants', 192000, 36500],
      ['Savings & debt', 128000, 196000],
    ])
    expect(list[2].state).toBe('done')
  })

  it('your own: a 0% job is left out; shares must add up to 100', () => {
    const own = { essentials: 70, guilt_free: 10, debt: 0, short_term: 10, long_term: 10 }
    expect(jobs(plan('own', own, {}), today).map((j) => j.key)).toEqual(['essentials', 'guilt_free', 'short_term', 'long_term'])
    expect(ownSharesOk(own)).toBe(true)
    expect(ownSharesOk({ ...own, long_term: 9 })).toBe(false)
    expect(ownSharesOk({ ...own, long_term: 9.5, debt: 0.5 })).toBe(false)
  })

  it('names the three months the suggestion averages', () => {
    expect(suggestionMonths('2026-10-24')).toBe('July to September')
    expect(suggestionMonths('2026-02-03')).toBe('November to January')
  })
})
