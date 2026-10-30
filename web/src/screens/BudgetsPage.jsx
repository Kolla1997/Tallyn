import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { curveLinear } from '@visx/curve'
import { LineChart } from '@/components/charts/line-chart'
import { Line } from '@/components/charts/line'
import PageSkeleton from '../components/calm/PageSkeleton.jsx'
import LoadFailed, { StaleBanner } from '../components/LoadFailed.jsx'
import { useRetry } from '../lib/retry.js'
import { api } from '../lib/api.js'
import { BUDGET_CATEGORIES, coverChoices, fromMinor, pace, periodInfo, runningTotals, tone, toMinor } from '../lib/budgets.js'
import { todayISO } from '../lib/cards.js'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { Head, Panel, Chips, Pill, NUM, MUTED, OWE } from '../components/calm/ui.jsx'
import CountUp from '../components/CountUp.jsx'

// Budgets on load (#232): one-person rows fill one after another from 800ms, a notch every 14ms.
const NOTCH_MS = 14
const ROWS_FROM = 800
const ROW_GAP = 150
import IncomePlan from './IncomePlan.jsx'
import { useModal } from '../lib/modal.js'

// Budgets (#13, ADR 0014), in the calm redesign (#187, the #185 draft): the plan from your
// income, who counts and your own switch, household budgets as cards with a pace line (spent so
// far against an even pace, drawn by Bklit) and a pace pill, and budgets for one person as rows
// of notches, one per day, today outlined. Only daily totals reach the browser, never transactions.

const KID = new Set(['teen', 'child'])
const PACE = {
  on: 'On pace',
  ahead: 'Ahead of pace',
  full: 'All used, as planned',
  over: 'Over budget',
}
const PERIOD = { month: 'every month', week: 'every week' }
const FIELD = 'h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[14px]'
const NOTE = `m-0 text-[13px] ${MUTED}`
const CHANGE =
  'shrink-0 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4 hover:text-zinc-900 dark:hover:text-white'

const what = (b) => (b.category ? categoryLabel(b.category) : 'Everything')
const toGo = (n) => (n === 0 ? 'last day' : `${n} ${n === 1 ? 'day' : 'days'} to go`)

function Left({ b, money }) {
  const cls = `text-[14px] ${NUM}`
  if (b.spent_minor > b.amount_minor)
    return (
      <span className={cls} style={OWE}>
        <CountUp value={b.spent_minor - b.amount_minor} start={0} format={money} /> over
      </span>
    )
  if (b.spent_minor === b.amount_minor) return <span className={cls}>All used</span>
  return (
    <span className={cls}>
      <CountUp value={b.amount_minor - b.spent_minor} start={0} format={money} /> left
    </span>
  )
}

// Red only when it needs a look: ahead of pace or over.
function PacePill({ b, today, late }) {
  const p = pace(b.spent_minor, b.amount_minor, periodInfo(b, today).elapsed)
  const warn = p === 'over' || p === 'ahead'
  return (
    <span
      className={`${late ? 'calm-late-at ' : ''}shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${warn ? 'bg-red-50 dark:bg-red-950/40' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'}`}
      style={{ ...(warn ? OWE : {}), ...(late ? { '--e': late } : {}) }}
    >
      {PACE[p]}
    </span>
  )
}

// From the start of the period to today: spent so far (solid) against an even pace (dashed).
export function PaceLine({ b, today }) {
  const data = useMemo(() => {
    const { days } = periodInfo(b, today)
    const start = new Date(`${b.from}T12:00:00`)
    return runningTotals(b, today).map(([d, v]) => ({
      date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + d),
      spent: v,
      even: Math.round((b.amount_minor * d) / days),
    }))
  }, [b, today])
  const p = pace(b.spent_minor, b.amount_minor, periodInfo(b, today).elapsed)
  const warn = p === 'over' || p === 'ahead'
  return (
    <div className="mt-2" aria-hidden="true">
      <LineChart data={data} aspectRatio="3 / 1" margin={{ left: 0, right: 0, top: 4, bottom: 4 }}>
        <Line
          dataKey="even"
          curve={curveLinear}
          fadeEdges={false}
          stroke="var(--color-redesign-grey-2)"
          strokeWidth={1.5}
          dashFromIndex={0}
          showHighlight={false}
          animate={false}
        />
        <Line
          dataKey="spent"
          curve={curveLinear}
          fadeEdges={false}
          stroke={warn ? 'var(--color-redesign-accent)' : 'var(--color-redesign-grey-3)'}
          strokeWidth={2}
          animate={false}
        />
      </LineChart>
    </div>
  )
}

// One notch per day of the period. Filled notches show the share spent; the outlined notch is today.
// `start` (#232): on load the filled notches pop in one by one from that delay, 14ms apart, and the
// today outline lands after them.
export function DayNotches({ b, today, start }) {
  const { days, day } = periodInfo(b, today)
  const filled = Math.round(Math.min(1, b.spent_minor / b.amount_minor) * days)
  const fill = tone(b.spent_minor, b.amount_minor) === 'ok' ? 'bg-zinc-600' : 'bg-[var(--color-redesign-accent)]'
  return (
    <div className="day-notches flex grow gap-[3px]" aria-hidden="true">
      {Array.from({ length: days }, (_, i) => (
        <i
          key={i}
          style={start == null ? undefined : { '--d': `${start + i * NOTCH_MS}ms`, '--e': `${start + filled * NOTCH_MS}ms` }}
          className={`h-6 grow rounded-[3px] ${start != null && i < filled ? 'calm-pop ' : ''}${start != null && i === day - 1 ? 'calm-ring ' : ''}${i < filled ? `on ${fill}` : 'bg-zinc-200 dark:bg-zinc-700'} ${i === day - 1 ? 'today ring-2 ring-zinc-900 dark:ring-white ring-offset-1 dark:ring-offset-zinc-900' : ''}`}
        />
      ))}
    </div>
  )
}

function HouseholdBudget({ b, today, money, onChange }) {
  return (
    <li className="calm-solid budget-tile rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-semibold">{what(b)}</h3>
          <p className={NOTE}>
            {money(b.spent_minor)} of {money(b.amount_minor)}, {PERIOD[b.period]}
          </p>
        </div>
        <PacePill b={b} today={today} />
      </div>
      <PaceLine b={b} today={today} />
      <div className="mt-1 flex items-center justify-between gap-2">
        <Left b={b} money={money} />
        {b.can_manage && (
          <button type="button" className={CHANGE} onClick={onChange} aria-label={`Change the ${what(b)} budget`}>
            Change
          </button>
        )}
      </div>
    </li>
  )
}

function PersonBudget({ b, name, today, money, onChange, start }) {
  const { left, days } = periodInfo(b, today)
  const done = `${start + Math.round(Math.min(1, b.spent_minor / b.amount_minor) * days) * NOTCH_MS}ms`
  return (
    <li className="calm-solid budget-row flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
      <div className="min-w-44">
        <h3 className="m-0 text-[15px] font-semibold">{name}</h3>
        <p className={NOTE}>
          {what(b)}, {PERIOD[b.period]}
        </p>
      </div>
      <DayNotches b={b} today={today} start={start} />
      <div className="flex flex-wrap items-center gap-3 sm:min-w-64 sm:justify-end">
        <span className="grid text-right">
          <Left b={b} money={money} />
          <span className={NOTE}>
            {money(b.spent_minor)} of {money(b.amount_minor)}, {toGo(left)}
          </span>
        </span>
        <PacePill b={b} today={today} late={done} />
        {b.can_manage && (
          <button
            type="button"
            className={CHANGE}
            onClick={onChange}
            aria-label={name === 'You' ? `Change your ${what(b)} budget` : `Change ${name}'s ${what(b)} budget`}
          >
            Change
          </button>
        )}
      </div>
    </li>
  )
}

function SectionHead({ id, title, note }) {
  return (
    <div className="mt-1 mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="m-0 font-[family-name:var(--font-heading)] text-[15px] font-semibold">
        {title}
      </h2>
      <p className={NOTE}>{note}</p>
    </div>
  )
}

export default function BudgetsPage({ me, household, refreshKey }) {
  const [data, setData] = useState(null)
  const [members, setMembers] = useState([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // {} to add, a budget to change
  const [reload, setReload] = useState(0)
  const home = household.home_currency
  const money = useCallback((v) => formatMoney(v, home), [home])
  const today = todayISO()

  const [failed, setFailed] = useState(false) // the last load failed (#151)
  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    return Promise.all([api(`/api/budgets?household_id=${hh}&today=${today}`), api(`/api/households/${hh}/members`)]).then(
      ([b, m]) => {
        setData(b)
        setMembers(m.members)
        setError('')
        setFailed(false)
      },
      () => setFailed(true),
    )
  }, [household.id, today])

  useEffect(() => {
    load()
  }, [load, refreshKey, reload])
  const [retrying, retry] = useRetry(load)

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const choices = coverChoices(household.role, me.user_id, members)
  const kid = KID.has(household.role)

  const monthEnd = new Date(+today.slice(0, 4), +today.slice(5, 7), 0).getDate()
  const daysToGo = monthEnd - +today.slice(8, 10)
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'long' })

  const budgets = data?.budgets ?? []
  const shared = budgets.filter((b) => !b.member_user_id)
  const personal = budgets.filter((b) => b.member_user_id)
  const rowStarts = []
  personal.reduce((at, b) => {
    rowStarts.push(at)
    const { days } = periodInfo(b, data.today)
    return at + Math.round(Math.min(1, b.spent_minor / b.amount_minor) * days) * NOTCH_MS + ROW_GAP
  }, ROWS_FROM)
  const mine = data?.counting.find((c) => c.user_id === me.user_id)

  async function setCount(on) {
    setError('')
    try {
      await api('/api/budgets/counting', { method: 'PUT', body: { household_id: household.id, count: on } })
      setReload((r) => r + 1)
    } catch {
      setError("We couldn't change that. Try again in a moment.")
    }
  }

  const add = choices.length > 0 && (
    <Pill icon={Plus} onClick={() => setEditing({})}>
      Add a budget
    </Pill>
  )

  return (
    <div className="calm">
      <Head title="Budgets" sub={`${monthName}, ${toGo(daysToGo)}`}>
        {add}
      </Head>

      <div className="grid gap-3">
        <IncomePlan me={me} household={household} today={today} />
        {error && (
          <p className="m-0 text-[14px] font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}

        {failed && data && <StaleBanner busy={retrying} onRetry={retry} />}
        {!data ? (
          failed ? (
            <LoadFailed busy={retrying} onRetry={retry} />
          ) : (
            <PageSkeleton />
          )
        ) : (
          <>
            <Panel label="Whose spending counts">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Counting counting={data.counting} people={people} me={me} />
                {kid ? (
                  <p className={NOTE}>Your spending counts in household budgets automatically, as totals only.</p>
                ) : (
                  <label className="flex cursor-pointer flex-row items-center gap-2 text-[14px] font-semibold">
                    <input type="checkbox" role="switch" checked={!!mine?.counted} onChange={(e) => setCount(e.target.checked)} className="peer sr-only" />
                    <span
                      aria-hidden="true"
                      className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600 transition-colors duration-150 peer-checked:bg-[var(--color-redesign-in)] dark:peer-checked:bg-[var(--color-redesign-in)] peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900 dark:peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-150 peer-checked:after:translate-x-4 motion-reduce:after:transition-none"
                    />
                    Count my spending in household budgets (totals only)
                  </label>
                )}
              </div>
            </Panel>

            {budgets.length === 0 ? (
              <Panel id="budgets-empty" title="No budgets yet">
                <p className={`m-0 mb-3 text-[14px] ${MUTED}`}>
                  Set an amount for a week or a month, for everything or one kind of spending, and see how it&apos;s going as you spend.
                </p>
                {add}
              </Panel>
            ) : (
              <>
                {shared.length > 0 && (
                  <section aria-labelledby="budgets-household">
                    <SectionHead
                      id="budgets-household"
                      title="Household budgets"
                      note="From the start of each budget to today. Solid line: spent. Dashed: an even pace."
                    />
                    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                      {shared.map((b) => (
                        <HouseholdBudget key={b.id} b={b} today={data.today} money={money} onChange={() => setEditing(b)} />
                      ))}
                    </ul>
                  </section>
                )}

                {personal.length > 0 && (
                  <section aria-labelledby="budgets-person">
                    <SectionHead id="budgets-person" title="Budgets for one person" note="One notch per day. Outlined: today." />
                    <ul className="m-0 grid list-none gap-3 p-0">
                      {personal.map((b, k) => {
                        const p = people[b.member_user_id] ?? { user_id: b.member_user_id }
                        const name = b.member_user_id === me.user_id ? 'You' : nameOf(p)
                        return (
                          <PersonBudget key={b.id} b={b} name={name} today={data.today} money={money} onChange={() => setEditing(b)} start={rowStarts[k]} />
                        )
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}

            <p className={NOTE}>Coinroof can&apos;t stop a payment. It shows how each budget is going, so you can decide what to do.</p>
          </>
        )}
      </div>

      {editing && (
        <BudgetDialog
          budget={editing.id ? editing : null}
          choices={choices}
          people={people}
          me={me}
          household={household}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setReload((r) => r + 1)
          }}
        />
      )}
    </div>
  )
}

// Whose spending counts in household budgets: names only, never amounts.
function Counting({ counting, people, me }) {
  const counted = counting.filter((c) => c.counted)
  const label = (c) => {
    const name = c.user_id === me.user_id ? 'you' : nameOf(people[c.user_id] ?? { user_id: c.user_id })
    if (!c.automatic) return name
    const role = people[c.user_id]?.role === 'child' ? 'child' : 'teen'
    return `${name} (${role}, automatically)`
  }
  if (counted.length === 0) {
    return <p className={NOTE}>No one&apos;s spending counts in household budgets yet. Each adult chooses for themselves.</p>
  }
  const names = counted.map(label)
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return (
    <p className={NOTE}>
      Counting in household budgets: {list}. <b className="font-semibold text-zinc-900 dark:text-white">Totals only, never transactions.</b>
    </p>
  )
}

// Add or change a budget. Whom it covers is set once; to change that, delete
// it and add a new one.
function BudgetDialog({ budget, choices, people, me, household, onClose, onSaved }) {
  const ref = useRef(null)
  const cur = household.home_currency
  const [cover, setCover] = useState(budget ? (budget.member_user_id ?? '') : choices[0])
  const [category, setCategory] = useState(budget?.category ?? '')
  const [period, setPeriod] = useState(budget?.period ?? 'month')
  const [amount, setAmount] = useState(budget ? fromMinor(budget.amount_minor, cur) : '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useModal(ref)

  const coverName = (id) => (id === '' ? 'The household' : id === me.user_id ? 'You' : nameOf(people[id] ?? { user_id: id }))
  const minor = toMinor(amount, cur)

  async function run(fn) {
    setError('')
    setBusy(true)
    try {
      await fn()
      onSaved()
    } catch {
      setError("We couldn't save that. Check the amount and try again.")
      setBusy(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!minor || busy) return
    const body = { category, period, amount_minor: minor }
    run(() =>
      budget
        ? api(`/api/budgets/${budget.id}`, { method: 'PUT', body })
        : api('/api/budgets', { method: 'POST', body: { household_id: household.id, member_user_id: cover, ...body } }),
    )
  }

  return (
    <dialog
      ref={ref}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-white dark:bg-zinc-900 p-5 text-zinc-900 dark:text-white shadow-2xl backdrop:bg-black/40"
      aria-labelledby="budget-title"
      onCancel={(e) => (busy ? e.preventDefault() : onClose())}
    >
      <form onSubmit={submit} className="grid gap-3 text-[14px]">
        <h2 id="budget-title" className="m-0 mb-1 font-[family-name:var(--font-heading)] text-[18px] font-semibold">
          {budget ? `Change the ${what(budget)} budget` : 'Add a budget'}
        </h2>
        <label className="grid gap-1">
          <span className="font-semibold">Covers</span>
          <select className={FIELD} value={cover} onChange={(e) => setCover(e.target.value)} disabled={!!budget}>
            {(budget ? [cover] : choices).map((id) => (
              <option key={id || 'household'} value={id}>
                {coverName(id)}
              </option>
            ))}
          </select>
          {cover === '' && <span className={NOTE}>Counts the spending of teens, children and anyone who chose to count theirs.</span>}
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Spending on</span>
          <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Everything</option>
            {BUDGET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 p-0 font-semibold">Every</legend>
          <Chips
            label="Every"
            options={[
              ['month', 'Month'],
              ['week', 'Week'],
            ]}
            value={period}
            onChange={setPeriod}
          />
        </fieldset>
        <label className="grid gap-1">
          <span className="font-semibold">Amount ({cur})</span>
          <input
            className={FIELD}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
          {amount && !minor && (
            <span className="text-[13px] font-semibold" style={OWE}>
              Enter an amount above zero, like 250 or 250.50.
            </span>
          )}
        </label>
        {error && (
          <p className="m-0 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {budget ? (
            confirmDelete ? (
              <Pill disabled={busy} onClick={() => run(() => api(`/api/budgets/${budget.id}`, { method: 'DELETE' }))}>
                Yes, delete it
              </Pill>
            ) : (
              <Pill quiet disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete
              </Pill>
            )
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Pill quiet onClick={onClose} disabled={busy}>
              Cancel
            </Pill>
            <Pill type="submit" disabled={!minor || busy}>
              {busy ? 'Saving…' : budget ? 'Save' : 'Add budget'}
            </Pill>
          </span>
        </div>
      </form>
    </dialog>
  )
}
