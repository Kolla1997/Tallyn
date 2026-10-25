// Goals, calm draft (#185). Same jobs as web/src/screens/GoalsPage.jsx: This month (what to put
// aside, ticked when money lands, the answer first), every goal as a pot that fills (a private one
// shows locked), the goal you open as a forecast with its chart, next milestone and per-month
// amount, how it fills and who can see it, Update amount and Change goal, and the New / Change
// goal dialog. Bklit draws the forecast. Tallyn never moves money. Made-up names and amounts.
import { useMemo, useState } from 'react'
import { Plus, Lock, Check, X } from 'lucide-react'
import { curveLinear } from '@visx/curve'
import { LineChart } from '@/components/charts/line-chart'
import { Line } from '@/components/charts/line'
import { XAxis } from '@/components/charts/x-axis'
import * as D from '../home/data.js'
import { Panel, Note, Chips, PageHead, Button } from './ui.jsx'

const fmt = (v, cur = 'USD', d = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const savings = D.accounts.find((a) => a.name === 'High-yield savings')
const teen = D.accounts.find((a) => a.name === 'Teen savings')

// Saved at the end of each month, January to October 2026 (made up; the last value is today's).
const GOALS = [
  {
    id: 'beach',
    name: 'Beach trip',
    cur: 'USD',
    target: 5000,
    by: 'June 2027',
    monthsLeft: 8,
    fills: 'hand',
    who: 'You and James',
    history: [1200, 1500, 1700, 1900, 2200, 2400, 2600, 2900, 3150, 3400],
    month: { due: 200, added: 0 },
  },
  {
    id: 'leo',
    name: 'Leo’s school fund',
    cur: 'USD',
    target: 1000,
    by: 'September 2027',
    monthsLeft: 11,
    fills: 'Teen savings',
    who: 'You, James and Leo',
    history: [180, 200, 220, 250, 270, 300, 320, 350, 372, teen.bal],
    month: { due: 54, added: 40 },
  },
  {
    id: 'emergency',
    name: 'Emergency fund',
    cur: 'USD',
    target: 20000,
    by: null,
    fills: 'High-yield savings',
    who: 'You and James',
    history: [15200, 15600, 15900, 16300, 16700, 17000, 17400, 17800, 18100, savings.bal],
  },
  {
    id: 'paris',
    name: 'Paris trip',
    cur: 'EUR',
    target: 2500,
    by: 'August 2027',
    monthsLeft: 10,
    fills: 'hand',
    who: 'Only you',
    history: [0, 0, 0, 0, 150, 300, 450, 600, 700, 800],
    month: { due: 170, added: 0 },
  },
  { id: 'car', name: 'James’s new car', cur: 'USD', target: 8000, private: true, owner: 'James' },
]
console.assert(GOALS[1].history.at(-1) === 412 && GOALS[2].history.at(-1) === 18400, 'goals follow their accounts')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const saved = (g) => g.history?.at(-1) ?? 0
const pace = (g) => Math.round((saved(g) - g.history[0]) / (g.history.length - 1))

function forecastOf(g) {
  const p = pace(g)
  const left = g.target - saved(g)
  if (left <= 0) return { words: 'Reached. Well done.', months: 0 }
  if (p <= 0) return { words: 'Add to it to see when it lands.', months: null }
  const months = Math.ceil(left / p)
  const idx = 9 + months // Oct 2026 is index 9
  const when = `${MONTHS[idx % 12]} ${2026 + Math.floor(idx / 12)}`
  const early = g.monthsLeft != null ? g.monthsLeft - months : null
  const words =
    early == null
      ? `At your pace, it lands in ${when}.`
      : early > 0
        ? `At your pace, it lands in ${when}, ${early === 1 ? 'a month' : `${early} months`} early.`
        : early === 0
          ? `At your pace, it lands in ${when}, right on time.`
          : `At your pace, it lands in ${when}, ${-early === 1 ? 'a month' : `${-early} months`} late.`
  return { words, months, when }
}

function Pot({ g, selected, onPick }) {
  if (g.private) {
    return (
      <li>
        <div className="flex h-full flex-col gap-2 rounded-2xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <div className="flex h-14 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
            <Lock className="size-5" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold">{g.name}</span>
          <Note>Target {fmt(g.target, g.cur)}</Note>
          <span className="w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Progress is private
          </span>
        </div>
      </li>
    )
  }
  const share = Math.min(1, saved(g) / g.target)
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onPick}
        className="flex h-full w-full flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 text-left transition-[border-color,transform] duration-150 ease-out active:scale-[0.98] aria-pressed:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:aria-pressed:border-white"
      >
        <span className="relative block h-14 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
          <span className="absolute inset-x-0 bottom-0 block" style={{ height: `${share * 100}%`, background: 'var(--in)' }} />
        </span>
        <span className="text-sm font-semibold">{g.name}</span>
        <span className="font-[family-name:'Space_Grotesk'] text-sm font-semibold tabular-nums">
          {fmt(saved(g), g.cur)}{' '}
          <span className="font-[family-name:Montserrat] text-[13px] font-normal text-zinc-500 dark:text-zinc-400">of {fmt(g.target, g.cur)}</span>
        </span>
        <Note>
          {g.target - saved(g) > 0 ? `${fmt(g.target - saved(g), g.cur)} to go` : 'Reached'}
          {g.by && ` · by ${g.by}`}
        </Note>
      </button>
    </li>
  )
}

function Detail({ g, onUpdate, onEdit }) {
  const f = forecastOf(g)
  const data = useMemo(() => {
    const rows = g.history.map((v, i) => ({ date: new Date(2026, i, 28), saved: v }))
    const p = pace(g)
    const ahead = Math.max(f.months ?? 0, g.monthsLeft ?? 0, 2)
    for (let k = 1; k <= ahead; k++) rows.push({ date: new Date(2026, 9 + k, 28), saved: Math.min(g.target, saved(g) + p * k) })
    return rows.map((r) => ({ ...r, target: g.target }))
  }, [g, f.months])
  const next = [0.25, 0.5, 0.75, 1].map((m) => m * g.target).find((m) => m > saved(g))
  const each = g.monthsLeft ? Math.ceil((g.target - saved(g)) / g.monthsLeft) : null
  return (
    <Panel id="goal-detail-h" title={g.name} meta={fmt(saved(g), g.cur) + ' of ' + fmt(g.target, g.cur)}>
      <p className="font-[family-name:'Space_Grotesk'] text-lg font-semibold">{f.words}</p>
      <Note>You’ve added about {fmt(pace(g), g.cur)} a month since January.</Note>
      <div className="mt-3">
        <LineChart data={data} aspectRatio="5 / 2" margin={{ left: 8, right: 8, top: 8, bottom: 24 }}>
          <Line
            dataKey="target"
            curve={curveLinear}
            fadeEdges={false}
            stroke="#a1a1aa"
            strokeWidth={1}
            dashFromIndex={0}
            showHighlight={false}
            animate={false}
          />
          <Line dataKey="saved" curve={curveLinear} fadeEdges={false} stroke="var(--in)" strokeWidth={2} dashFromIndex={9} animate={false} />
          <XAxis labels={data.map((r) => `${MONTHS[r.date.getMonth()]} ${String(r.date.getFullYear()).slice(2)}`)} />
        </LineChart>
        <Note className="mt-1">Solid: saved so far · dotted: where this pace goes · grey: the target</Note>
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {next && (
          <li>
            <b className="font-[family-name:'Space_Grotesk'] tabular-nums">{fmt(next - saved(g), g.cur)}</b> to{' '}
            {next === g.target ? 'the goal' : `${Math.round((next / g.target) * 100)}%`}.
          </li>
        )}
        {each && (
          <li>
            Put aside <b className="font-[family-name:'Space_Grotesk'] tabular-nums">{fmt(each, g.cur)} a month</b> to get there by {g.by}.
          </li>
        )}
        <li className="text-zinc-600 dark:text-zinc-300">{g.fills === 'hand' ? 'Updated by hand.' : `Follows ${g.fills}: updates at each bank update.`}</li>
        <li className="text-zinc-600 dark:text-zinc-300">Who can see it: {g.who}.</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {g.fills === 'hand' && (
          <Button quiet onClick={onUpdate}>
            Update amount
          </Button>
        )}
        <Button quiet onClick={onEdit}>
          Change goal
        </Button>
      </div>
    </Panel>
  )
}

function GoalDialog({ goal, update, onClose }) {
  const [fills, setFills] = useState(goal?.fills && goal.fills !== 'hand' ? 'account' : 'hand')
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="gdlg-h">
      <div className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="gdlg-h" className="font-[family-name:'Space_Grotesk'] text-lg font-semibold">
            {update ? `Update ${goal.name}` : goal ? 'Change goal' : 'New goal'}
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
        {update ? (
          <div className="grid gap-3 text-sm">
            <label className="grid gap-1">
              <span className="font-semibold">Saved so far</span>
              <input
                inputMode="decimal"
                defaultValue={saved(goal)}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <Note>Move the money in your bank’s app first; this only keeps count.</Note>
          </div>
        ) : (
          <div className="grid gap-3 text-sm">
            <label className="grid gap-1">
              <span className="font-semibold">Name</span>
              <input
                defaultValue={goal?.name}
                placeholder="Beach trip"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <label className="grid gap-1">
                <span className="font-semibold">Target</span>
                <input
                  inputMode="decimal"
                  defaultValue={goal?.target}
                  className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Currency</span>
                <select
                  defaultValue={goal?.cur || 'USD'}
                  className="h-10 rounded-xl border border-zinc-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option>USD</option>
                  <option>GBP</option>
                  <option>EUR</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1">
              <span className="font-semibold">By</span>
              <select defaultValue={goal?.by || ''} className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
                <option value="">No date</option>
                <option>June 2027</option>
                <option>September 2027</option>
                <option>August 2027</option>
              </select>
            </label>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 font-semibold">How it fills</legend>
              <Chips
                label="How it fills"
                options={[
                  ['account', 'Follow a savings account'],
                  ['hand', 'I’ll update it'],
                ]}
                value={fills}
                onChange={setFills}
              />
              <Note>{fills === 'account' ? 'Fills on its own from the balance.' : 'For cash, or money Tallyn can’t see.'}</Note>
              {fills === 'account' && (
                <select aria-label="Account it follows" className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <option>High-yield savings · Ally ··1180</option>
                  <option>Teen savings · Chase ··2209</option>
                </select>
              )}
            </fieldset>
            <label className="grid gap-1">
              <span className="font-semibold">Who can see it</span>
              <select aria-label="Who else can see it" className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
                <option>Only you</option>
                <option>You and James</option>
                <option>Everyone in the household</option>
              </select>
              <Note>People who can’t see the account it follows see its name and target only.</Note>
            </label>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          {goal && !update ? (
            <Button danger small>
              Delete goal
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

export default function Goals() {
  const [picked, setPicked] = useState('beach')
  const [dialog, setDialog] = useState(null)
  const month = GOALS.filter((g) => g.month)
  const usdDue = month.filter((g) => g.cur === 'USD').reduce((s, g) => s + g.month.due, 0)
  const otherDue = month.filter((g) => g.cur !== 'USD')
  const done = month.filter((g) => g.month.added >= g.month.due).length
  const goal = GOALS.find((g) => g.id === picked)
  return (
    <>
      <PageHead title="Goals" sub="Save toward what matters. Tallyn can’t move money: move it in your bank’s app.">
        <Button icon={Plus} onClick={() => setDialog({ kind: 'new' })}>
          New goal
        </Button>
      </PageHead>
      <div className="grid gap-3">
        <Panel id="goals-month-h">
          <h2 id="goals-month-h" className="font-[family-name:'Space_Grotesk'] text-lg font-semibold">
            Put aside {fmt(usdDue)} this month
            {otherDue.length > 0 && `, plus ${otherDue.map((g) => fmt(g.month.due, g.cur)).join(' and ')} in another currency`}.
          </h2>
          <Note>
            {done} of {month.length} done · they tick on their own when money lands
          </Note>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {month.map((g) => {
              const ok = g.month.added >= g.month.due
              return (
                <li key={g.id} className="flex items-start gap-2.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${ok ? 'text-white' : 'border-2 border-zinc-300 dark:border-zinc-600'}`}
                    style={ok ? { background: 'var(--in)' } : undefined}
                    aria-hidden="true"
                  >
                    {ok && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      Put aside {fmt(g.month.due, g.cur)} for {g.name}
                    </span>
                    <Note>
                      {ok
                        ? `Done: ${fmt(g.month.added, g.cur)} added this month`
                        : g.month.added > 0
                          ? `${fmt(g.month.added, g.cur)} so far. It ticks when the account grows.`
                          : `Not yet this month. ${g.fills === 'hand' ? 'It ticks when you update the amount.' : 'It ticks when the account grows.'}`}
                    </Note>
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 [&>*]:min-w-0">
          <section aria-labelledby="goals-pots-h" className="lg:col-span-7">
            <h2 id="goals-pots-h" className="mb-2 font-[family-name:'Space_Grotesk'] text-[15px] font-semibold">
              Your goals
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GOALS.map((g) => (
                <Pot key={g.id} g={g} selected={g.id === picked} onPick={() => setPicked(g.id)} />
              ))}
            </ul>
          </section>
          <div className="lg:col-span-5">
            <Detail key={goal.id} g={goal} onUpdate={() => setDialog({ kind: 'update', goal })} onEdit={() => setDialog({ kind: 'edit', goal })} />
          </div>
        </div>
      </div>
      {dialog && <GoalDialog goal={dialog.goal} update={dialog.kind === 'update'} onClose={() => setDialog(null)} />}
    </>
  )
}
