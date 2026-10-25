// Debts, calm draft (#185). Same jobs as web/src/screens/DebtsPage.jsx: whose debts, what you owe
// by kind with You owe, three facts (payments due this month, interest paid this year, overdue),
// then each debt grouped by kind with its details and how far along it is (limit used for cards,
// paid off for loans), and the note when a bank shares no details.
// Second round, led by ui-ux-pro-max's chart and table guidance (draft only, ?l=d|e|f):
// D Ledger (a waffle for the split, bullet bars per debt), E Table (Swiss columns, figures in a
// strip), F Mix (E's table, D's waffle and bullets). Numbers always sit beside the marks.
// Made-up names and amounts.
import { useState } from 'react'
import * as D from '../home/data.js'
import { Panel, Note, Chips, PageHead, usd } from './ui.jsx'

// The debts behind the accounts in data.js, with the details the banks share (made up).
// The loan's schedule is made up too: $22,000 from Aug 2024 at 6.40% for 72 months, $386 a month,
// which after 26 payments expects about 34% paid off; at $14,200 owed it is 35%, a little ahead.
const amex = D.accounts.find((a) => a.bank === 'Amex')
const loan = D.accounts.find((a) => a.name === 'Car loan')
const DEBTS = [
  {
    id: 'amex',
    who: 'maya',
    group: 'card',
    name: 'Amex Gold',
    mask: amex.last4,
    owed: -amex.bal,
    max: 5000,
    kind: 'used',
    rate: '24.99% APR',
    next: { amount: 35, when: 'Oct 28', note: 'Minimum', soon: true },
    extra: null,
  },
  {
    id: 'loan',
    who: 'joint',
    group: 'other',
    name: 'Ally Auto loan',
    mask: loan.last4,
    owed: -loan.bal,
    max: 22000,
    kind: 'paid',
    rate: '6.40%',
    next: { amount: 386, when: 'Nov 1', note: 'Monthly' },
    extra: 'Paid off by Aug 2030',
    expected: 34,
  },
]
const GROUPS = [
  ['card', 'Credit cards', 'var(--accent)'],
  ['student', 'Student loans', '#d4d4d8'],
  ['mortgage', 'Mortgages', '#a1a1aa'],
  ['other', 'Other loans', '#71717a'], // mid grey: shows on white and on black
]
const WHO = [
  ['yours', 'Yours'],
  ['joint', 'With James'],
  ['everyone', 'Everyone'],
]
const LAYOUTS = [
  ['d', 'D · Ledger'],
  ['e', 'E · Table'],
  ['f', 'F · Mix'],
]
const NUM = "font-[family-name:'Space_Grotesk'] font-semibold tabular-nums"
const CARD = 'rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
const MUTED = 'text-zinc-500 dark:text-zinc-400'

function progress(d) {
  const pct = d.kind === 'used' ? (d.owed / d.max) * 100 : ((d.max - d.owed) / d.max) * 100
  const ahead = d.expected != null ? Math.round(pct) - d.expected : null
  return {
    pct,
    color: d.kind === 'used' ? 'var(--accent)' : 'var(--in)',
    main: d.kind === 'used' ? `${Math.round(pct)}% of ${usd(d.max, 0)} limit` : `${Math.round(pct)}% paid off`,
    side: d.kind === 'used' ? `${usd(d.max - d.owed, 0)} available` : `${usd(d.owed, 0)} to go of ${usd(d.max, 0)}`,
    schedule: ahead == null ? null : ahead > 0 ? 'A little ahead of schedule' : ahead < 0 ? 'A little behind schedule' : 'On schedule',
  }
}

function useDebts(who) {
  const debts = DEBTS.filter((d) => who === 'everyone' || (who === 'yours' ? d.who === 'maya' : d.who === 'joint'))
  const groups = GROUPS.map(([key, label, color]) => ({ key, label, color, list: debts.filter((d) => d.group === key) }))
    .filter((g) => g.list.length)
    .map((g) => ({ ...g, value: g.list.reduce((s, d) => s + d.owed, 0) }))
  const owe = debts.reduce((s, d) => s + d.owed, 0)
  // Payments due this month: the Amex minimum on Oct 28 (the car loan is due Nov 1).
  const due = debts.some((d) => d.id === 'amex') ? 35 : null
  const interest = debts.some((d) => d.id === 'loan') ? 756.4 : null
  const facts = [
    ['Due this month', due != null ? usd(due) : '—', due != null ? 'Amex, Oct 28' : 'Nothing this month'],
    ['Interest this year', interest != null ? usd(interest) : '—', interest != null ? 'On loans' : 'Your banks haven’t shared it'],
    ['Overdue', 'None', 'All on time', 'var(--in-text)'],
  ]
  return { debts, groups, owe, facts }
}

// A waffle: 100 cells, one per percent of what you owe, coloured by kind, labelled beside it.
function Waffle({ groups, owe }) {
  const cells = []
  groups.forEach((g, i) => {
    const n = i === groups.length - 1 ? 100 - cells.length : Math.round((g.value / owe) * 100)
    for (let k = 0; k < n; k++) cells.push(g.color)
  })
  return (
    <div className="flex items-center gap-4">
      <span className="grid shrink-0 grid-cols-10 gap-[2px]" aria-hidden="true">
        {cells.map((c, i) => (
          <i key={i} className="size-[8px] rounded-[1.5px]" style={{ background: c }} />
        ))}
      </span>
      <ul className="grid gap-1.5 text-[0.875rem]">
        {groups.map((g) => (
          <li key={g.key} className="flex items-center gap-2">
            <i className="size-2 shrink-0 rounded-[2px]" style={{ background: g.color }} />
            <span>{g.label}</span>
            <b className={`${NUM} ml-auto pl-4`}>{usd(g.value)}</b>
            <span className={`w-9 text-right tabular-nums ${MUTED}`}>{Math.round((g.value / owe) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// The split of what you owe, five ways to draw it (draft: ?s=waffle|bar|tally|blocks|tape).
const SPLITS = [
  ['waffle', 'Waffle'],
  ['bar', 'Split bar'],
  ['tally', 'Tally'],
  ['blocks', 'Blocks'],
  ['tape', 'Mix · tally tape'],
]
const share = (g, owe) => Math.round((g.value / owe) * 100)
// Each group's share as whole percent, adding up to 100.
function cellsOf(groups, owe) {
  const out = []
  groups.forEach((g, i) => {
    const n = i === groups.length - 1 ? 100 - out.length : share(g, owe)
    for (let k = 0; k < n; k++) out.push(g.color)
  })
  return out
}
const Legend = ({ groups, owe }) => (
  <ul className="grid gap-1.5 text-[0.875rem]">
    {groups.map((g) => (
      <li key={g.key} className="flex items-center gap-2">
        <i className="size-2.5 shrink-0 rounded-[2px]" style={{ background: g.color }} />
        <span>{g.label}</span>
        <b className={`${NUM} ml-auto pl-4`}>{usd(g.value)}</b>
        <span className={`w-10 text-right tabular-nums ${MUTED}`}>{share(g, owe)}%</span>
      </li>
    ))}
  </ul>
)
// Labels sit over each part of a bar, so the colours never carry the meaning alone.
const BarLabels = ({ groups, owe }) => (
  <div className="mb-1.5 flex justify-between gap-4 text-[0.8125rem]">
    {groups.map((g) => (
      <span key={g.key} className="whitespace-nowrap">
        <b className="font-semibold">{g.label}</b> <span className={MUTED}>{share(g, owe)}%</span>
      </span>
    ))}
  </div>
)

function Split({ kind, groups, owe }) {
  const cells = cellsOf(groups, owe)
  if (kind === 'bar')
    return (
      <div className="w-[300px] max-w-full">
        <BarLabels groups={groups} owe={owe} />
        <span className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {groups.map((g) => (
            <span key={g.key} style={{ width: `${share(g, owe)}%`, background: g.color }} />
          ))}
        </span>
        <p className={`mt-1.5 flex justify-between text-[0.8125rem] tabular-nums ${MUTED}`}>
          {groups.map((g) => (
            <span key={g.key}>{usd(g.value)}</span>
          ))}
        </p>
      </div>
    )
  if (kind === 'tally')
    // Tallyn's own mark: every stroke is 1% of what you owe, bundled in fives like a tally.
    return (
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 150 46" className="w-[160px] shrink-0" aria-hidden="true">
          {Array.from({ length: 20 }, (_, gi) => {
            const x0 = (gi % 10) * 15
            const y0 = Math.floor(gi / 10) * 25
            return (
              <g key={gi} strokeWidth="1.6" strokeLinecap="round">
                {[0, 1, 2, 3].map((k) => (
                  <line key={k} x1={x0 + 1 + k * 3} y1={y0 + 2} x2={x0 + 1 + k * 3} y2={y0 + 19} style={{ stroke: cells[gi * 5 + k] }} />
                ))}
                <line x1={x0 - 0.5} y1={y0 + 16} x2={x0 + 11.5} y2={y0 + 5} style={{ stroke: cells[gi * 5 + 4] }} />
              </g>
            )
          })}
        </svg>
        <Legend groups={groups} owe={owe} />
      </div>
    )
  if (kind === 'blocks')
    // Areas in proportion: the big block is what most of the debt is.
    return (
      <div className="flex items-center gap-5">
        <div className="flex h-[72px] w-[200px] shrink-0 gap-0.5 overflow-hidden rounded-xl" aria-hidden="true">
          {[...groups].reverse().map((g) => (
            <span
              key={g.key}
              className="flex items-end p-1.5 text-[0.75rem] font-semibold text-white"
              style={{ width: `${share(g, owe)}%`, background: g.color }}
            >
              {share(g, owe) >= 20 && `${share(g, owe)}%`}
            </span>
          ))}
        </div>
        <Legend groups={groups} owe={owe} />
      </div>
    )
  if (kind === 'tape')
    // Mix: the split bar's labels over a tally tape, 100 strokes in bundles of five.
    return (
      <div className="w-[320px] max-w-full">
        <BarLabels groups={groups} owe={owe} />
        <span className="flex h-6 items-stretch gap-[3px]" aria-hidden="true">
          {Array.from({ length: 20 }, (_, gi) => (
            <span key={gi} className="flex flex-1 gap-[1.5px]">
              {[0, 1, 2, 3, 4].map((k) => (
                <i key={k} className="w-full rounded-full" style={{ background: cells[gi * 5 + k] }} />
              ))}
            </span>
          ))}
        </span>
        <p className={`mt-1.5 flex justify-between text-[0.8125rem] tabular-nums ${MUTED}`}>
          {groups.map((g) => (
            <span key={g.key}>{usd(g.value)}</span>
          ))}
        </p>
      </div>
    )
  return <Waffle groups={groups} owe={owe} />
}

// A bullet bar: the track, how far along, and (for a loan) a tick where the schedule expects it.
function Bullet({ d, p }) {
  return (
    <div>
      <span className="relative block h-2.5 rounded-full" style={{ background: 'var(--track)' }} aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p.pct}%`, background: p.color }} />
        {d.expected != null && <span className="absolute -inset-y-1 w-0.5 rounded-full bg-zinc-900 dark:bg-white" style={{ left: `${d.expected}%` }} />}
      </span>
      <p className={`mt-1 flex flex-wrap justify-between gap-x-3 text-[0.8125rem] ${MUTED}`}>
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">{p.main}</span>
        <span>{p.schedule ?? p.side}</span>
      </p>
    </div>
  )
}

const Next = ({ n }) =>
  n.soon ? (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[0.75rem] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
      {usd(n.amount)} due {n.when}
    </span>
  ) : (
    <span>
      {usd(n.amount)} due {n.when}
    </span>
  )

function Figures({ owe, facts, two }) {
  return (
    <dl className={`grid grid-cols-2 gap-y-3 ${two ? 'gap-x-6' : 'sm:grid-cols-4 sm:divide-x sm:divide-zinc-100 dark:sm:divide-zinc-800'}`}>
      <div className={two ? '' : 'sm:pr-4'}>
        <dt className={`text-[0.875rem] ${MUTED}`}>You owe</dt>
        <dd className={`${NUM} text-[1.375rem]`} style={{ color: 'var(--owe-text)' }}>
          {usd(-owe)}
        </dd>
      </div>
      {facts.map(([k, v, note, tone]) => (
        <div key={k} className={two ? '' : 'sm:px-4'}>
          <dt className={`text-[0.875rem] ${MUTED}`}>{k}</dt>
          <dd className={`${NUM} text-[1.375rem]`} style={tone ? { color: tone } : undefined}>
            {v}
          </dd>
          <dd className={`text-[0.8125rem] ${MUTED}`}>{note}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── D · Ledger: the waffle and the facts in one strip, then rows with bullet bars.
function Ledger({ groups, owe, facts, split }) {
  return (
    <div className="grid gap-3">
      <section aria-label="What you owe" className={`${CARD} flex flex-wrap items-center justify-between gap-x-8 gap-y-4 p-[18px]`}>
        <div>
          <Note>You owe</Note>
          <p className={`${NUM} mb-2 text-[1.625rem]`} style={{ color: 'var(--owe-text)' }}>
            {usd(-owe)}
          </p>
          <Split kind={split} groups={groups} owe={owe} />
        </div>
        <dl className="grid gap-2 text-[0.875rem] sm:min-w-[230px]">
          {facts.map(([k, v, note, tone]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className={MUTED}>{k}</dt>
              <dd className={`${NUM} text-[0.9375rem]`} style={tone ? { color: tone } : undefined}>
                {v}
                <span className="sr-only"> · {note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Your debts" className={`${CARD} px-4 pb-1`}>
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className={`flex justify-between border-b border-zinc-100 pt-3 pb-1.5 text-[0.875rem] font-semibold dark:border-zinc-800 ${MUTED}`}>
              {g.label}
              <span className="tabular-nums">{usd(-g.value)}</span>
            </h2>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {g.list.map((d) => {
                const p = progress(d)
                return (
                  <li key={d.id} className="grid gap-x-6 gap-y-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_260px_auto] sm:items-center">
                    <div className="min-w-0">
                      <h3 className="truncate text-[0.9375rem] font-semibold">
                        {d.name} <span className={`font-normal ${MUTED}`}>··{d.mask}</span>
                      </h3>
                      <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] ${MUTED}`}>
                        <span>{d.rate}</span>
                        <Next n={d.next} />
                        {d.extra && <span>{d.extra}</span>}
                      </p>
                    </div>
                    <Bullet d={d} p={p} />
                    <span className={`${NUM} text-base sm:text-right`} style={{ color: 'var(--owe-text)' }}>
                      {usd(-d.owed)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}

// The table, shared by E and F. `bullets` swaps E's plain percentage for D's bullet bar.
function DebtTable({ groups, owe, bullets }) {
  return (
    <section aria-label="Your debts" className={`${CARD} overflow-x-auto`}>
      <table className="w-full min-w-[640px] text-left text-[0.875rem]">
        <thead>
          <tr className={`border-b border-zinc-200 dark:border-zinc-800 ${MUTED}`}>
            <th scope="col" className="py-2.5 pl-4 font-semibold">
              Debt
            </th>
            <th scope="col" className="py-2.5 font-semibold">
              Rate
            </th>
            <th scope="col" className="py-2.5 font-semibold">
              Next payment
            </th>
            <th scope="col" className="w-[240px] py-2.5 font-semibold">
              Progress
            </th>
            <th scope="col" className="py-2.5 pr-4 text-right font-semibold">
              Balance
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key} className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
              <th scope="rowgroup" colSpan={4} className={`py-1.5 pl-4 text-[0.8125rem] font-semibold ${MUTED}`}>
                {g.label}
              </th>
              <td className={`py-1.5 pr-4 text-right text-[0.8125rem] font-semibold tabular-nums ${MUTED}`}>{usd(-g.value)}</td>
            </tr>
            {g.list.map((d) => {
              const p = progress(d)
              return (
                <tr key={d.id} className="align-middle">
                  <th scope="row" className="py-3.5 pl-4 font-semibold">
                    {d.name} <span className={`font-normal ${MUTED}`}>··{d.mask}</span>
                    {d.extra && <span className={`block text-[0.8125rem] font-normal ${MUTED}`}>{d.extra}</span>}
                  </th>
                  <td className="py-3.5 tabular-nums">{d.rate}</td>
                  <td className="py-3.5">
                    <Next n={d.next} />
                    <span className={`block text-[0.8125rem] ${MUTED}`}>{d.next.note}</span>
                  </td>
                  <td className="py-3.5 pr-6">
                    {bullets ? (
                      <Bullet d={d} p={p} />
                    ) : (
                      <>
                        <span className="font-semibold">{p.main}</span>
                        <span className={`block text-[0.8125rem] ${MUTED}`}>{p.side}</span>
                      </>
                    )}
                  </td>
                  <td className={`${NUM} py-3.5 pr-4 text-right text-[0.9375rem]`} style={{ color: 'var(--owe-text)' }}>
                    {usd(-d.owed)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
        <tfoot>
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <th scope="row" colSpan={4} className="py-2.5 pl-4 font-semibold">
              You owe
            </th>
            <td className={`${NUM} py-2.5 pr-4 text-right text-[0.9375rem]`} style={{ color: 'var(--owe-text)' }}>
              {usd(-owe)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

// ── E · Table: the four figures in one strip, then the table.
function TableView({ groups, owe, facts }) {
  return (
    <div className="grid gap-3">
      <section aria-label="What you owe" className={`${CARD} p-[18px]`}>
        <Figures owe={owe} facts={facts} />
      </section>
      <DebtTable groups={groups} owe={owe} />
    </div>
  )
}

// ── F · Mix: E's figures and table, D's waffle beside the figures and bullets in the table.
function MixView({ groups, owe, facts, split }) {
  return (
    <div className="grid gap-3">
      <section aria-label="What you owe" className={`${CARD} grid gap-5 p-[18px] lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center`}>
        <div className="lg:border-r lg:border-zinc-100 lg:pr-6 dark:lg:border-zinc-800">
          <Split kind={split} groups={groups} owe={owe} />
        </div>
        <Figures owe={owe} facts={facts} two />
      </section>
      <DebtTable groups={groups} owe={owe} bullets />
    </div>
  )
}

const VIEWS = { d: Ledger, e: TableView, f: MixView }

export default function Debts() {
  const [who, setWho] = useState('everyone')
  const [layout, setLayout] = useState(() => {
    const l = new URLSearchParams(location.search).get('l')
    return VIEWS[l] ? l : 'f'
  })
  const pick = (l) => {
    setLayout(l)
    const u = new URL(location.href)
    u.searchParams.set('l', l)
    history.replaceState(null, '', u)
  }
  const [split, setSplit] = useState(() => {
    const v = new URLSearchParams(location.search).get('s')
    return SPLITS.some(([k]) => k === v) ? v : 'tally'
  })
  const pickSplit = (v) => {
    setSplit(v)
    const u = new URL(location.href)
    u.searchParams.set('s', v)
    history.replaceState(null, '', u)
  }
  const data = useDebts(who)
  const View = VIEWS[layout]
  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHead title="Debts" sub="Everything you owe, in one place">
        <span
          role="group"
          aria-label="Draft: layout"
          className="flex gap-1 rounded-full border border-dashed border-zinc-300 p-0.5 text-[0.8125rem] dark:border-zinc-700"
        >
          {LAYOUTS.map(([k, name]) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === layout}
              onClick={() => pick(k)}
              className="rounded-full px-2.5 py-0.5 font-semibold text-zinc-600 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:text-zinc-300 dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
            >
              {name}
            </button>
          ))}
        </span>
      </PageHead>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Chips label="Whose debts" options={WHO} value={who} onChange={setWho} />
        {layout !== 'e' && (
          <span
            role="group"
            aria-label="Draft: split"
            className="flex flex-wrap gap-1 rounded-full border border-dashed border-zinc-300 p-0.5 text-[0.75rem] dark:border-zinc-700"
          >
            {SPLITS.map(([k, name]) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === split}
                onClick={() => pickSplit(k)}
                className="rounded-full px-2.5 py-0.5 font-semibold text-zinc-600 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:text-zinc-300 dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
              >
                {name}
              </button>
            ))}
          </span>
        )}
      </div>
      {data.debts.length === 0 ? (
        <Panel id="debts-empty-h">
          <Note>Nothing owed here. Cards and loans show up when your banks share them.</Note>
        </Panel>
      ) : (
        <View key={`${layout}-${who}`} {...data} split={split} />
      )}
    </div>
  )
}
