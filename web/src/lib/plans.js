import { pace, periodInfo } from './budgets.js'

// Plan from your income (#133, Dinesh picked 3A): the sums and words behind
// the plan on the Budgets page. The server sends each plan with its money
// this month per base bucket (internal/db/plans.go); these turn that into
// jobs, their state and the one-sentence answer.

// The templates. The two named ones have fixed shares; "own" is any split of
// the five buckets that adds up to 100.
export const TEMPLATES = {
  '55-5-10-15-15': { label: '55 / 5 / 10 / 15 / 15', shares: { essentials: 55, guilt_free: 5, debt: 10, short_term: 15, long_term: 15 } },
  '50-30-20': { label: '50 / 30 / 20', shares: { needs: 50, wants: 30, save: 20 } },
  own: { label: 'Your own' },
}

export const BUCKETS = ['essentials', 'guilt_free', 'debt', 'short_term', 'long_term']

// Each job: its name, what it's for, whether it's spending (less is better)
// or money you move (reaching it is the goal), the buckets it adds up, and
// where the leftover goes in the answer sentence.
export const JOBS = {
  essentials: { name: 'Essentials', for: 'rent, groceries, bills and transport', kind: 'spend', base: ['essentials'] },
  guilt_free: { name: 'Guilt-free', for: 'eating out, fun and shopping', kind: 'spend', base: ['guilt_free'] },
  debt: { name: 'Debt / Invest', for: 'loan payments (not card bills)', kind: 'move', base: ['debt'], to: 'your loans' },
  short_term: { name: 'Short-term goals', for: 'money moved to savings', kind: 'move', base: ['short_term'], to: 'savings' },
  long_term: { name: 'Long-term wealth', for: 'money moved to investments', kind: 'move', base: ['long_term'], to: 'investments' },
  needs: { name: 'Needs', for: 'rent, groceries, bills and transport', kind: 'spend', base: ['essentials'] },
  wants: { name: 'Wants', for: 'eating out, fun and shopping', kind: 'spend', base: ['guilt_free'] },
  save: {
    name: 'Savings & debt',
    for: 'loan payments, and money moved to savings and investments',
    kind: 'move',
    base: ['debt', 'short_term', 'long_term'],
    to: 'savings and loans',
  },
}

// The order jobs always show in. The stored shares can come back in any
// key order (Postgres sorts a jsonb object's keys), so never use theirs.
const ORDER = [...BUCKETS, 'needs', 'wants', 'save']

// The jobs of a plan, in the template's order, with what's planned and used
// this month and their state: on, ahead, full or over (spending), done or
// tomove (moving). A job with a 0% share is left out.
export function jobs(plan, today) {
  const { elapsed } = periodInfo(plan, today)
  return Object.entries(plan.shares)
    .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .filter(([, share]) => share > 0)
    .map(([key, share]) => {
      const job = JOBS[key]
      const planned = Math.round((plan.monthly_income_minor * share) / 100)
      const used = job.base.reduce((sum, b) => sum + (plan.progress?.[b] ?? 0), 0)
      const state = job.kind === 'spend' ? pace(used, planned, elapsed) : used >= planned ? 'done' : 'tomove'
      return { key, ...job, share, planned, used, state }
    })
}

// The answer, in words (#133: answer first, then logic, then data).
export function answer(list, plan, today, money) {
  const { day, days } = periodInfo(plan, today)
  const over = list.filter((j) => j.state === 'over')
  const ahead = list.filter((j) => j.state === 'ahead')
  const title =
    over.length >= 2 ? 'A few jobs need a look this month.' : over.length || ahead.length ? "You're mostly on track this month." : "You're on track this month."
  const parts = over.map((j) => `${j.name} is ${money(j.used - j.planned)} over`)
  if (!over.length && ahead.length) parts.push(`${ahead[0].name} is ahead of pace`)
  const moving = list.filter((j) => j.state === 'tomove').sort((a, b) => b.planned - b.used - (a.planned - a.used))[0]
  if (moving) parts.push(`${money(moving.planned - moving.used)} is still to move to ${moving.to}`)
  const sentence = parts.length ? `${capital(parts.join(', and '))}. ` : ''
  return { title, detail: `${sentence}${day} of ${days} days gone.` }
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// The three months the income suggestion averages, for the note under it:
// "July to September" when today is in October.
export function suggestionMonths(today) {
  const d = new Date(`${today}T12:00:00Z`)
  const name = (back) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  return `${name(3)} to ${name(1)}`
}

// Shares for "your own": whole percents from 0 to 100 adding up to 100.
export function ownSharesOk(shares) {
  const values = BUCKETS.map((k) => shares[k])
  return values.every((v) => Number.isInteger(v) && v >= 0 && v <= 100) && values.reduce((a, b) => a + b, 0) === 100
}
