import { useCallback, useEffect, useId, useState } from 'react'
import TallynLoader from '../components/TallynLoader.jsx'
import { api } from '../lib/api.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { formatMoney } from '../lib/money.js'
import { Chips, Pill, NUM, MUTED, OWE, IN } from '../components/calm/ui.jsx'
import { answer, BUCKETS, JOBS, jobs, ownSharesOk, suggestionMonths, TEMPLATES } from '../lib/plans.js'

// Plan from your income (#133, Dinesh picked 3A; calm redesign #187 from the #185 draft): at the top of the Budgets
// page. Answer first (a sentence), then the logic (income and a labelled
// split bar), then the data (a plain bar and words per job). One plan for the
// household and one per person, with the budget rules (ADR 0014).

const KID = new Set(['teen', 'child'])
export default function IncomePlan({ me, household, today }) {
  const [plans, setPlans] = useState(null)
  const [scope, setScope] = useState('household') // household | mine
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const cur = household.home_currency
  const money = useCallback((v) => formatMoney(v, cur), [cur])
  const canHousehold = household.role === 'owner' || household.role === 'adult'
  const canMine = !KID.has(household.role)

  const load = useCallback(() => {
    return api(`/api/plans?household_id=${encodeURIComponent(household.id)}&today=${today}`).then(
      (d) => {
        setPlans(d.plans)
        setError('')
      },
      () => setError("We couldn't load your plan. Try again in a moment."),
    )
  }, [household.id, today])

  useEffect(() => {
    load()
  }, [load])

  const hhPlan = plans?.find((p) => p.member_user_id === null)
  const mine = plans?.find((p) => p.member_user_id === me.user_id)
  const plan = scope === 'household' ? hhPlan : mine
  const canManage = scope === 'household' ? canHousehold : canMine

  if (error) {
    return (
      <p className="m-0 text-[14px] font-semibold" style={OWE} role="alert">
        {error}
      </p>
    )
  }
  if (!plans) return <TallynLoader small />

  return (
    <section className="calm-glass min-w-0 rounded-2xl p-4" aria-labelledby={plan && !editing ? 'plan-title' : 'plan-h'}>
      {plan && !editing && (
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="plan-title" className="m-0 font-[family-name:var(--font-heading)] text-[15px] font-semibold">
            Plan from your income
          </h2>
          <span className={`flex items-baseline gap-2 text-[13px] ${MUTED}`}>
            <span>{TEMPLATES[plan.template].label}</span>
            {canManage && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-semibold text-zinc-900 dark:text-white underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4"
              >
                Change
              </button>
            )}
          </span>
        </header>
      )}
      {canMine && (
        <Chips
          label="Whose plan"
          options={[
            ['household', 'Household'],
            ['mine', 'Just me'],
          ]}
          value={scope}
          onChange={(v) => (setScope(v), setEditing(false))}
        />
      )}
      {editing || (!plan && canManage) ? (
        <PlanSetup
          key={scope}
          household={household}
          member={scope === 'mine' ? me.user_id : ''}
          today={today}
          plan={plan}
          onSaved={() => (setEditing(false), load())}
          onCancel={plan ? () => setEditing(false) : null}
        />
      ) : plan ? (
        <PlanView plan={plan} today={today} money={money} />
      ) : (
        <>
          <h2 id="plan-h" className="m-0 mt-3 font-[family-name:var(--font-heading)] text-[18px] font-semibold">
            No household plan yet
          </h2>
          <p className={`m-0 mt-1 text-[14px] ${MUTED}`}>An owner or adult can plan the household&apos;s month from its income here.</p>
        </>
      )}
    </section>
  )
}

// The split bar's colours, one per job in order: ink, red, grey, green, light grey.
const JOB_TONE = [
  'bg-zinc-900 dark:bg-white',
  'bg-[var(--color-redesign-accent)]',
  'bg-zinc-500',
  'bg-[var(--color-redesign-in)]',
  'bg-zinc-300 dark:bg-zinc-600',
]
const FIELD = 'h-9 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-[14px]'
const STEP = `m-0 mt-4 mb-1.5 text-[13px] font-semibold ${MUTED}`

function PlanView({ plan, today, money }) {
  const list = jobs(plan, today)
  const { title, detail } = answer(list, plan, today, money)
  return (
    <>
      <h3 id="plan-h" className="m-0 mt-3 font-[family-name:var(--font-heading)] text-[20px] font-semibold">
        {title}
      </h3>
      <p className={`m-0 mt-0.5 text-[14px] ${MUTED}`}>{detail}</p>
      <p className={`m-0 mt-1 text-[13px] ${MUTED}`}>
        Your income: <strong className={`text-zinc-900 dark:text-white ${NUM}`}>{money(plan.monthly_income_minor)}</strong> a month
      </p>

      <h4 className={STEP}>How your income is split</h4>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {list.map((j, i) => (
          <span key={j.key} className={JOB_TONE[i % JOB_TONE.length]} style={{ flexGrow: j.share }} />
        ))}
      </div>
      <ul className="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-600 dark:text-zinc-300">
        {list.map((j, i) => (
          <li key={j.key} className="flex items-center gap-1.5">
            <i className={`inline-block size-2 rounded-full ${JOB_TONE[i % JOB_TONE.length]}`} aria-hidden="true" />
            {j.name} {j.share}%<span className={`${NUM} text-zinc-900 dark:text-white`}>{money(j.planned)}</span>
          </li>
        ))}
      </ul>

      <h4 className={STEP}>How each job is going</h4>
      <ul className="m-0 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[repeat(var(--jobs),minmax(0,1fr))]" style={{ '--jobs': list.length }}>
        {list.map((j) => {
          const over = j.state === 'over'
          return (
            <li key={j.key} className="plan-row rounded-xl bg-white/70 dark:bg-zinc-800/60 p-3">
              <div className="flex items-baseline justify-between gap-2 text-[14px]">
                <span className="font-semibold">{j.name}</span>
                <Words j={j} money={money} />
              </div>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden="true">
                <span
                  className={`block h-full rounded-full ${over ? 'bg-[var(--color-redesign-accent)]' : j.kind === 'move' ? 'bg-[var(--color-redesign-in)]' : 'bg-zinc-500'}`}
                  style={{ width: `${Math.min(100, j.planned ? (j.used / j.planned) * 100 : 0)}%` }}
                />
              </span>
              <p className={`m-0 mt-1 text-[13px] ${MUTED}`}>
                {j.kind === 'spend' ? 'Spent' : 'Moved'} {money(j.used)} of {money(j.planned)}, for {j.for}
              </p>
            </li>
          )
        })}
      </ul>
      <p className={`m-0 mt-3 text-[13px] ${MUTED}`}>
        Tallyn can only see what reaches your bank. Retirement taken from your pay first, like a 401(k), isn&apos;t counted here.
      </p>
    </>
  )
}

function Words({ j, money }) {
  const cls = `plan-words shrink-0 whitespace-nowrap ${NUM}`
  if (j.state === 'over')
    return (
      <strong className={cls} style={OWE}>
        {money(j.used - j.planned)} over
      </strong>
    )
  if (j.state === 'done')
    return (
      <strong className={cls} style={IN}>
        Done
      </strong>
    )
  return (
    <strong className={cls}>
      {money(Math.max(0, j.planned - j.used))} {j.kind === 'spend' ? 'left' : 'to move'}
    </strong>
  )
}

// Setting a plan up, or changing it: income (suggested from the last 3 months
// of pay, always editable), then a template. "Your own" asks for each share.
function PlanSetup({ household, member, today, plan, onSaved, onCancel }) {
  const cur = household.home_currency
  const [income, setIncome] = useState(plan ? fromMinor(plan.monthly_income_minor, cur) : '')
  const [suggested, setSuggested] = useState(null) // minor units, 0: none found
  const [template, setTemplate] = useState(plan?.template ?? '55-5-10-15-15')
  const [own, setOwn] = useState(() => (plan?.template === 'own' ? plan.shares : TEMPLATES['55-5-10-15-15'].shares))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const incomeId = useId()

  useEffect(() => {
    if (plan) return
    api(`/api/plans/suggestion?household_id=${encodeURIComponent(household.id)}&member=${member}&today=${today}`).then(
      (d) => {
        setSuggested(d.monthly_income_minor)
        if (d.monthly_income_minor > 0) setIncome(fromMinor(d.monthly_income_minor, cur))
      },
      () => setSuggested(0),
    )
  }, [plan, household.id, member, today, cur])

  const total = BUCKETS.reduce((s, k) => s + (Number(own[k]) || 0), 0)

  async function save(e) {
    e.preventDefault()
    const minor = toMinor(income, cur)
    if (!minor) return setError('Enter your monthly income, like 6400.')
    const shares = template === 'own' ? Object.fromEntries(BUCKETS.map((k) => [k, Number(own[k])])) : TEMPLATES[template].shares
    if (template === 'own' && !ownSharesOk(shares)) return setError('Your own split needs whole numbers that add up to 100%.')
    setBusy(true)
    setError('')
    try {
      await api('/api/plans', { method: 'PUT', body: { household_id: household.id, member_user_id: member, monthly_income_minor: minor, template, shares } })
      onSaved()
    } catch {
      setError("We couldn't save your plan. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form className="mt-3 grid gap-3" onSubmit={save}>
      <div>
        <h2 id="plan-h" className="m-0 font-[family-name:var(--font-heading)] text-[18px] font-semibold">
          {plan ? 'Change your plan' : 'Plan your month'}
        </h2>
        {!plan && (
          <p className={`m-0 mt-1 text-[14px] ${MUTED}`}>
            Give every dollar a job. Start from your income, then pick a common way to split it. You can change every amount.
          </p>
        )}
      </div>
      <div className="grid max-w-xs gap-1">
        <label htmlFor={incomeId} className="text-[13px] font-semibold">
          Monthly income
        </label>
        <input id={incomeId} className={FIELD} inputMode="decimal" autoComplete="off" value={income} onChange={(e) => setIncome(e.target.value)} required />
      </div>
      {suggested > 0 && (
        <p className={`m-0 text-[13px] ${MUTED}`}>Suggested from your pay in {suggestionMonths(today)}. Tax refunds and one-offs are left out.</p>
      )}
      {suggested === 0 && <p className={`m-0 text-[13px] ${MUTED}`}>We didn&apos;t find regular pay in the last 3 months. Type your monthly income.</p>}

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-semibold">How to split it</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <label
              key={key}
              className={`flex cursor-pointer flex-col gap-2 rounded-xl border bg-white dark:bg-zinc-900 p-3 text-[14px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-zinc-900 dark:has-[:focus-visible]:ring-white ${
                template === key ? 'border-zinc-900 dark:border-white' : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="template"
                  value={key}
                  checked={template === key}
                  onChange={() => setTemplate(key)}
                  className="accent-zinc-900 dark:accent-white"
                />
                <span className="name font-semibold">{t.label}</span>
              </span>
              <span className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {Object.entries(t.shares ?? { own: 100 }).map(([k, v], i) => (
                  <span key={k} className={t.shares ? JOB_TONE[i % JOB_TONE.length] : 'bg-zinc-200 dark:bg-zinc-700'} style={{ flexGrow: v }} />
                ))}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {template === 'own' && (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] font-semibold">Your split, in percent</legend>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {BUCKETS.map((k) => (
              <label key={k} className="grid gap-1 text-[13px]">
                {JOBS[k].name}
                <input className={FIELD} inputMode="numeric" value={own[k]} onChange={(e) => setOwn({ ...own, [k]: e.target.value.replace(/\D/g, '') })} />
              </label>
            ))}
          </div>
          <p className={`m-0 mt-1.5 text-[13px] ${total === 100 ? MUTED : 'font-semibold'}`} style={total === 100 ? undefined : OWE} aria-live="polite">
            Adds up to {total}%{total === 100 ? '' : ', needs to be 100%'}
          </p>
        </fieldset>
      )}

      <p className={`m-0 text-[13px] ${MUTED}`}>A common way to split income, not financial advice.</p>
      {error && (
        <p className="m-0 text-[14px] font-semibold" style={OWE} role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Pill type="submit" disabled={busy}>
          {busy ? 'Saving…' : plan ? 'Save changes' : 'Start my plan'}
        </Pill>
        {onCancel && (
          <Pill quiet onClick={onCancel}>
            Cancel
          </Pill>
        )}
      </div>
    </form>
  )
}
