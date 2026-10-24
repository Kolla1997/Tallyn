import { useCallback, useEffect, useId, useState } from 'react'
import TallynLoader from '../components/TallynLoader.jsx'
import { api } from '../lib/api.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { formatMoney } from '../lib/money.js'
import { answer, BUCKETS, JOBS, jobs, ownSharesOk, suggestionMonths, TEMPLATES } from '../lib/plans.js'

// Plan from your income (#133, Dinesh picked 3A): at the top of the Budgets
// page. Answer first (a sentence), then the logic (income and a labelled
// split bar), then the data (a plain bar and words per job). One plan for the
// household and one per person, with the budget rules (ADR 0014).

const KID = new Set(['teen', 'child'])
const STATE = {
  on: ['pace-on', 'On pace'],
  ahead: ['pace-ahead', 'Ahead of pace'],
  full: ['pace-full', 'All used, as planned'],
  over: ['pace-over', 'Over'],
  done: ['pace-on', 'Done'],
  tomove: ['pace-full', 'Still to move'],
}

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
      <p className="error" role="alert">
        {error}
      </p>
    )
  }
  if (!plans) return <TallynLoader small />

  return (
    <section className="panel plan" aria-labelledby="plan-h">
      {canMine && (
        <div className="chips plan-scope" role="group" aria-label="Whose plan">
          <button type="button" className="chip" aria-pressed={scope === 'household'} onClick={() => (setScope('household'), setEditing(false))}>
            Household
          </button>
          <button type="button" className="chip" aria-pressed={scope === 'mine'} onClick={() => (setScope('mine'), setEditing(false))}>
            Just me
          </button>
        </div>
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
        <PlanView plan={plan} today={today} money={money} canManage={canManage} onChange={() => setEditing(true)} />
      ) : (
        <>
          <h2 id="plan-h">No household plan yet</h2>
          <p className="muted">An owner or adult can plan the household&apos;s month from its income here.</p>
        </>
      )}
    </section>
  )
}

function PlanView({ plan, today, money, canManage, onChange }) {
  const list = jobs(plan, today)
  const { title, detail } = answer(list, plan, today, money)
  return (
    <>
      <div className="plan-head">
        <div>
          <h2 id="plan-h" className="plan-answer">
            {title}
          </h2>
          <p className="muted plan-detail">{detail}</p>
        </div>
        <span className="small plan-template">{TEMPLATES[plan.template].label}</span>
      </div>
      <p className="plan-income">
        Your income: <strong>{money(plan.monthly_income_minor)}</strong> a month{' '}
        {canManage && (
          <button type="button" className="link small" onClick={onChange}>
            Change
          </button>
        )}
      </p>

      <h3 className="plan-step">How your income is split</h3>
      <div className="plan-split" aria-hidden="true">
        {list.map((j) => (
          <span key={j.key} className={`plan-seg job-${j.key}`} style={{ flexGrow: j.share }} />
        ))}
      </div>
      <ul className="plan-key small">
        {list.map((j) => (
          <li key={j.key}>
            <i className={`plan-dot job-${j.key}`} aria-hidden="true" />
            <span>
              <span className="block">{j.name}</span>
              <strong>{money(j.planned)}</strong> <span className="muted">{j.share}%</span>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="plan-step">How each job is going</h3>
      <ul className="plan-rows">
        {list.map((j) => (
          <li key={j.key} className="plan-row">
            <div className="plan-row-top">
              <span className="plan-name">
                <i className={`plan-dot job-${j.key}`} aria-hidden="true" />
                {j.name}
              </span>
              <span className={`pace ${STATE[j.state][0]}`}>{STATE[j.state][1]}</span>
              <Words j={j} money={money} />
            </div>
            <div className={`plan-bar job-${j.key}${j.state === 'over' ? ' is-over' : ''}`} aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.min(1, j.planned ? j.used / j.planned : 0)})` }} />
            </div>
            <p className="small muted plan-row-foot">
              {j.kind === 'spend' ? 'Spent' : 'Moved'} {money(j.used)} of {money(j.planned)}, for {j.for}
            </p>
          </li>
        ))}
      </ul>
      <p className="small muted plan-cant">
        Tallyn can only see what reaches your bank. Retirement taken from your pay first, like a 401(k), isn&apos;t counted here.
      </p>
    </>
  )
}

function Words({ j, money }) {
  if (j.state === 'over') return <strong className="plan-words is-over">{money(j.used - j.planned)} over</strong>
  if (j.state === 'done') return <strong className="plan-words is-done">Done</strong>
  return (
    <strong className="plan-words">
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
    <form className="plan-setup" onSubmit={save}>
      <h2 id="plan-h">{plan ? 'Change your plan' : 'Plan your month'}</h2>
      {!plan && <p className="muted">Give every dollar a job. Start from your income, then pick a common way to split it. You can change every amount.</p>}
      <label htmlFor={incomeId}>Monthly income</label>
      <input id={incomeId} inputMode="decimal" autoComplete="off" value={income} onChange={(e) => setIncome(e.target.value)} required />
      {suggested > 0 && <p className="small muted">Suggested from your pay in {suggestionMonths(today)}. Tax refunds and one-offs are left out.</p>}
      {suggested === 0 && <p className="small muted">We didn&apos;t find regular pay in the last 3 months. Type your monthly income.</p>}

      <fieldset className="plan-templates">
        <legend>How to split it</legend>
        {Object.entries(TEMPLATES).map(([key, t]) => (
          <label key={key} className={`plan-template-card${template === key ? ' is-on' : ''}`}>
            <input type="radio" name="template" value={key} checked={template === key} onChange={() => setTemplate(key)} />
            <span className="name block">{t.label}</span>
            <span className="plan-mini" aria-hidden="true">
              {Object.entries(t.shares ?? { own: 100 }).map(([k, v]) => (
                <span key={k} className={`job-${k}`} style={{ flexGrow: v }} />
              ))}
            </span>
          </label>
        ))}
      </fieldset>

      {template === 'own' && (
        <fieldset className="plan-own">
          <legend>Your split, in percent</legend>
          {BUCKETS.map((k) => (
            <label key={k}>
              {JOBS[k].name}
              <input inputMode="numeric" value={own[k]} onChange={(e) => setOwn({ ...own, [k]: e.target.value.replace(/\D/g, '') })} />
            </label>
          ))}
          <p className={`small ${total === 100 ? 'muted' : 'error'}`} aria-live="polite">
            Adds up to {total}%{total === 100 ? '' : ', needs to be 100%'}
          </p>
        </fieldset>
      )}

      <p className="small muted">A common way to split income, not financial advice.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="plan-actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : plan ? 'Save changes' : 'Start my plan'}
        </button>
        {onCancel && (
          <button className="btn btn-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
