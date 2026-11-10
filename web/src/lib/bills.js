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

// Credit cards' next payments from Plaid, as dues in month ('YYYY-MM'). The bank says
// when it's paid: a payment on or after the last statement that covers the minimum.
// Left to pay counts the minimum (Dinesh, 2026-11-09).
export function cardDues(banks, month) {
  const out = []
  for (const b of banks ?? []) {
    for (const a of b.accounts ?? []) {
      const c = a.card
      if (!c?.next_payment_due_date || c.next_payment_due_date.slice(0, 7) !== month) continue
      const min = c.minimum_payment_minor ?? 0
      const paid = !!c.last_payment_date && !!c.last_statement_date && c.last_payment_date >= c.last_statement_date && (c.last_payment_minor ?? 0) >= min
      out.push({
        bill_id: `card-${a.id}`,
        card: true,
        name: a.mask ? `${a.name} ••${a.mask}` : a.name,
        currency: a.currency,
        due: c.next_payment_due_date,
        status: c.is_overdue ? 'late' : paid ? 'paid' : 'due',
        expected_minor: min,
        paid_minor: paid ? min : null,
        paid_on: paid ? c.last_payment_date : null,
        statement_minor: c.last_statement_balance_minor ?? null,
      })
    }
  }
  return out
}
