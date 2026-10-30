import { describe, expect, it } from 'vitest'
import { categoryLabel, formatMoney } from './money.js'

describe('formatMoney', () => {
  it('uses the currency’s own decimals', () => {
    expect(formatMoney(421000, 'USD')).toBe('$4,210.00')
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234')
    expect(formatMoney(-2500, 'USD')).toBe('-$25.00')
  })
  it('shows a dash for no amount, and the code for unknown currencies', () => {
    expect(formatMoney(null, 'USD')).toBe('—')
    expect(formatMoney(undefined, 'USD')).toBe('—')
    expect(formatMoney(5, 'NOT-A-CODE')).toBe('5 NOT-A-CODE')
    expect(formatMoney(150000, 'BTCX')).toBe('150,000 BTCX') // grouped, not a bare run of digits (#154)
  })
})

describe('categoryLabel', () => {
  it('turns Plaid codes into words', () => {
    expect(categoryLabel('FOOD_AND_DRINK')).toBe('Food and drink')
    expect(categoryLabel('OTHER')).toBe('Other')
    expect(categoryLabel(null)).toBe('Other')
  })
})
