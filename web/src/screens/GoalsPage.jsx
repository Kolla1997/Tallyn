import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LoadFailed from '../components/LoadFailed.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import { api } from '../lib/api.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { forecast, forecastWords, monthName, nextMilestone, perMonth, summary, thisMonth, totals } from '../lib/goals.js'
import { formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { useRetry } from '../lib/retry.js'
import { PageHead } from './Shell.jsx'

// Savings goals (#14, Dinesh picked the mix of draft 2, part by part):
// "This month" on top (what to put aside, ticked as money lands), every goal
// as a glass pot that fills, and the goal you open as a forecast with its
// next milestone. Tallyn never moves money; a goal follows one of its
// person's accounts or is updated by hand. Progress is never shown to someone
// who can't already see the balance behind it (the server leaves it out).

const KID = new Set(['teen', 'child'])
const COLOURS = ['clay-deep', 'sage-deep', 'cocoa', 'sage', 'clay']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'MXN']
const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local

export default function GoalsPage({ me, household, refreshKey }) {
  const [goals, setGoals] = useState(null)
  const [members, setMembers] = useState([])
  const [banks, setBanks] = useState([])
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState(null)
  const [dialog, setDialog] = useState(null) // { kind: 'goal', goal? } | { kind: 'saved', goal }
  const detailRef = useRef(null)
  const home = household.home_currency
  const money = useCallback((minor, cur = home) => formatMoney(minor, cur), [home])
  const now = today()

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    return Promise.all([api(`/api/goals?household_id=${hh}&today=${now}`), api(`/api/households/${hh}/members`), api(`/api/banks?household_id=${hh}`)]).then(
      ([g, m, b]) => {
        setGoals(g.goals)
        setMembers(m.members)
        setBanks(b.banks ?? [])
        setFailed(false)
      },
      () => setFailed(true),
    )
  }, [household.id, now])

  useEffect(() => {
    load()
  }, [load, refreshKey])
  const [retrying, retry] = useRetry(load)

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const canCreate = !KID.has(household.role)
  const list = goals ?? []
  const selected = list.find((g) => g.id === picked) ?? list.find((g) => g.saved_minor != null) ?? null
  const month = thisMonth(list, now)
  const { title, detail } = summary(month, now, money)
  const sum = totals(list, home)
  const whoName = (id) => (id === me.user_id ? 'You' : nameOf(people[id] ?? { user_id: id }))
  // On phones the details sit below the pots: bring them into view (audit F8).
  const pick = (id) => {
    setPicked(id)
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start' }))
    }
  }

  return (
    <>
      <PageHead title="Goals" sub="Save toward what matters. Tallyn can't move money: move it in your bank's app.">
        {canCreate && (
          <button className="btn" onClick={() => setDialog({ kind: 'goal' })}>
            New goal
          </button>
        )}
      </PageHead>

      {!goals ? (
        failed ? (
          <LoadFailed what="your goals" busy={retrying} onRetry={retry} />
        ) : (
          <TallynLoader />
        )
      ) : list.length === 0 ? (
        <section className="panel empty-state">
          <h2>No goals yet</h2>
          <p className="muted">
            Set one for a trip, a school fund or a rainy day. It can follow a savings account, so it fills on its own, or you can update it yourself.
          </p>
        </section>
      ) : (
        <div className="goals-page">
          <section className="panel goals-month" aria-labelledby="goals-month-h">
            <h2 id="goals-month-h" className="goals-answer">
              {title}
            </h2>
            <p className="muted goals-detail">
              {detail}{' '}
              {sum.count > 0 && (
                <>
                  You&apos;ve saved {money(sum.saved)} of {money(sum.target)} across your {sum.count === 1 ? 'goal' : 'goals'} in {home}
                  {sum.other > 0 && `, plus ${sum.other} in another currency`}.
                </>
              )}
            </p>
            {month.length > 0 && (
              <ul className="goals-checklist">
                {month.map((s) => (
                  <li key={s.goal.id} className={s.done ? 'is-done' : ''}>
                    <span className="goals-check" aria-hidden="true" />
                    <span className="grow">
                      <span className="block goals-check-name">
                        Put aside {money(s.due, s.goal.currency)} for {s.goal.name}
                      </span>
                      <span className="small muted">
                        {s.done
                          ? `Done: ${money(s.added, s.goal.currency)} added this month`
                          : `Not yet this month. ${s.goal.account_id ? 'It ticks when the account grows.' : 'It ticks when you update the amount.'}`}
                      </span>
                    </span>
                    <span className="sr-only">{s.done ? 'Done' : 'Not yet'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="goals-pots-h">
            <h2 id="goals-pots-h">Your goals</h2>
            <ul className="pots">
              {list.map((g, i) => (
                <li key={g.id}>
                  <Pot
                    goal={g}
                    colour={COLOURS[i % COLOURS.length]}
                    owner={g.owner_user_id === me.user_id ? null : whoName(g.owner_user_id)}
                    money={money}
                    selected={selected?.id === g.id}
                    onPick={() => pick(g.id)}
                  />
                </li>
              ))}
            </ul>
          </section>

          {selected && (
            <GoalDetail
              ref={detailRef}
              goal={selected}
              colour={COLOURS[list.indexOf(selected) % COLOURS.length]}
              now={now}
              money={money}
              whoName={whoName}
              onUpdate={() => setDialog({ kind: 'saved', goal: selected })}
              onEdit={() => setDialog({ kind: 'goal', goal: selected })}
            />
          )}
        </div>
      )}

      {dialog?.kind === 'goal' && (
        <GoalDialog
          goal={dialog.goal}
          me={me}
          household={household}
          members={members}
          banks={banks}
          whoName={whoName}
          onClose={() => setDialog(null)}
          onSaved={(id) => {
            setDialog(null)
            if (id) setPicked(id)
            load()
          }}
        />
      )}
      {dialog?.kind === 'saved' && (
        <SavedDialog
          goal={dialog.goal}
          now={now}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            load()
          }}
        />
      )}
    </>
  )
}

// One goal as a glass pot that fills from the bottom (from E). A goal whose
// progress is private shows a locked pot with its name and target only.
function Pot({ goal, colour, owner, money, selected, onPick }) {
  const priv = goal.saved_minor == null
  const share = priv ? 0 : Math.min(1, goal.saved_minor / goal.target_minor)
  const left = priv ? 0 : Math.max(0, goal.target_minor - goal.saved_minor)
  return (
    <button type="button" className={`pot job-${colour}`} style={{ '--c': `var(--color-${colour})` }} aria-pressed={selected} onClick={onPick} disabled={priv}>
      <span className={`pot-jar${priv ? ' pot-locked' : ''}`} aria-hidden="true">
        {!priv && <span className="pot-fill" style={{ transform: `scaleY(${share})` }} />}
      </span>
      <span className="pot-name">{goal.name}</span>
      {owner && <span className="small muted">For {owner}</span>}
      {priv ? (
        <>
          <span className="small muted">Target {money(goal.target_minor, goal.currency)}</span>
          <span className="pace pace-full">Progress is private</span>
        </>
      ) : (
        <>
          <span className="pot-left">{left > 0 ? `${money(left, goal.currency)} to go` : 'Reached'}</span>
          <span className="small muted">
            {money(goal.saved_minor, goal.currency)} of {money(goal.target_minor, goal.currency)}
            {goal.by_month && ` by ${monthName(goal.by_month)}`}
          </span>
        </>
      )}
    </button>
  )
}

// The goal you opened: the forecast (from G) with its next milestone (from F).
function GoalDetail({ ref, goal, colour, now, money, whoName, onUpdate, onEdit }) {
  const f = forecast(goal, now)
  const next = nextMilestone(goal)
  const each = perMonth(goal, now)
  const who =
    goal.visibility === 'everyone'
      ? 'Everyone in the household'
      : goal.visibility === 'member'
        ? `${whoName(goal.owner_user_id)} and ${whoName(goal.shared_with)}`
        : `Only ${whoName(goal.owner_user_id).toLowerCase() === 'you' ? 'you' : whoName(goal.owner_user_id)}`
  return (
    <section ref={ref} className="panel goal-detail" aria-labelledby="goal-detail-h" style={{ '--c': `var(--color-${colour})` }}>
      <p className="small muted goal-opened">Opened</p>
      <h2 id="goal-detail-h">{goal.name}</h2>
      <p className="goal-forecast">{forecastWords(f, goal)}</p>
      {f?.pace > 0 && <p className="small muted">You&apos;ve added about {money(f.pace, goal.currency)} a month since you started.</p>}
      {f?.lands && <Forecast goal={goal} f={f} now={now} />}
      {next && (
        <p className="goal-next">
          <strong>{money(next.left, goal.currency)}</strong> to {next.name}.
        </p>
      )}
      {each > 0 && (
        <p className="small">
          Put aside <strong>{money(each, goal.currency)} a month</strong> to get there by {monthName(goal.by_month)}.
        </p>
      )}
      <ul className="goal-facts small muted">
        <li>{goal.account_id ? `Follows ${goal.account ?? 'a savings account'}: updates at each bank update.` : 'Updated by hand.'}</li>
        <li>Who can see it: {who}.</li>
      </ul>
      {goal.can_manage && (
        <div className="goal-actions">
          {!goal.account_id && (
            <button className="btn btn-secondary" onClick={onUpdate}>
              Update amount
            </button>
          )}
          <button className="link small" onClick={onEdit}>
            Change goal
          </button>
        </div>
      )}
    </section>
  )
}

// Saved so far, month by month (solid), and where this pace goes (dotted).
// The sentence above says it in words; the picture is extra.
function Forecast({ goal, f, now }) {
  const W = 600
  const H = 160
  const P = 12
  const idx = (iso) => +iso.slice(0, 4) * 12 + +iso.slice(5, 7)
  const points = [...(goal.history ?? []).filter((h) => idx(h.month) < idx(now)), { month: now, saved_minor: goal.saved_minor }]
  const start = idx(points[0].month)
  const end = Math.max(idx(f.lands), goal.by_month ? idx(goal.by_month) : 0, idx(now) + 1)
  const top = Math.max(goal.target_minor, goal.saved_minor) * 1.08
  const X = (iso) => P + ((W - 2 * P) * (idx(iso) - start)) / (end - start)
  const Y = (v) => H - P - ((H - 2 * P) * v) / top
  const line = points.map((p) => `${X(p.month)},${Y(p.saved_minor)}`).join(' ')
  return (
    <svg className="goal-chart" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line x1={P} x2={W - P} y1={Y(goal.target_minor)} y2={Y(goal.target_minor)} className="goal-chart-target" />
      {goal.by_month && <line x1={X(goal.by_month)} x2={X(goal.by_month)} y1={P} y2={H - P} className="goal-chart-by" />}
      <polyline points={line} className="goal-chart-line" />
      <line x1={X(now)} y1={Y(goal.saved_minor)} x2={X(f.lands)} y2={Y(goal.target_minor)} className="goal-chart-proj" />
      <circle cx={X(f.lands)} cy={Y(goal.target_minor)} r="5" className="goal-chart-dot" />
    </svg>
  )
}

function useModal() {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d.open) d.showModal()
    return () => d.open && d.close()
  }, [])
  return ref
}

// New goal, or change one: name, target, optional month, how it fills, who
// can see it. Owners and adults can set one up for a teen or child.
function GoalDialog({ goal, me, household, members, banks, whoName, onClose, onSaved }) {
  const ref = useModal()
  const kids = members.filter((m) => KID.has(m.role))
  const [owner, setOwner] = useState(goal?.owner_user_id ?? me.user_id)
  const [name, setName] = useState(goal?.name ?? '')
  const [fills, setFills] = useState(goal ? (goal.account_id ? 'account' : 'hand') : 'account')
  const [account, setAccount] = useState(goal?.account_id ?? '')
  const [currency, setCurrency] = useState(goal?.currency ?? household.home_currency)
  const [target, setTarget] = useState(goal ? fromMinor(goal.target_minor, goal.currency) : '')
  const [by, setBy] = useState(goal?.by_month ? goal.by_month.slice(0, 7) : '')
  const [visibility, setVisibility] = useState(goal?.visibility ?? 'me')
  const [sharedWith, setSharedWith] = useState(goal?.shared_with ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Only that person's own accounts (a goal follows its own person's money).
  const accounts = banks
    .filter((b) => b.owner_user_id === owner)
    .flatMap((b) => b.accounts ?? [])
    .filter((a) => a.type === 'depository' || a.type === 'investment')
  const chosen = accounts.find((a) => a.id === account)
  const cur = fills === 'account' ? (chosen?.currency ?? household.home_currency) : currency
  const others = members.filter((m) => m.user_id !== owner)
  const minor = toMinor(target, cur)

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Give your goal a name.')
    if (!minor) return setError('Enter a target above zero, like 5000.')
    if (fills === 'account' && !chosen) return setError('Choose the account it follows, or update it yourself.')
    if (visibility === 'member' && !sharedWith) return setError('Choose who else can see it.')
    const body = {
      owner_user_id: owner,
      name,
      target_minor: minor,
      currency: fills === 'account' ? '' : currency,
      by_month: by,
      account_id: fills === 'account' ? account : '',
      visibility,
      shared_with: visibility === 'member' ? sharedWith : '',
    }
    setBusy(true)
    setError('')
    try {
      if (goal) {
        await api(`/api/goals/${goal.id}`, { method: 'PUT', body })
        onSaved(goal.id)
      } else {
        const d = await api('/api/goals', { method: 'POST', body: { household_id: household.id, ...body } })
        onSaved(d.id)
      }
    } catch {
      setError("We couldn't save your goal. Try again in a moment.")
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api(`/api/goals/${goal.id}`, { method: 'DELETE' })
      onSaved(null)
    } catch {
      setError("We couldn't delete your goal. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="goal-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save}>
        <h2 id="goal-title">{goal ? 'Change goal' : 'New goal'}</h2>
        {!goal && kids.length > 0 && !KID.has(household.role) && (
          <label>
            For
            <select value={owner} onChange={(e) => (setOwner(e.target.value), setAccount(''))}>
              {[me.user_id, ...kids.map((k) => k.user_id)].map((id) => (
                <option key={id} value={id}>
                  {whoName(id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Name
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Beach trip" required />
        </label>
        <fieldset className="goal-fills">
          <legend>How it fills</legend>
          <label className="goal-radio">
            <input type="radio" name="fills" checked={fills === 'account'} onChange={() => setFills('account')} disabled={accounts.length === 0} />
            Follow a savings account
          </label>
          {fills === 'account' && accounts.length > 0 && (
            <select aria-label="Account it follows" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Choose an account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ••${a.mask}` : ''}, {a.currency}
                </option>
              ))}
            </select>
          )}
          {accounts.length === 0 && <p className="small muted">No savings account to follow yet. Link a bank, or update it yourself.</p>}
          <label className="goal-radio">
            <input type="radio" name="fills" checked={fills === 'hand'} onChange={() => setFills('hand')} />
            I&apos;ll update it myself
          </label>
        </fieldset>
        <div className="goal-row">
          <label>
            Target ({cur})
            <input inputMode="decimal" autoComplete="off" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="5000" required />
          </label>
          {fills === 'hand' && (
            <label>
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {[...new Set([household.home_currency, ...CURRENCIES])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            By (optional)
            <input type="month" value={by} onChange={(e) => setBy(e.target.value)} />
          </label>
        </div>
        <fieldset className="chips goal-who">
          <legend>Who can see it</legend>
          {[
            ['me', owner === me.user_id ? 'Only me' : `Only ${whoName(owner)}`],
            ['member', owner === me.user_id ? 'Me and…' : `${whoName(owner)} and…`],
            ['everyone', 'Everyone in the household'],
          ].map(([v, label]) => (
            <button key={v} type="button" className="chip" aria-pressed={visibility === v} onClick={() => setVisibility(v)}>
              {label}
            </button>
          ))}
        </fieldset>
        {visibility === 'member' && (
          <select aria-label="Who else can see it" value={sharedWith} onChange={(e) => setSharedWith(e.target.value)}>
            <option value="">Choose someone</option>
            {others.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {whoName(m.user_id)}
              </option>
            ))}
          </select>
        )}
        {fills === 'account' && <p className="small muted">People who can&apos;t see that account&apos;s balance see the goal&apos;s name and target only.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {goal &&
            (confirmDelete ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
                Yes, delete it
              </button>
            ) : (
              <button type="button" className="link small danger-link" onClick={() => setConfirmDelete(true)}>
                Delete goal
              </button>
            ))}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : goal ? 'Save' : 'Create goal'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

// A goal kept by hand: how much is saved now.
function SavedDialog({ goal, now, onClose, onSaved }) {
  const ref = useModal()
  const [amount, setAmount] = useState(fromMinor(goal.saved_minor ?? 0, goal.currency))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const minor = amount.trim() === '0' ? 0 : toMinor(amount, goal.currency)

  async function save(e) {
    e.preventDefault()
    if (minor == null) return setError('Enter an amount, like 3400.')
    setBusy(true)
    try {
      await api(`/api/goals/${goal.id}/saved?today=${now}`, { method: 'PUT', body: { saved_minor: minor } })
      onSaved()
    } catch {
      setError("We couldn't update it. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="saved-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save}>
        <h2 id="saved-title">Update {goal.name}</h2>
        <label>
          Saved so far ({goal.currency})
          <input inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <p className="small muted">Move the money in your bank&apos;s app first; this only keeps count.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
