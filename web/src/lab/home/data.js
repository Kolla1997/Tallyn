// Draft data for #182, Home. All names and amounts are made up.
// Totals are computed from the rows and checked below (taste-skill: the numbers must agree).

const rates = { USD: 1, GBP: 1.3, EUR: 1.08 }
const cents = (n) => Math.round(n * 100) / 100

export const accounts = [
  { who: 'maya', name: 'Everyday checking', bank: 'Chase', last4: '4821', cur: 'USD', bal: 6240.18 },
  { who: 'maya', name: 'High-yield savings', bank: 'Ally', last4: '1180', cur: 'USD', bal: 18400.0 },
  { who: 'maya', name: 'UK current account', bank: 'Monzo', last4: '0392', cur: 'GBP', bal: 2150.0 },
  { who: 'maya', name: 'Euro account', bank: 'Wise', last4: '5527', cur: 'EUR', bal: 1480.0 },
  { who: 'maya', name: 'Credit card', bank: 'Amex', last4: '3006', cur: 'USD', bal: -1286.4, note: 'due Oct 28' },
  { who: 'joint', name: 'Joint checking', bank: 'Chase', last4: '7713', cur: 'USD', bal: 3912.55 },
  { who: 'leo', name: 'Teen savings', bank: 'Chase', last4: '2209', cur: 'USD', bal: 412.0 },
].map((a) => ({ ...a, usd: cents(a.bal * rates[a.cur]), rate: rates[a.cur] }))

export const people = [
  { id: 'maya', name: 'You', initial: 'M', sub: 'Maya' },
  { id: 'joint', name: 'You and James', initial: 'M+J', sub: 'Shared with James' },
  { id: 'leo', name: 'Leo', initial: 'L', sub: '15, Teen savings' },
].map((p) => ({ ...p, accounts: accounts.filter((a) => a.who === p.id), total: cents(accounts.filter((a) => a.who === p.id).reduce((s, a) => s + a.usd, 0)) }))

export const total = cents(people.reduce((s, p) => s + p.total, 0))
export const byCur = ['USD', 'GBP', 'EUR'].map((cur) => {
  const list = accounts.filter((a) => a.cur === cur)
  return { cur, native: cents(list.reduce((s, a) => s + a.bal, 0)), usd: cents(list.reduce((s, a) => s + a.usd, 0)) }
})

// October: day 24 of 31. Bills on Oct 1 ($1,495) and Oct 12 ($145).
export const today = 24
export const days = 31
const daily = [1495, 62, 48, 90, 35, 170, 40, 55, 70, 30, 85, 240, 60, 160, 45, 72, 88, 64, 180, 52, 78, 96, 84, 87]
export const cats = [
  { name: 'Bills', planned: 1700, spent: 1640 },
  { name: 'Groceries', planned: 900, spent: 812 },
  { name: 'Kids', planned: 500, spent: 420 },
  { name: 'Eating out', planned: 300, spent: 264 },
  { name: 'Transport', planned: 350, spent: 190 },
  { name: 'Fun', planned: 850, spent: 160 },
]
export const planned = cats.reduce((s, c) => s + c.planned, 0)
export const spent = cats.reduce((s, c) => s + c.spent, 0)
export const left = planned - spent
const perDay = Math.round((spent - 1640) / (today - 1))
let run = 0
// One row per day: spent so far (a forecast after today), and an even pace to the plan.
export const series = Array.from({ length: days }, (_, i) => {
  run += i < today ? daily[i] : perDay
  return { date: new Date(2026, 9, i + 1), spent: run, pace: Math.round((planned * (i + 1)) / days) }
})
export const forecastEnd = series[days - 1].spent

export const due = [
  { name: 'Amex card', when: 'Oct 28', inDays: 4, from: 'Everyday checking', amt: 1286.4 },
  { name: 'Car loan', when: 'Nov 1', inDays: 8, from: 'Joint checking', amt: 386.0 },
  { name: "Leo's allowance", when: 'Nov 1', inDays: 8, from: 'Joint checking', amt: 40.0 },
]
export const dueTotal = cents(due.reduce((s, d) => s + d.amt, 0))

export const goals = [
  { name: 'Beach trip', saved: 3400, target: 5000, by: 'June 2027', how: 'You update this one', who: 'maya' },
  { name: "Leo's school fund", saved: 412, target: 1000, by: 'September 2027', how: 'Follows Teen savings', who: 'leo' },
]

const groceries = cats.find((c) => c.name === 'Groceries')
export const finding = {
  strong: `Groceries is at $${groceries.spent} of $${groceries.planned}`,
  rest: ` with ${days - today} days to go. $${left.toLocaleString('en-US')} left in October's plan in all.`,
}

console.assert(total === 32071.73, 'total', total)
console.assert(cents(byCur.reduce((s, c) => s + c.usd, 0)) === total, 'currencies sum to the total')
console.assert(series[today - 1].spent === spent, 'daily spending sums to the categories')
console.assert(planned === 4600 && spent === 3486 && left === 1114, 'plan')
console.assert(dueTotal === 1712.4, 'due total')
console.assert(goals[1].saved === accounts.find((a) => a.name === 'Teen savings').bal, "Leo's goal follows Teen savings")

export const usd = (v, d = 2) => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
export const native = (a) =>
  ({ USD: '$', GBP: '£', EUR: '€' })[a.cur] + Math.abs(a.bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
