import { describe, expect, it } from 'vitest'
import { byDay, cardDues, monthGrid, shiftMonth, totals } from './bills.js'

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

describe('cardDues', () => {
  const card = (id, card, extra = {}) => ({ id, name: 'Gold Card', mask: id, currency: 'USD', card, ...extra })
  const banks = [
    {
      accounts: [
        card('1111', {
          next_payment_due_date: '2026-11-20',
          minimum_payment_minor: 4000,
          last_statement_balance_minor: 120000,
          last_statement_date: '2026-10-25',
          last_payment_date: '2026-09-20',
          last_payment_minor: 4000,
        }),
        card('2222', {
          next_payment_due_date: '2026-11-05',
          minimum_payment_minor: 3500,
          last_statement_date: '2026-10-10',
          last_payment_date: '2026-11-01',
          last_payment_minor: 3500,
        }),
        card('3333', { next_payment_due_date: '2026-11-02', minimum_payment_minor: 2500, is_overdue: true }),
        card('4444', { next_payment_due_date: '2026-12-02', minimum_payment_minor: 2500 }),
        { id: 'chk', name: 'Checking', currency: 'USD', card: null },
      ],
    },
  ]
  it('puts this month’s cards on their due days, paid when the bank says so', () => {
    const d = cardDues(banks, '2026-11')
    expect(d.map((x) => [x.name, x.status, x.expected_minor])).toEqual([
      ['Gold Card ••1111', 'due', 4000],
      ['Gold Card ••2222', 'paid', 3500],
      ['Gold Card ••3333', 'late', 2500],
    ])
    expect(d[0].statement_minor).toBe(120000)
    expect(totals(d)).toEqual({ total: 10000, paid: 3500, left: 6500, late: 1 })
  })
})
