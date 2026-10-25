// Debts, calm draft (#185). Same jobs as web/src/screens/DebtsPage.jsx: whose debts, what you owe
// by kind with You owe, three facts (payments due this month, interest paid this year, overdue),
// then each debt grouped by kind with its details line and how far along it is (limit used for
// cards, paid off for loans), and the note when a bank shares no details.
// Three layouts to compare (draft only, ?l=a|b|c): A Statement (rows, like a bank statement),
// B Workspace (cards at fixed widths), C Mix (B's compact summary over A's rows).
// Bklit ring chart and gauge. Made-up names and amounts.
import { useState } from 'react'
import { RingChart } from '@/components/charts/ring-chart'
import { Ring } from '@/components/charts/ring'
import { RingCenter } from '@/components/charts/ring-center'
import { Gauge } from '@/components/charts/gauge'
import * as D from '../home/data.js'
import { Panel, Note, Chips, PageHead, usd } from './ui.jsx'

// The debts behind the accounts in data.js, with the details the banks share (made up).
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
    details: ['APR 24.99%', 'Min $35.00'],
    due: { when: 'Oct 28', soon: true },
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
    details: ['6.40%', 'Paid off by Aug 2030'],
    due: { when: 'Nov 1', amount: 386 },
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
  ['a', 'A · Statement'],
  ['b', 'B · Workspace'],
  ['c', 'C · Mix'],
]
const NUM = "font-[family-name:'Space_Grotesk'] font-semibold tabular-nums"
const CARD = 'rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'

// What each debt's progress says, once, for every layout.
function progress(d) {
  const pct = d.kind === 'used' ? (d.owed / d.max) * 100 : ((d.max - d.owed) / d.max) * 100
  return {
    pct,
    color: d.kind === 'used' ? 'var(--accent)' : 'var(--in)',
    main: d.kind === 'used' ? `${Math.round(pct)}% of ${usd(d.max, 0)} limit used` : `${Math.round(pct)}% paid off of ${usd(d.max, 0)}`,
    side: d.kind === 'used' ? `${usd(d.max - d.owed, 0)} available` : `${usd(d.owed, 0)} to go`,
  }
}

function DueTag({ due }) {
  const text = `${due.amount ? `${usd(due.amount)} ` : ''}due ${due.when}`
  return due.soon ? (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">{text}</span>
  ) : (
    <span>{text}</span>
  )
}
const Details = ({ d }) => (
  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
    {d.details.map((x) => (
      <span key={x}>{x}</span>
    ))}
    <DueTag due={d.due} />
  </p>
)
// A thin bar: the statement's way of showing how far along a debt is.
const Bar = ({ p }) => (
  <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--track)' }} aria-hidden="true">
    <span className="block h-full rounded-full" style={{ width: `${p.pct}%`, background: p.color }} />
  </span>
)

function useDebts(who) {
  const debts = DEBTS.filter((d) => who === 'everyone' || (who === 'yours' ? d.who === 'maya' : d.who === 'joint'))
  const groups = GROUPS.map(([key, label, color]) => ({ key, label, color, list: debts.filter((d) => d.group === key) }))
    .filter((g) => g.list.length)
    .map((g) => ({ ...g, value: g.list.reduce((s, d) => s + d.owed, 0), max: g.list.reduce((s, d) => s + Math.max(d.max, d.owed), 0) }))
  const owe = debts.reduce((s, d) => s + d.owed, 0)
  // Payments due this month: the Amex minimum on Oct 28 (the car loan is due Nov 1).
  const due = debts.some((d) => d.id === 'amex') ? 35 : null
  const interest = debts.some((d) => d.id === 'loan') ? 756.4 : null
  const facts = [
    ['Due this month', due != null ? usd(due) : '—', due != null ? 'Amex minimum, Oct 28' : 'Nothing this month'],
    ['Interest this year', interest != null ? usd(interest) : '—', interest != null ? 'On loans' : 'Your banks haven’t shared it'],
    ['Overdue', 'None', 'All on time', 'var(--in-text)'],
  ]
  return { debts, groups, owe, facts }
}

// The statement rows, shared by A and C: name and details, a thin bar, the amount.
function Rows({ groups }) {
  return (
    <section aria-label="Your debts" className={`${CARD} px-4 pt-2 pb-1`}>
      {groups.map((g) => (
        <div key={g.key}>
          <h2 className="flex items-baseline justify-between border-b border-zinc-100 pt-2 pb-1.5 text-[13px] font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {g.label}
            <span className="tabular-nums">{usd(-g.value)}</span>
          </h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {g.list.map((d) => {
              const p = progress(d)
              return (
                <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {d.name} <span className="font-normal text-zinc-500 dark:text-zinc-400">··{d.mask}</span>
                    </h3>
                    <Details d={d} />
                  </div>
                  <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                    <Bar p={p} />
                    <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">{p.main}</p>
                  </div>
                  <span className={`${NUM} text-base`} style={{ color: 'var(--owe-text)' }}>
                    {usd(-d.owed)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

// ── A · Statement: one 880px column, a summary strip, then every debt as a row in one card.
function Statement({ groups, owe, facts }) {
  return (
    <div className="grid gap-3">
      <section aria-label="What you owe" className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <Note>You owe</Note>
            <p className={`${NUM} text-3xl`} style={{ color: 'var(--owe-text)' }}>
              {usd(-owe)}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-x-6 text-[13px]">
            {facts.map(([k, v, note, tone]) => (
              <div key={k}>
                <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
                <dd className={`${NUM} text-base`} style={tone ? { color: tone } : undefined}>
                  {v}
                  <span className="sr-only"> · {note}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <span className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {groups.map((g) => (
            <span key={g.key} style={{ width: `${(g.value / owe) * 100}%`, background: g.color }} />
          ))}
        </span>
        <p className="mt-1.5 flex flex-wrap gap-x-4 text-[13px] text-zinc-600 dark:text-zinc-300">
          {groups.map((g) => (
            <span key={g.key} className="flex items-center gap-1.5">
              <i className="size-2 rounded-full" style={{ background: g.color }} />
              {g.label} <b className={NUM}>{usd(g.value)}</b>
            </span>
          ))}
        </p>
      </section>
      <Rows groups={groups} />
    </div>
  )
}

// ── B · Workspace: cards stay, at fixed widths in a grid; none grows past about 460px.
function Workspace({ groups, owe, facts }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,460px)_minmax(0,300px)]">
        <section aria-label="What you owe by kind" className={`${CARD} p-4`}>
          <div className="flex items-center gap-4">
            <RingChart
              data={groups.map((g) => ({ label: g.label, value: g.value, maxValue: g.max }))}
              size={132}
              strokeWidth={10}
              ringGap={4}
              baseInnerRadius={36}
            >
              {groups.map((g, i) => (
                <Ring key={g.key} index={i} color={g.color} showGlow={false} />
              ))}
              <RingCenter defaultLabel="You owe" prefix="$" />
            </RingChart>
            <ul className="grid min-w-0 grow gap-2 text-[13px]">
              {groups.map((g) => (
                <li key={g.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-semibold">
                    <i className="size-2 rounded-full" style={{ background: g.color }} />
                    {g.label}
                  </span>
                  <span className={NUM}>{usd(g.value)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <span className="font-semibold">You owe</span>
                <span className={NUM} style={{ color: 'var(--owe-text)' }}>
                  {usd(-owe)}
                </span>
              </li>
            </ul>
          </div>
        </section>
        <dl aria-label="Payments, interest and overdue" className={`${CARD} grid content-center gap-2.5 p-4`}>
          {facts.map(([k, v, note, tone]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-zinc-500 dark:text-zinc-400">{k}</dt>
              <dd className={`${NUM} text-sm`} style={tone ? { color: tone } : undefined}>
                {v}
                <span className="sr-only"> · {note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="grid gap-3 md:grid-cols-[repeat(auto-fill,minmax(300px,380px))]">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`debts-${g.key}`}>
            <h2 id={`debts-${g.key}`} className="mb-2 flex gap-2 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
              {g.label} <span className="tabular-nums">{usd(-g.value)}</span>
            </h2>
            <div className="grid gap-3">
              {g.list.map((d) => {
                const p = progress(d)
                return (
                  <article key={d.id} aria-label={`${d.name} ending ${d.mask}`} className={`${CARD} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 truncate text-sm font-semibold">
                        {d.name} <span className="font-normal text-zinc-500 dark:text-zinc-400">··{d.mask}</span>
                      </h3>
                      <span className={`${NUM} text-base`} style={{ color: 'var(--owe-text)' }}>
                        {usd(-d.owed)}
                      </span>
                    </div>
                    <Details d={d} />
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span className="font-semibold">{p.main}</span>
                        <span className="text-zinc-500 dark:text-zinc-400">{p.side}</span>
                      </div>
                      <Gauge
                        orientation="linear"
                        inactiveFill="var(--track)"
                        value={Math.round(p.pct)}
                        totalNotches={16}
                        activeFill={p.color}
                        defaultLabel={`${p.main}, ${p.side}`}
                        suffix="%"
                        minWidth={160}
                        linearHeight={10}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

// ── C · Mix: B's compact summary (a small ring, the total and legend beside it, the facts in a
// column) over A's statement rows. Only amounts use the number face; titles are the body face.
function Mix({ groups, owe, facts }) {
  return (
    <div className="grid gap-3">
      <section aria-label="What you owe" className={`${CARD} grid gap-4 p-4 sm:grid-cols-[auto_auto_auto] sm:items-center sm:justify-start sm:gap-x-8`}>
        <RingChart data={groups.map((g) => ({ label: g.label, value: g.value, maxValue: g.max }))} size={104} strokeWidth={9} ringGap={4} baseInnerRadius={26}>
          {groups.map((g, i) => (
            <Ring key={g.key} index={i} color={g.color} showGlow={false} />
          ))}
        </RingChart>
        <div className="min-w-0">
          <Note>You owe</Note>
          <p className={`${NUM} text-2xl`} style={{ color: 'var(--owe-text)' }}>
            {usd(-owe)}
          </p>
          <ul className="mt-1.5 grid w-56 gap-1 text-[13px]">
            {groups.map((g) => (
              <li key={g.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <i className="size-2 rounded-full" style={{ background: g.color }} />
                  {g.label}
                </span>
                <span className="tabular-nums">{usd(g.value)}</span>
              </li>
            ))}
          </ul>
        </div>
        <dl className="grid gap-2 text-[13px] sm:min-w-[220px] sm:border-l sm:border-zinc-100 sm:pl-5 dark:sm:border-zinc-800">
          {facts.map(([k, v, note, tone]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
              <dd className={`${NUM} text-sm`} style={tone ? { color: tone } : undefined}>
                {v}
                <span className="sr-only"> · {note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <Rows groups={groups} />
    </div>
  )
}

const VIEWS = { a: [Statement, 'max-w-[880px]'], b: [Workspace, 'max-w-[1040px]'], c: [Mix, 'max-w-[1040px]'] }

export default function Debts() {
  const [who, setWho] = useState('everyone')
  const [layout, setLayout] = useState(() => {
    const l = new URLSearchParams(location.search).get('l')
    return VIEWS[l] ? l : 'c'
  })
  const pick = (l) => {
    setLayout(l)
    const u = new URL(location.href)
    u.searchParams.set('l', l)
    history.replaceState(null, '', u)
  }
  const data = useDebts(who)
  const [View, cap] = VIEWS[layout]
  return (
    <div className={`mx-auto ${cap}`}>
      <PageHead title="Debts" sub="Everything you owe, in one place">
        <span
          role="group"
          aria-label="Draft: layout"
          className="flex gap-1 rounded-full border border-dashed border-zinc-300 p-0.5 text-[12px] dark:border-zinc-700"
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
      <div className="mb-3">
        <Chips label="Whose debts" options={WHO} value={who} onChange={setWho} />
      </div>
      {data.debts.length === 0 ? (
        <Panel id="debts-empty-h">
          <Note>Nothing owed here. Cards and loans show up when your banks share them.</Note>
        </Panel>
      ) : (
        <View key={`${layout}-${who}`} {...data} />
      )}
    </div>
  )
}
