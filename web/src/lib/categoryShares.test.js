import { describe, expect, it } from 'vitest'
import { categoryShares, finding, roundedShares } from './categoryShares.js'

// By category (#253): shares of the whole that add up to 100%, small ones folded, the finding.
const label = (c) =>
  ({ FOOD: 'Food and drink', TRANS: 'Transportation', RENT: 'Rent and utilities', TRAVEL: 'Travel', SHOP: 'General merchandise', CARE: 'Personal care' })[c] ??
  c
const money = (m) => `$${(m / 100).toFixed(2)}`
// The sandbox month from Dinesh's screenshot.
const MONTH = [
  { category: 'FOOD', amount_minor: 614697 },
  { category: 'TRANS', amount_minor: 613536 },
  { category: 'RENT', amount_minor: 600000 },
  { category: 'TRAVEL', amount_minor: 600000 },
  { category: 'SHOP', amount_minor: 80460 },
  { category: 'CARE', amount_minor: 78500 },
]

describe('categoryShares', () => {
  it('shares add up to exactly 100%, whatever the rounding', () => {
    expect(roundedShares([1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(100)
    expect(roundedShares([614697, 613536, 600000, 600000, 158960])).toEqual([24, 24, 23, 23, 6])
    const s = categoryShares(MONTH)
    expect(s.parts.reduce((t, p) => t + p.pct, 0)).toBe(100)
  })

  it('folds categories under 5% into Other, and keeps their own amounts inside it', () => {
    const s = categoryShares(MONTH)
    expect(s.parts.map((p) => p.category)).toEqual(['FOOD', 'TRANS', 'RENT', 'TRAVEL', 'OTHER'])
    expect(s.parts.at(-1).amount_minor).toBe(158960)
    expect(s.small.map((c) => [c.category, c.amount_minor, c.pct])).toEqual([
      ['SHOP', 80460, 3],
      ['CARE', 78500, 3],
    ])
    expect(s.total).toBe(2587193)
  })

  it('never folds a lone small category into Other', () => {
    const s = categoryShares([...MONTH.slice(0, 4), MONTH[4]])
    expect(s.parts.map((p) => p.category)).not.toContain('OTHER')
    expect(s.small).toEqual([])
  })

  it('the redder, the more spent, as Spending by day', () => {
    const s = categoryShares(MONTH)
    expect(s.parts.map((p) => p.level)).toEqual([4, 4, 4, 4, 2])
  })

  it('nothing spent: no card', () => {
    expect(categoryShares([])).toBeNull()
    expect(categoryShares([{ category: 'FOOD', amount_minor: 0 }])).toBeNull()
  })
})

describe('finding', () => {
  it('says how much the big ones took, and who led by how much', () => {
    expect(finding(categoryShares(MONTH), label, money)).toEqual({
      strong: 'Four categories took 94% of it.',
      rest: 'Food and drink led, $11.61 ahead of Transportation.',
    })
  })

  it('without small ones, only who led', () => {
    expect(finding(categoryShares(MONTH.slice(0, 2)), label, money)).toEqual({ strong: 'Food and drink led, $11.61 ahead of Transportation.', rest: '' })
  })

  it('one category', () => {
    expect(finding(categoryShares(MONTH.slice(0, 1)), label, money).strong).toBe('All of it went on Food and drink.')
  })
})
