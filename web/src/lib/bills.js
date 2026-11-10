// Bills Plaid can't see (#127): small helpers for the calendar page.

// The calendar for a month ('YYYY-MM'): how many blank cells come before the
// 1st (weeks start on Sunday) and how many days it has.
export function monthGrid(month) {
  const [y, m] = month.split('-').map(Number)
  return { lead: new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days: new Date(Date.UTC(y, m, 0)).getUTCDate() }
}

// 'YYYY-MM' moved by n months.
export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// What a due counts as: the amount paid once paid, else the amount expected.
export const amountOf = (due) => (due.status === 'paid' ? due.paid_minor : due.expected_minor)

// The month's totals. Sums come from the same amounts the page shows.
export function totals(dues) {
  let total = 0
  let paid = 0
  let late = 0
  for (const d of dues) {
    total += amountOf(d)
    if (d.status === 'paid') paid += d.paid_minor
    if (d.status === 'late') late++
  }
  return { total, paid, left: total - paid, late }
}

// Dues by day of the month (1–31).
export function byDay(dues) {
  const m = new Map()
  for (const d of dues) {
    const day = Number(d.due.slice(8, 10))
    m.set(day, [...(m.get(day) ?? []), d])
  }
  return m
}

export const FREQUENCIES = [
  ['monthly', 'Every month'],
  ['quarterly', 'Every 3 months'],
  ['yearly', 'Every year'],
  ['once', 'Just once'],
]
export const CATEGORIES = [
  ['housing', 'Housing'],
  ['utilities', 'Utilities'],
  ['insurance', 'Insurance'],
  ['childcare', 'Childcare'],
  ['subscriptions', 'Subscriptions'],
  ['other', 'Other'],
]
export const frequencyName = (f) => FREQUENCIES.find(([k]) => k === f)?.[1] ?? f
