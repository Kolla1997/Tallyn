// Budgets (#13): the sums behind the Budgets page. The server sends each
// budget's spending per day for its current period (internal/db/budgets.go);
// these turn that into what's left, the pace and the pictures.

// The categories a budget can cover: Plaid's spending categories. Income,
// transfers and loan payments never count (0015_budgets.sql).
export const BUDGET_CATEGORIES = [
  'FOOD_AND_DRINK',
  'GENERAL_MERCHANDISE',
  'RENT_AND_UTILITIES',
  'TRANSPORTATION',
  'TRAVEL',
  'ENTERTAINMENT',
  'PERSONAL_CARE',
  'MEDICAL',
  'HOME_IMPROVEMENT',
  'GENERAL_SERVICES',
  'GOVERNMENT_AND_NON_PROFIT',
  'BANK_FEES',
]

const DAY = 86400000
const at = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))

// How far through a budget's period today is: its length in days, which day
// today is (1 = the first), the share gone (counting today) and days to go
// after today.
export function periodInfo(b, today) {
  const days = Math.round((at(b.to) - at(b.from)) / DAY)
  const day = Math.min(days, Math.max(1, Math.round((at(today) - at(b.from)) / DAY) + 1))
  return { days, day, elapsed: day / days, left: days - day }
}

// ok under 80%, warn from 80%, over past 100% (Design System: budget colours).
export function tone(spent, amount) {
  const p = spent / amount
  return p > 1 ? 'over' : p >= 0.8 ? 'warn' : 'ok'
}

// Spending compared with how far through the period we are. More than 12
// points ahead of an even pace is "Ahead of pace".
export function pace(spent, amount, elapsed) {
  if (spent > amount) return 'over'
  if (spent / amount >= 0.999) return 'full'
  return spent / amount - elapsed > 0.12 ? 'ahead' : 'on'
}

// Running total through the period, one point per day from the start (0) to
// the end of today: [[dayIndex, total], ...].
export function runningTotals(b, today) {
  const { day } = periodInfo(b, today)
  const byDay = new Map(b.days.map((d) => [Math.round((at(d.date) - at(b.from)) / DAY), d.amount_minor]))
  const pts = [[0, 0]]
  let total = 0
  for (let i = 0; i < day; i++) {
    total += byDay.get(i) ?? 0
    pts.push([i + 1, total])
  }
  return pts
}

// The currency's decimals: 2 for USD, 0 for JPY.
export function decimals(currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  } catch {
    return 2
  }
}

// An amount as people write it (#146): digits, maybe split into groups of three
// by one separator, then maybe a decimal point or comma.
const AMOUNT = /^(\d{1,3}([,.\s'’])\d{3}(?:\2\d{3})*|\d+)(?:([.,])(\d*))?$/u

// "1,250.5" → 125050 for USD, and "12,50" → 1250 for EUR. A currency sign or
// code before or after is ignored. A comma before one or two digits is a
// decimal point, before three a thousands separator; when both "." and ","
// appear, the last is the decimal point. null when it isn't a positive amount
// with at most the currency's decimals, or could be read two ways ("1.250").
export function toMinor(text, currency) {
  const d = decimals(currency)
  const s = String(text)
    .trim()
    .replace(/^(?:\p{Sc}|[A-Za-z]{3}(?![A-Za-z]))\s*/u, '')
    .replace(/\s*(?:\p{Sc}|(?<![A-Za-z])[A-Za-z]{3})$/u, '')
  const m = s.match(AMOUNT)
  if (!m) return null
  const [, whole, group, point, frac] = m
  if (group && group === point) return null // "1,250,50"
  if (group === '.' && !point) return null // "1.250": 1250 or 1.25?
  if (point && (!d || frac.length > d)) return null
  const minor = Number(whole.replace(/\D/g, '')) * 10 ** d + Number((frac ?? '').padEnd(d, '0') || 0)
  return minor > 0 && minor <= 100_000_000_000 ? minor : null
}

// 125050 → "1250.50" for the amount field.
export function fromMinor(minor, currency) {
  const d = decimals(currency)
  return d ? (minor / 10 ** d).toFixed(d) : String(minor)
}

// Whom the current person may set budgets for, from their role: the
// household (owners and adults), themselves (anyone but teens and children)
// and each teen or child (owners and adults). Mirrors can_manage_budget().
export function coverChoices(role, myId, members) {
  const kid = (r) => r === 'teen' || r === 'child'
  const grown = role === 'owner' || role === 'adult'
  const out = []
  if (grown) out.push('')
  if (!kid(role)) out.push(myId)
  if (grown) out.push(...members.filter((m) => kid(m.role) && m.user_id !== myId).map((m) => m.user_id))
  return out
}
