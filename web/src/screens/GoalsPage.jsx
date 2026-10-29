import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Lock, Check } from 'lucide-react'
import { curveLinear } from '@visx/curve'
import { LineChart } from '@/components/charts/line-chart'
import { Line } from '@/components/charts/line'
import { XAxis } from '@/components/charts/x-axis'
import LoadFailed from '../components/LoadFailed.jsx'
import MonthPicker from '../components/MonthPicker.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import { api } from '../lib/api.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { forecast, forecastWords, monthName, nextMilestone, perMonth, summary, thisMonth, totals } from '../lib/goals.js'
import { formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { useRetry } from '../lib/retry.js'
import { Head, Panel, Chips, Pill, NUM, MUTED, OWE } from '../components/calm/ui.jsx'

// Savings goals (#14), in the calm redesign (#187, the #185 draft): "This month" on top (what
// to put aside, ticked as money lands, the answer first), every goal as a pot that fills, and
// the goal you open as a forecast drawn by Bklit, with its next milestone. Tallyn never moves
// money; a goal follows one of its person's accounts or is updated by hand. Progress is never
// shown to someone who can't already see the balance behind it (the server leaves it out).

const KID = new Set(['teen', 'child'])
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'MXN']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
const NOTE = `m-0 text-[13px] ${MUTED}`
const FIELD = 'h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[14px]'
const DIALOG =
  'm-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-white dark:bg-zinc-900 p-5 text-zinc-900 dark:text-white shadow-2xl backdrop:bg-black/40'
const FILL =
  'flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 has-[:checked]:border-zinc-900 dark:has-[:checked]:border-white'
const DIALOG_H = 'm-0 mb-1 font-[family-name:var(--font-heading)] text-[18px] font-semibold'

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
    <div className="calm">
      <Head title="Goals" sub="Save toward what matters. Coinroof can't move money: move it in your bank's app.">
        {canCreate && (
          <Pill icon={Plus} onClick={() => setDialog({ kind: 'goal' })}>
            New goal
          </Pill>
        )}
      </Head>

      {!goals ? (
        failed ? (
          <LoadFailed what="your goals" busy={retrying} onRetry={retry} />
        ) : (
          <TallynLoader />
        )
      ) : list.length === 0 ? (
        <Panel id="goals-empty" title="No goals yet">
          <p className={`m-0 text-[14px] ${MUTED}`}>
            Set one for a trip, a school fund or a rainy day. It can follow a savings account, so it fills on its own, or you can update it yourself.
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12 [&>*]:min-w-0">
          <div className={`grid gap-3 ${selected ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
            <section className="calm-glass min-w-0 rounded-2xl p-4" aria-labelledby="goals-month-h">
              <h2 id="goals-month-h" className="m-0 font-[family-name:var(--font-heading)] text-[20px] font-semibold">
                {title}
              </h2>
              <p className={`m-0 mt-0.5 text-[14px] ${MUTED}`}>
                {detail}{' '}
                {sum.count > 0 && (
                  <>
                    You&apos;ve saved {money(sum.saved)} of {money(sum.target)} across your {sum.count === 1 ? 'goal' : 'goals'} in {home}
                    {sum.other > 0 && `, plus ${sum.other} in another currency`}.
                  </>
                )}
              </p>
              {month.length > 0 && (
                <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {month.map((s) => (
                    <li key={s.goal.id} className="flex items-start gap-2.5 rounded-xl bg-white/70 dark:bg-zinc-800/60 p-3">
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                          s.done ? 'bg-[var(--color-redesign-in)] text-white' : 'border-2 border-zinc-300 dark:border-zinc-700'
                        }`}
                        aria-hidden="true"
                      >
                        {s.done && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold">
                          Put aside {money(s.due, s.goal.currency)} for {s.goal.name}
                        </span>
                        <span className={`block ${NOTE}`}>
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

            <section aria-labelledby="goals-pots-h">
              <h2 id="goals-pots-h" className="m-0 mb-2 font-[family-name:var(--font-heading)] text-[15px] font-semibold">
                Your goals
              </h2>
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[420px]:grid-cols-2 sm:grid-cols-3">
                {list.map((g) => (
                  <li key={g.id}>
                    <Pot
                      goal={g}
                      owner={g.owner_user_id === me.user_id ? null : whoName(g.owner_user_id)}
                      money={money}
                      selected={selected?.id === g.id}
                      onPick={() => pick(g.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {selected && (
            <div ref={detailRef} className="lg:col-span-5">
              <GoalDetail
                goal={selected}
                now={now}
                money={money}
                whoName={whoName}
                onUpdate={() => setDialog({ kind: 'saved', goal: selected })}
                onEdit={() => setDialog({ kind: 'goal', goal: selected })}
              />
            </div>
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
    </div>
  )
}

// One goal as a pot that fills (a green bar). A goal whose progress is private shows a locked
// pot with its name and target only.
function Pot({ goal, owner, money, selected, onPick }) {
  const priv = goal.saved_minor == null
  const share = priv ? 0 : Math.min(1, goal.saved_minor / goal.target_minor)
  const left = priv ? 0 : Math.max(0, goal.target_minor - goal.saved_minor)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      disabled={priv}
      className={`flex h-full w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-[border-color] duration-150 ${
        priv
          ? 'cursor-default border-dashed border-zinc-300 dark:border-zinc-700 bg-transparent'
          : 'calm-solid border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 aria-pressed:border-zinc-900 dark:aria-pressed:border-white'
      }`}
    >
      <span className="relative block h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
        {!priv && <span className="absolute inset-y-0 left-0 block rounded-full bg-[var(--color-redesign-in)]" style={{ width: `${share * 100}%` }} />}
      </span>
      <span className="flex items-center gap-1.5 text-[14px] font-semibold">
        {priv && <Lock className="size-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />}
        {goal.name}
      </span>
      {owner && <span className={NOTE}>For {owner}</span>}
      {priv ? (
        <>
          <span className={NOTE}>Target {money(goal.target_minor, goal.currency)}</span>
          <span className="w-fit rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">
            Progress is private
          </span>
        </>
      ) : (
        <>
          <span className={`text-[15px] ${NUM}`}>{left > 0 ? `${money(left, goal.currency)} to go` : 'Reached'}</span>
          <span className={NOTE}>
            {money(goal.saved_minor, goal.currency)} of {money(goal.target_minor, goal.currency)}
            {goal.by_month && ` by ${monthName(goal.by_month)}`}
          </span>
        </>
      )}
    </button>
  )
}

// The goal you opened: the forecast with its chart and its next milestone.
function GoalDetail({ goal, now, money, whoName, onUpdate, onEdit }) {
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
    <Panel id="goal-detail-h" title={goal.name} meta={`${money(goal.saved_minor, goal.currency)} of ${money(goal.target_minor, goal.currency)}`}>
      <p className="m-0 font-[family-name:var(--font-heading)] text-[18px] font-semibold">{forecastWords(f, goal)}</p>
      {f?.pace > 0 && <p className={NOTE}>You&apos;ve added about {money(f.pace, goal.currency)} a month since you started.</p>}
      {f?.lands && <Forecast goal={goal} f={f} now={now} />}
      <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[14px]">
        {next && (
          <li>
            <strong className={NUM}>{money(next.left, goal.currency)}</strong> to {next.name}.
          </li>
        )}
        {each > 0 && (
          <li>
            Put aside <strong className={NUM}>{money(each, goal.currency)} a month</strong> to get there by {monthName(goal.by_month)}.
          </li>
        )}
        <li className="text-zinc-600 dark:text-zinc-300">
          {goal.account_id ? `Follows ${goal.account ?? 'a savings account'}: updates at each bank update.` : 'Updated by hand.'}
        </li>
        <li className="text-zinc-600 dark:text-zinc-300">Who can see it: {who}.</li>
      </ul>
      {goal.can_manage && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!goal.account_id && (
            <Pill quiet onClick={onUpdate}>
              Update amount
            </Pill>
          )}
          <Pill quiet onClick={onEdit}>
            Change goal
          </Pill>
        </div>
      )}
    </Panel>
  )
}

// Saved so far, month by month (solid green), where this pace goes (dashed), and the target
// (grey). The sentence above says it in words; the picture is extra.
function Forecast({ goal, f, now }) {
  const data = useMemo(() => {
    const idx = (iso) => +iso.slice(0, 4) * 12 + +iso.slice(5, 7) - 1
    const at = (i) => new Date(Math.floor(i / 12), i % 12, 1)
    const known = new Map((goal.history ?? []).filter((h) => idx(h.month) < idx(now)).map((h) => [idx(h.month), h.saved_minor]))
    known.set(idx(now), goal.saved_minor)
    const start = Math.min(...known.keys())
    const nowI = idx(now)
    const landI = idx(f.lands)
    const end = Math.max(landI, goal.by_month ? idx(goal.by_month) : 0, nowI + 1)
    const rows = []
    let last = 0
    for (let i = start; i <= end; i++) {
      if (i <= nowI) last = known.get(i) ?? last
      const saved = i <= nowI ? last : Math.min(goal.target_minor, goal.saved_minor + ((goal.target_minor - goal.saved_minor) * (i - nowI)) / (landI - nowI))
      rows.push({ date: at(i), saved: Math.round(saved), target: goal.target_minor })
    }
    return { rows, nowAt: nowI - start }
  }, [goal, f.lands, now])
  return (
    <div className="mt-3" aria-hidden="true">
      <LineChart data={data.rows} aspectRatio="3 / 1" margin={{ left: 8, right: 8, top: 8, bottom: 24 }}>
        <Line
          dataKey="target"
          curve={curveLinear}
          fadeEdges={false}
          stroke="var(--color-redesign-grey-2)"
          strokeWidth={1}
          dashFromIndex={0}
          showHighlight={false}
          animate={false}
        />
        <Line
          dataKey="saved"
          curve={curveLinear}
          fadeEdges={false}
          stroke="var(--color-redesign-in)"
          strokeWidth={2}
          dashFromIndex={data.nowAt}
          animate={false}
        />
        <XAxis labels={data.rows.map((r) => `${SHORT[r.date.getMonth()]} ${String(r.date.getFullYear()).slice(2)}`)} />
      </LineChart>
      <p className={`mt-1 ${NOTE}`}>Solid: saved so far. Dashed: where this pace goes. Grey: the target.</p>
    </div>
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
    <dialog ref={ref} className={DIALOG} aria-labelledby="goal-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save} className="grid gap-3 text-[14px]">
        <h2 id="goal-title" className={DIALOG_H}>
          {goal ? 'Change goal' : 'New goal'}
        </h2>
        {!goal && kids.length > 0 && !KID.has(household.role) && (
          <label className="grid gap-1">
            <span className="font-semibold">For</span>
            <select className={FIELD} value={owner} onChange={(e) => (setOwner(e.target.value), setAccount(''))}>
              {[me.user_id, ...kids.map((k) => k.user_id)].map((id) => (
                <option key={id} value={id}>
                  {whoName(id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1">
          <span className="font-semibold">Name</span>
          <input className={FIELD} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Beach trip" required />
        </label>
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 p-0 font-semibold">How it fills</legend>
          <label className={FILL}>
            <input
              type="radio"
              name="fills"
              className="mt-1 accent-zinc-900 dark:accent-white"
              checked={fills === 'account'}
              onChange={() => setFills('account')}
              disabled={accounts.length === 0}
            />
            <span>
              <strong className="block">Follow a savings account</strong>
              <small className={NOTE}>Fills on its own from the balance.</small>
            </span>
          </label>
          {fills === 'account' && accounts.length > 0 && (
            <select className={FIELD} aria-label="Account it follows" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Choose an account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ••${a.mask}` : ''}, {a.currency}
                </option>
              ))}
            </select>
          )}
          {accounts.length === 0 && <p className={NOTE}>No savings account to follow yet. Link a bank, or update it yourself.</p>}
          <label className={FILL}>
            <input type="radio" name="fills" className="mt-1 accent-zinc-900 dark:accent-white" checked={fills === 'hand'} onChange={() => setFills('hand')} />
            <span>
              <strong className="block">I&apos;ll update it myself</strong>
              <small className={NOTE}>For cash, or money Coinroof can&apos;t see.</small>
            </span>
          </label>
        </fieldset>
        <div className={`grid gap-2 ${fills === 'hand' ? 'grid-cols-[1fr_104px]' : ''}`}>
          <label className="grid gap-1">
            <span className="font-semibold">Target ({cur})</span>
            <input
              className={FIELD}
              inputMode="decimal"
              autoComplete="off"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="5000"
              required
            />
          </label>
          {fills === 'hand' && (
            <label className="grid gap-1">
              <span className="font-semibold">Currency</span>
              <select className={FIELD} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {[...new Set([household.home_currency, ...CURRENCIES])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <MonthPicker label="By (optional)" value={by} onChange={setBy} today={today()} />
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 p-0 font-semibold">Who can see it</legend>
          <Chips
            label="Who can see it"
            options={[
              ['me', owner === me.user_id ? 'Only me' : `Only ${whoName(owner)}`],
              ['member', owner === me.user_id ? 'Me and…' : `${whoName(owner)} and…`],
              ['everyone', 'Everyone in the household'],
            ]}
            value={visibility}
            onChange={setVisibility}
          />
        </fieldset>
        {visibility === 'member' && (
          <select className={FIELD} aria-label="Who else can see it" value={sharedWith} onChange={(e) => setSharedWith(e.target.value)}>
            <option value="">Choose someone</option>
            {others.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {whoName(m.user_id)}
              </option>
            ))}
          </select>
        )}
        {fills === 'account' && <p className={NOTE}>People who can&apos;t see that account&apos;s balance see the goal&apos;s name and target only.</p>}
        {error && (
          <p className="m-0 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {goal ? (
            confirmDelete ? (
              <Pill disabled={busy} onClick={remove}>
                Yes, delete it
              </Pill>
            ) : (
              <button type="button" className="text-[13px] font-semibold underline underline-offset-4" style={OWE} onClick={() => setConfirmDelete(true)}>
                Delete goal
              </button>
            )
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Pill quiet onClick={onClose} disabled={busy}>
              Cancel
            </Pill>
            <Pill type="submit" disabled={busy}>
              {busy ? 'Saving…' : goal ? 'Save' : 'Create goal'}
            </Pill>
          </span>
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
    <dialog ref={ref} className={DIALOG} aria-labelledby="saved-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save} className="grid gap-3 text-[14px]">
        <h2 id="saved-title" className={DIALOG_H}>
          Update {goal.name}
        </h2>
        <label className="grid gap-1">
          <span className="font-semibold">Saved so far ({goal.currency})</span>
          <input className={FIELD} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <p className={NOTE}>Move the money in your bank&apos;s app first; this only keeps count.</p>
        {error && (
          <p className="m-0 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Pill quiet onClick={onClose} disabled={busy}>
            Cancel
          </Pill>
          <Pill type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Pill>
        </div>
      </form>
    </dialog>
  )
}
