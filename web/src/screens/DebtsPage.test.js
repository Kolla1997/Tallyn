import { describe, expect, it } from 'vitest'
import { groupOf, measure } from './DebtsPage.jsx'

// The Debts page's gauges and groups (#27).
describe('groupOf', () => {
  it('sorts debts into the four groups', () => {
    expect(groupOf({ type: 'credit' })).toBe('card')
    expect(groupOf({ type: 'loan', subtype: 'student' })).toBe('student')
    expect(groupOf({ type: 'loan', subtype: 'mortgage' })).toBe('mortgage')
    expect(groupOf({ type: 'loan', subtype: 'auto' })).toBe('other')
    expect(groupOf({ type: 'loan', subtype: 'home equity' })).toBe('other')
  })
})

describe('measure', () => {
  it('shows a card’s limit used', () => {
    expect(measure({ type: 'credit', current_balance_minor: 41000, credit_limit_minor: 200000 })).toMatchObject({ kind: 'used', percent: 20.5 })
    expect(measure({ type: 'credit', current_balance_minor: 41000 })).toBeNull()
  })
  it('shows a loan paid off, and says when it has grown past what was borrowed', () => {
    const paid = measure({ type: 'loan', current_balance_minor: 5630206, loan: { original_minor: 30000000 } })
    expect(paid.kind).toBe('paid')
    expect(Math.round(paid.percent)).toBe(81)
    expect(paid.over).toBe(false)
    const over = measure({ type: 'loan', current_balance_minor: 6526200, loan: { original_minor: 2500000 } })
    expect(over).toMatchObject({ percent: 0, over: true })
  })
  it('uses a credit line’s limit when there’s no amount borrowed', () => {
    expect(measure({ type: 'loan', current_balance_minor: 1350050, credit_limit_minor: 2700100 })).toMatchObject({ kind: 'used', percent: 50 })
    expect(measure({ type: 'loan', current_balance_minor: 100 })).toBeNull()
  })
})
