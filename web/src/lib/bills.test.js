import { describe, expect, it } from 'vitest'
import { byDay, monthGrid, shiftMonth, totals } from './bills.js'

// Bills (#127). Amounts are made up.
const dues = [
  { bill_id: 'rent', due: '2026-11-01', status: 'paid', expected_minor: 150000, paid_minor: 150000 },
  { bill_id: 'net', due: '2026-11-03', status: 'late', expected_minor: 7000 },
  { bill_id: 'gas', due: '2026-11-15', status: 'paid', expected_minor: 6490, paid_minor: 7135 },
  { bill_id: 'water', due: '2026-11-15', status: 'due', expected_minor: 4800 },
]

describe('bills', () => {
  it('lays out the month from Sunday', () => {
    expect(monthGrid('2026-11')).toEqual({ lead: 0, days: 30 })
    expect(monthGrid('2027-02')).toEqual({ lead: 1, days: 28 })
  })
  it('moves between months across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
  it('totals count what was actually paid', () => {
    expect(totals(dues)).toEqual({ total: 150000 + 7000 + 7135 + 4800, paid: 157135, left: 11800, late: 1 })
  })
  it('groups by day', () => {
    const m = byDay(dues)
    expect(m.get(15).map((d) => d.bill_id)).toEqual(['gas', 'water'])
    expect(m.get(2)).toBeUndefined()
  })
})
