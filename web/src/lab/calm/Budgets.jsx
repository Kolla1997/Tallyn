// Budgets, calm draft (#185). Same jobs as web/src/screens/BudgetsPage.jsx and IncomePlan.jsx:
// Plan from your income (whose plan, the answer first, the split, how each job is going), who
// counts in household budgets and your own switch, household budgets with a pace line and a pace
// pill, budgets for one person as day notches (today outlined), and Add / Change a budget.
// Pace and tone come from the app's own web/src/lib/budgets.js. Bklit draws the pace lines.
// Made-up names and amounts.
import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { curveLinear } from '@visx/curve'
import { LineChart } from '@/components/charts/line-chart'
import { Line } from '@/components/charts/line'
import { pace, tone } from '../../lib/budgets.js'
import * as D from '../home/data.js'
import { Panel, Note, Chips, PageHead, Button, usd } from './ui.jsx'

const PACE = { on: 'On pace', ahead: 'Ahead of pace', over: 'Over budget', full: 'All used' }
const elapsed = D.today / D.days
const daysLeft = D.days - D.today

// ---- Plan from your income (household, $6,400 a month, 55/5/10/15/15) ----
const INCOME = 6400
const PLAN = [
  { key: 'essentials', name: 'Essentials', for: 'rent, groceries, bills and transport', share: 55, used: 3062 },
  { key: 'guilt_free', name: 'Guilt-free', for: 'eating out, fun and shopping', share: 5, used: 424 },
  { key: 'debt', name: 'Debt / Invest', for: 'loan payments (not card bills)', share: 10, used: 386 },
  { key: 'short_term', name: 'Short-term goals', for: 'money moved to savings', share: 15, used: 500 },
  { key: 'long_term', name: 'Long-term wealth', for: 'money moved to investments', share: 15, used: 0 },
].map((j) => ({ ...j, planned: (INCOME * j.share) / 100 }))
// Essentials = Bills $1,640 + Groceries $812 + Kids $420 + Transport $190 = $3,062; Guilt-free = Eating out $264 + Fun $160.
console.assert(PLAN[0].used === 1640 + 812 + 420 + 190 && PLAN[1].used === 264 + 160, 'plan uses the October spending')
const JOB_TONE = ['#18181b', '#dc2626', '#71717a', '#16a34a', '#a1a1aa']

function Plan() {
  const [whose, setWhose] = useState('household')
  const over = PLAN.filter((j) => j.used > j.planned)
  const answer = over.length >= 2 ? 'A few jobs need a look this month.' : over.length ? 'You’re mostly on track this month.' : 'You’re on track this month.'
  return (
    <Panel id="plan-h" title="Plan from your income" meta="55 / 5 / 10 / 15 / 15 · Change">
      <Chips
        label="Whose plan"
        options={[
          ['household', 'Household'],
          ['you', 'You'],
        ]}
        value={whose}
        onChange={setWhose}
      />
      <p className="mt-3 font-[family-name:'Space_Grotesk'] text-xl font-semibold">{answer}</p>
      <Note>
        {usd(INCOME, 0)} a month from your income. {over.map((j) => `${j.name} is ${usd(j.used - j.planned, 0)} over`).join('; ')}.
      </Note>
      <h3 className="mt-4 mb-1.5 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">How your income is split</h3>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {PLAN.map((j, i) => (
          <span key={j.key} style={{ width: `${j.share}%`, background: JOB_TONE[i] }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-600 dark:text-zinc-300">
        {PLAN.map((j, i) => (
          <li key={j.key}>
            <i className="mr-1.5 inline-block size-2 rounded-full" style={{ background: JOB_TONE[i] }} />
            {j.name} {j.share}% · {usd(j.planned, 0)}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 mb-1 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">How each job is going</h3>
      <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {PLAN.map((j) => {
          const isOver = j.used > j.planned
          return (
            <li key={j.key} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-semibold">{j.name}</span>
                <span className="font-[family-name:'Space_Grotesk'] font-semibold tabular-nums" style={isOver ? { color: 'var(--owe-text)' } : undefined}>
                  {usd(j.used, 0)}
                </span>
              </div>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, (j.used / j.planned) * 100)}%`, background: isOver ? 'var(--accent)' : '#71717a' }}
                />
              </span>
              <Note className="mt-1">
                {isOver ? `${usd(j.used - j.planned, 0)} over ${usd(j.planned, 0)}` : `${usd(j.planned - j.used, 0)} left of ${usd(j.planned, 0)}`} · {j.for}
              </Note>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// ---- Household budgets: daily totals for each category (made up, adding to October's spending) ----
function dailyFor(name, total) {
  if (name === 'Bills') return Array.from({ length: D.today }, (_, i) => (i === 0 ? 1495 : i === 11 ? 145 : 0))
  if (name === 'Kids') return Array.from({ length: D.today }, (_, i) => (i >= 1 && i <= 21 ? 20 : 0))
  let seed = name.length * 97
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const raw = Array.from({ length: D.today }, () => (rnd() < 0.55 ? rnd() : 0))
  const sum = raw.reduce((a, b) => a + b, 0)
  const out = raw.map((v) => Math.round((v / sum) * total))
  out[D.today - 1] += total - out.reduce((a, b) => a + b, 0) // exact total
  return out
}

// October 1 to today only: spent so far (solid) against an even pace so far (dashed).
function PaceChart({ name, planned, spent }) {
  const data = useMemo(() => {
    const days = dailyFor(name, spent)
    const cum = days.reduce((acc, d) => [...acc, (acc.at(-1) ?? 0) + d], [])
    return cum.map((v, i) => ({ date: new Date(2026, 9, i + 1), spent: v, even: Math.round((planned * (i + 1)) / D.days) }))
  }, [name, planned, spent])
  // Red follows the pace pill: only ahead of pace or over.
  const warn = ['ahead', 'over'].includes(pace(spent, planned, elapsed))
  return (
    <div className="mt-2">
      <LineChart data={data} aspectRatio="3 / 1" margin={{ left: 0, right: 0, top: 4, bottom: 4 }}>
        <Line dataKey="even" curve={curveLinear} fadeEdges={false} stroke="#a1a1aa" strokeWidth={1.5} dashFromIndex={0} showHighlight={false} animate={false} />
        <Line dataKey="spent" curve={curveLinear} fadeEdges={false} stroke={warn ? 'var(--accent)' : '#52525b'} strokeWidth={2} animate={false} />
      </LineChart>
    </div>
  )
}

function HouseholdBudget({ b, onChange }) {
  const p = pace(b.spent, b.planned, elapsed)
  const t = tone(b.spent, b.planned)
  const left = b.planned - b.spent
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{b.name}</h3>
          <Note>
            {usd(b.spent, 0)} of {usd(b.planned, 0)} · every month
          </Note>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            p === 'over' || p === 'ahead'
              ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          {PACE[p]}
        </span>
      </div>
      <PaceChart name={b.name} planned={b.planned} spent={b.spent} />
      <div className="mt-1 flex items-center justify-between text-[13px]">
        <span className="font-semibold" style={t === 'over' ? { color: 'var(--owe-text)' } : undefined}>
          {left < 0 ? `${usd(-left, 0)} over` : left === 0 ? 'All used' : `${usd(left, 0)} left`}
        </span>
        <button
          type="button"
          onClick={onChange}
          aria-label={`Change the ${b.name} budget`}
          className="font-semibold text-zinc-600 underline underline-offset-4 dark:text-zinc-300"
        >
          Change
        </button>
      </div>
    </li>
  )
}

// ---- Budgets for one person: one notch per day, today outlined ----
const PERSON = [{ who: 'Leo', what: 'Eating out and fun', planned: 80, spent: 52.4 }]
function PersonBudget({ b, onChange }) {
  const filled = Math.round((b.spent / b.planned) * D.days)
  const t = tone(b.spent, b.planned)
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-44">
        <h3 className="text-sm font-semibold">{b.who}</h3>
        <Note>{b.what}</Note>
      </div>
      <div className="flex grow gap-[3px]" aria-hidden="true">
        {Array.from({ length: D.days }, (_, i) => (
          <span
            key={i}
            className={`h-6 grow rounded-[3px] ${i + 1 === D.today ? 'ring-2 ring-zinc-900 ring-offset-1 dark:ring-white dark:ring-offset-zinc-900' : ''} ${i < filled ? '' : 'bg-zinc-200 dark:bg-zinc-700'}`}
            style={i < filled ? { background: t === 'ok' ? '#52525b' : 'var(--accent)' } : undefined}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 sm:min-w-52 sm:justify-end">
        <Note>
          {usd(b.spent)} of {usd(b.planned, 0)} · {daysLeft} days to go
        </Note>
        <button
          type="button"
          onClick={onChange}
          aria-label={`Change ${b.who}'s budget`}
          className="text-[13px] font-semibold text-zinc-600 underline underline-offset-4 dark:text-zinc-300"
        >
          Change
        </button>
      </div>
    </li>
  )
}

// ---- Add or change a budget ----
function BudgetDialog({ budget, onClose }) {
  const [amount, setAmount] = useState(budget?.planned ? String(budget.planned) : '')
  const bad = amount !== '' && !(Number(amount) > 0)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="dlg-h" className="font-[family-name:'Space_Grotesk'] text-lg font-semibold">
            {budget?.name ? `Change the ${budget.name} budget` : 'Add a budget'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="font-semibold">Who it covers</span>
            <select className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900" disabled={!!budget?.name}>
              <option>The household</option>
              <option>You</option>
              <option>Leo</option>
            </select>
            <Note>Counts the spending of teens, children and anyone who chose to count theirs.</Note>
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Category</span>
            <select defaultValue={budget?.name} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
              <option>Everything</option>
              {D.cats.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Amount</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby="amt-help"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="250"
            />
            <span id="amt-help" className={`text-[13px] ${bad ? 'font-semibold text-[var(--owe-text)]' : 'text-zinc-500 dark:text-zinc-400'}`}>
              Enter an amount above zero, like 250 or 250.50.
            </span>
          </label>
          <fieldset className="grid gap-1">
            <legend className="mb-1 font-semibold">Every</legend>
            <Chips
              label="Every"
              options={[
                ['month', 'Month'],
                ['week', 'Week'],
              ]}
              value="month"
              onChange={() => {}}
            />
          </fieldset>
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          {budget?.name ? (
            <Button danger small>
              Delete this budget
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button quiet onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Budgets() {
  const [counted, setCounted] = useState(true)
  const [editing, setEditing] = useState(null)
  const household = D.cats.map((c) => ({ name: c.name, planned: c.planned, spent: c.spent }))
  return (
    <>
      <PageHead title="Budgets" sub={`October · ${daysLeft} days to go`}>
        <Button icon={Plus} onClick={() => setEditing({})}>
          Add a budget
        </Button>
      </PageHead>
      <div className="grid gap-3">
        <Plan />
        <Panel id="count-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Note>
              Counting in household budgets: you, James and Leo (teen, automatically).{' '}
              <b className="font-semibold text-zinc-900 dark:text-white">Totals only, never transactions.</b>
            </Note>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input type="checkbox" role="switch" checked={counted} onChange={(e) => setCounted(e.target.checked)} className="peer sr-only" />
              <span
                aria-hidden="true"
                className="relative h-5 w-9 rounded-full bg-zinc-300 transition-colors duration-150 peer-checked:bg-[var(--in)] peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-150 peer-checked:after:translate-x-4 dark:bg-zinc-700"
              />
              Count my spending in household budgets (totals only)
            </label>
          </div>
        </Panel>
        <section aria-labelledby="budgets-household">
          <div className="mt-1 mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="budgets-household" className="font-[family-name:'Space_Grotesk'] text-[15px] font-semibold">
              Household budgets
            </h2>
            <Note>Oct 1 to today · solid: spent · dashed: an even pace</Note>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {household.map((b) => (
              <HouseholdBudget key={b.name} b={b} onChange={() => setEditing(b)} />
            ))}
          </ul>
        </section>
        <section aria-labelledby="budgets-person">
          <div className="mt-1 mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="budgets-person" className="font-[family-name:'Space_Grotesk'] text-[15px] font-semibold">
              Budgets for one person
            </h2>
            <Note>One notch per day · outlined: today</Note>
          </div>
          <ul className="grid gap-3">
            {PERSON.map((b) => (
              <PersonBudget key={b.who} b={b} onChange={() => setEditing({ name: b.what, planned: b.planned })} />
            ))}
          </ul>
        </section>
      </div>
      {editing && <BudgetDialog budget={editing.name ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}
