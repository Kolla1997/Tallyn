import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BudgetsIcon } from '../components/Icons.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import { CategoryIcon } from '../components/TxIcon.jsx'
import { api } from '../lib/api.js'
import { BUDGET_CATEGORIES, coverChoices, fromMinor, pace, periodInfo, runningTotals, tone, toMinor } from '../lib/budgets.js'
import { todayISO } from '../lib/cards.js'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { PageHead } from './Shell.jsx'

// Budgets (#13, ADR 0014). Dinesh's mix: household budgets are glass tiles
// with a pace line (spending through the period against an even pace), and
// budgets for one person are rows of notches, one per day, today outlined.
// Only daily totals reach the browser, never transactions.

const KID = new Set(['teen', 'child'])
const PACE = {
  on: 'On pace',
  ahead: 'Ahead of pace',
  full: 'All used, as planned',
  over: 'Over budget',
}
const PERIOD = { month: 'monthly', week: 'weekly' }

const what = (b) => (b.category ? categoryLabel(b.category) : 'Everything')

function Left({ b, money }) {
  if (b.spent_minor > b.amount_minor) return <span className="budget-left is-over">{money(b.spent_minor - b.amount_minor)} over</span>
  if (b.spent_minor === b.amount_minor) return <span className="budget-left">All used</span>
  return <span className="budget-left">{money(b.amount_minor - b.spent_minor)} left</span>
}

function PacePill({ b, today }) {
  const p = pace(b.spent_minor, b.amount_minor, periodInfo(b, today).elapsed)
  return <span className={`pace pace-${p}`}>{PACE[p]}</span>
}

// Spending so far (solid) against an even pace to the budget (dashed).
export function PaceLine({ b, today }) {
  const W = 260
  const H = 58
  const P = 4
  const { days } = periodInfo(b, today)
  const pts = runningTotals(b, today)
  const top = Math.max(b.amount_minor, b.spent_minor) * 1.08
  const X = (d) => P + ((W - 2 * P) * d) / days
  const Y = (v) => H - P - ((H - 2 * P) * v) / top
  const line = pts.map(([d, v]) => `${X(d)},${Y(v)}`).join(' ')
  const [lx, lv] = pts.at(-1)
  return (
    <svg className={`pace-line tone-line-${tone(b.spent_minor, b.amount_minor)}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={X(0)} y1={Y(b.amount_minor)} x2={X(days)} y2={Y(b.amount_minor)} className="pace-limit" />
      <line x1={X(0)} y1={Y(0)} x2={X(days)} y2={Y(b.amount_minor)} className="pace-even" />
      <path d={`M${line.replaceAll(' ', ' L')} L${X(lx)},${Y(0)} L${X(0)},${Y(0)} Z`} className="pace-area" />
      <polyline points={line} className="pace-spent" />
      <circle cx={X(lx)} cy={Y(lv)} r="3.5" className="pace-dot" />
    </svg>
  )
}

// One notch per day of the period. Filled notches show the share spent;
// the outlined notch is today.
export function DayNotches({ b, today }) {
  const { days, day } = periodInfo(b, today)
  const filled = Math.round(Math.min(1, b.spent_minor / b.amount_minor) * days)
  const t = tone(b.spent_minor, b.amount_minor)
  return (
    <div className={`day-notches notch-${t}`} aria-hidden="true">
      {Array.from({ length: days }, (_, i) => (
        <i
          key={i}
          className={[i < filled ? 'on' : '', i === day - 1 ? 'today' : ''].join(' ').trim() || undefined}
          style={i < filled ? { '--k': `${Math.round((filled > 1 ? i / (filled - 1) : 1) * 100)}%` } : undefined}
        />
      ))}
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

  useEffect(() => {
    const hh = encodeURIComponent(household.id)
    Promise.all([api(`/api/budgets?household_id=${hh}&today=${today}`), api(`/api/households/${hh}/members`)]).then(
      ([b, m]) => {
        setData(b)
        setMembers(m.members)
        setError('')
      },
      () => setError("We couldn't load your budgets. Try again in a moment."),
    )
  }, [household.id, refreshKey, reload, today])

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const choices = coverChoices(household.role, me.user_id, members)
  const kid = KID.has(household.role)

  const monthEnd = new Date(+today.slice(0, 4), +today.slice(5, 7), 0).getDate()
  const daysToGo = monthEnd - +today.slice(8, 10)
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'long' })
  const sub = `${monthName} · ${daysToGo === 0 ? 'last day' : `${daysToGo} ${daysToGo === 1 ? 'day' : 'days'} to go`}`

  const budgets = data?.budgets ?? []
  const shared = budgets.filter((b) => !b.member_user_id)
  const personal = budgets.filter((b) => b.member_user_id)
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

  return (
    <>
      <PageHead title="Budgets" sub={sub}>
        {choices.length > 0 && (
          <button className="btn" onClick={() => setEditing({})}>
            + Add a budget
          </button>
        )}
      </PageHead>

      <div className="budgets-page">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {!data ? (
          <TallynLoader />
        ) : (
          <>
            <Counting counting={data.counting} people={people} me={me} />
            {kid ? (
              <p className="small muted">Your spending counts in household budgets automatically, as totals only.</p>
            ) : (
              <label className="switch budget-switch">
                <input type="checkbox" role="switch" checked={!!mine?.counted} onChange={(e) => setCount(e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                Count my spending in household budgets (totals only)
              </label>
            )}

            {budgets.length === 0 ? (
              <section className="panel empty-state">
                <h2>No budgets yet</h2>
                <p className="muted">Set an amount for a week or a month, for everything or one kind of spending, and see how it&apos;s going as you spend.</p>
                {choices.length > 0 && (
                  <button className="btn" onClick={() => setEditing({})}>
                    + Add a budget
                  </button>
                )}
              </section>
            ) : (
              <div className="budgets-split">
                {shared.length > 0 && (
                  <section className="panel" aria-labelledby="budgets-household">
                    <div className="budgets-head">
                      <h2 id="budgets-household">Household budgets</h2>
                      <span className="pace-key small muted" aria-hidden="true">
                        <span>
                          <b /> Spending
                        </span>
                        <span>
                          <b className="dash" /> Even pace
                        </span>
                      </span>
                    </div>
                    <div className="budget-tiles">
                      {shared.map((b) => (
                        <article key={b.id} className="budget-tile">
                          <div className="budget-top">
                            {b.category ? (
                              <CategoryIcon category={b.category} />
                            ) : (
                              <span className="tx-icon tone-sand" aria-hidden="true">
                                <BudgetsIcon />
                              </span>
                            )}
                            <h3>{what(b)}</h3>
                            <PacePill b={b} today={data.today} />
                          </div>
                          <div className="budget-nums">
                            <Left b={b} money={money} />
                            <span className="small muted">
                              {money(b.spent_minor)} of {money(b.amount_minor)} · {PERIOD[b.period]}
                            </span>
                          </div>
                          <PaceLine b={b} today={data.today} />
                          {b.can_manage && (
                            <button className="link budget-edit" onClick={() => setEditing(b)} aria-label={`Change the ${what(b)} budget`}>
                              Change
                            </button>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {personal.length > 0 && (
                  <section className="panel" aria-labelledby="budgets-person">
                    <div className="budgets-head">
                      <h2 id="budgets-person">Budgets for one person</h2>
                      <span className="small muted">Outlined: today</span>
                    </div>
                    <div>
                      {personal.map((b) => {
                        const p = people[b.member_user_id] ?? { user_id: b.member_user_id }
                        const name = b.member_user_id === me.user_id ? 'You' : nameOf(p)
                        const { left } = periodInfo(b, data.today)
                        return (
                          <article key={b.id} className="budget-row">
                            <div className="budget-row-head">
                              <Avatar member={p} />
                              <span className="grow">
                                <h3>{name}</h3>
                                <span className="small muted">
                                  {' '}
                                  · {what(b)} · {PERIOD[b.period]}
                                </span>
                              </span>
                              <Left b={b} money={money} />
                            </div>
                            <DayNotches b={b} today={data.today} />
                            <div className="budget-row-foot small muted">
                              <span>
                                {money(b.spent_minor)} of {money(b.amount_minor)} · {left === 0 ? 'last day' : `${left} ${left === 1 ? 'day' : 'days'} to go`}
                              </span>
                              <span className="budget-row-end">
                                <PacePill b={b} today={data.today} />
                                {b.can_manage && (
                                  <button className="link" onClick={() => setEditing(b)} aria-label={`Change ${name}'s ${what(b)} budget`}>
                                    Change
                                  </button>
                                )}
                              </span>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )}
              </div>
            )}

            <p className="small muted">Tallyn can&apos;t stop a payment. It shows how each budget is going, so you can decide what to do.</p>
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
    </>
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
    return <p className="budget-note">No one&apos;s spending counts in household budgets yet. Each adult chooses for themselves.</p>
  }
  const names = counted.map(label)
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return <p className="budget-note">Counting in household budgets: {list}. Totals only, never transactions.</p>
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

  useEffect(() => {
    const d = ref.current
    if (!d.open) d.showModal()
    return () => d.open && d.close()
  }, [])

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
    <dialog ref={ref} className="dialog" aria-labelledby="budget-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={submit}>
        <h2 id="budget-title">{budget ? 'Change budget' : 'Add a budget'}</h2>
        <label>
          Covers
          <select value={cover} onChange={(e) => setCover(e.target.value)} disabled={!!budget}>
            {(budget ? [cover] : choices).map((id) => (
              <option key={id || 'household'} value={id}>
                {coverName(id)}
              </option>
            ))}
          </select>
        </label>
        {cover === '' && <p className="small muted">Counts the spending of teens, children and anyone who chose to count theirs.</p>}
        <label>
          Spending on
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Everything</option>
            {BUDGET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="chips budget-period">
          <legend>Every</legend>
          {[
            ['month', 'Month'],
            ['week', 'Week'],
          ].map(([v, label]) => (
            <button key={v} type="button" className="chip" aria-pressed={period === v} onClick={() => setPeriod(v)}>
              {label}
            </button>
          ))}
        </fieldset>
        <label>
          Amount ({cur})
          <input inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
        </label>
        {amount && !minor && <p className="small error">Enter an amount above zero, like 250 or 250.50.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {budget &&
            (confirmDelete ? (
              <button
                type="button"
                className="btn btn-danger budget-delete"
                disabled={busy}
                onClick={() => run(() => api(`/api/budgets/${budget.id}`, { method: 'DELETE' }))}
              >
                Yes, delete it
              </button>
            ) : (
              <button type="button" className="btn btn-secondary budget-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!minor || busy}>
            {busy ? 'Saving…' : budget ? 'Save' : 'Add budget'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
