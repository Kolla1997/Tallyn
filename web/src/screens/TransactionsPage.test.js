import { afterEach, describe, expect, it } from 'vitest'
import { fromAddress } from './TransactionsPage.jsx'

// Filters from the page address are only taken when they look right (#42, #75, #83).
describe('fromAddress', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))
  const at = (q) => window.history.replaceState(null, '', `/transactions?${q}`)
  it('keeps good values', () => {
    at('category=FOOD_AND_DRINK&month=2026-10&day=2026-10-08&bank=00000000-0000-4000-8000-000000000000&owner=all')
    expect(fromAddress('category')).toBe('FOOD_AND_DRINK')
    expect(fromAddress('month')).toBe('2026-10')
    expect(fromAddress('day')).toBe('2026-10-08')
    expect(fromAddress('bank')).toBe('00000000-0000-4000-8000-000000000000')
    expect(fromAddress('owner')).toBe('all')
  })
  it('drops anything else', () => {
    at('category=DROP_TABLE&month=2026-13&day=2026-02-31x&bank=not-a-bank&owner=%3Cscript%3E')
    expect(fromAddress('category')).toBe('')
    expect(fromAddress('month')).toBe('')
    expect(fromAddress('day')).toBe('')
    expect(fromAddress('bank')).toBe('')
    expect(fromAddress('owner')).toBe('')
  })
})
