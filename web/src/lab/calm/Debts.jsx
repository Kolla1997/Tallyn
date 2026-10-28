// Debts, calm draft (#185). Same jobs as web/src/screens/DebtsPage.jsx: whose debts, what you owe
// by kind with You owe, three facts (payments due this month, interest paid this year, overdue),
// then each debt grouped by kind with its details and how far along it is (limit used for cards,
// paid off for loans), and the note when a bank shares no details.
// Layout (Dinesh picked F, the Mix): a summary strip with a waffle for the split and the four
// figures, then a table of debts with a bullet bar each. Numbers always sit beside the marks.
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
  ['student', 'Student loans', 'var(--grey-1)'],
  ['mortgage', 'Mortgages', 'var(--grey-2)'],
  ['other', 'Other loans', 'var(--grey-3)'], // mid grey: shows on white and on black
]
const WHO = [
  ['yours', 'Yours'],
  ['joint', 'With James'],
  ['everyone', 'Everyone'],
]
const NUM = 'font-display font-semibold tabular-nums'
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
      <ul className="grid gap-1.5 text-[13px]">
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

// A bullet bar: the track, how far along, and (for a loan) a tick where the schedule expects it.
function Bullet({ d, p }) {
  return (
    <div>
      <span className="relative block h-2.5 rounded-full" style={{ background: 'var(--track)' }} aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p.pct}%`, background: p.color }} />
        {d.expected != null && <span className="absolute -inset-y-1 w-0.5 rounded-full bg-zinc-900 dark:bg-white" style={{ left: `${d.expected}%` }} />}
      </span>
      <p className={`mt-1 flex flex-wrap justify-between gap-x-3 text-[12px] ${MUTED}`}>
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">{p.main}</span>
        <span>{p.schedule ?? p.side}</span>
      </p>
    </div>
  )
}

const Next = ({ n }) =>
  n.soon ? (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-red-700 dark:bg-red-950 dark:text-red-300">
      {usd(n.amount)} due {n.when}
    </span>
  ) : (
    <span>
      {usd(n.amount)} due {n.when}
    </span>
  )

function Figures({ owe, facts }) {
  return (
    <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:divide-x sm:divide-zinc-100 dark:sm:divide-zinc-800">
      <div className="sm:pr-4">
        <dt className={`text-[13px] whitespace-nowrap ${MUTED}`}>You owe</dt>
        <dd className={`${NUM} text-xl whitespace-nowrap`} style={{ color: 'var(--owe-text)' }}>
          {usd(-owe)}
        </dd>
      </div>
      {facts.map(([k, v, note, tone]) => (
        <div key={k} className="sm:px-3">
          <dt className={`text-[13px] whitespace-nowrap ${MUTED}`}>{k}</dt>
          <dd className={`${NUM} text-xl whitespace-nowrap`} style={tone ? { color: tone } : undefined}>
            {v}
          </dd>
          <dd className={`text-[12px] ${MUTED}`}>{note}</dd>
        </div>
      ))}
    </dl>
  )
}

// Phones (under 640px): the same debts as stacked rows, so nothing scrolls sideways.
function DebtList({ groups, owe }) {
  return (
    <section aria-label="Your debts" className={`${CARD} px-4 pb-1 sm:hidden`}>
      {groups.map((g) => (
        <div key={g.key}>
          <h2 className={`flex justify-between border-b border-zinc-100 pt-3 pb-1.5 text-[12px] font-semibold dark:border-zinc-800 ${MUTED}`}>
            {g.label}
            <span className="tabular-nums">{usd(-g.value)}</span>
          </h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {g.list.map((d) => (
              <li key={d.id} className="grid gap-2 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold">
                    {d.name} <span className={`font-normal ${MUTED}`}>··{d.mask}</span>
                  </h3>
                  <span className={`${NUM} text-sm`} style={{ color: 'var(--owe-text)' }}>
                    {usd(-d.owed)}
                  </span>
                </div>
                <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${MUTED}`}>
                  <span>{d.rate}</span>
                  <Next n={d.next} />
                  {d.extra && <span>{d.extra}</span>}
                </p>
                <Bullet d={d} p={progress(d)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="flex justify-between border-t border-zinc-200 py-3 text-sm font-semibold dark:border-zinc-800">
        You owe
        <span className={NUM} style={{ color: 'var(--owe-text)' }}>
          {usd(-owe)}
        </span>
      </p>
    </section>
  )
}

// Every debt as a table row: name, rate, next payment, a bullet bar, the balance.
function DebtTable({ groups, owe }) {
  return (
    <section aria-label="Your debts" className={`${CARD} hidden overflow-x-auto sm:block`}>
      <table className="w-full min-w-[640px] text-left text-[13px]">
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
              <th scope="rowgroup" colSpan={4} className={`py-1.5 pl-4 text-[12px] font-semibold ${MUTED}`}>
                {g.label}
              </th>
              <td className={`py-1.5 pr-4 text-right text-[12px] font-semibold tabular-nums ${MUTED}`}>{usd(-g.value)}</td>
            </tr>
            {g.list.map((d) => {
              const p = progress(d)
              return (
                <tr key={d.id} className="align-middle">
                  <th scope="row" className="py-3 pl-4 font-semibold">
                    {d.name} <span className={`font-normal ${MUTED}`}>··{d.mask}</span>
                    {d.extra && <span className={`block text-[12px] font-normal ${MUTED}`}>{d.extra}</span>}
                  </th>
                  <td className="py-3 tabular-nums">{d.rate}</td>
                  <td className="py-3">
                    <Next n={d.next} />
                    <span className={`block text-[12px] ${MUTED}`}>{d.next.note}</span>
                  </td>
                  <td className="py-3 pr-6">
                    <Bullet d={d} p={p} />
                  </td>
                  <td className={`${NUM} py-3 pr-4 text-right text-sm`} style={{ color: 'var(--owe-text)' }}>
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
            <td className={`${NUM} py-2.5 pr-4 text-right text-sm`} style={{ color: 'var(--owe-text)' }}>
              {usd(-owe)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

// The summary strip (waffle and figures), then the table.
function Summary({ groups, owe, facts }) {
  return (
    <div className="grid gap-3">
      <section aria-label="What you owe" className={`${CARD} grid gap-5 p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center`}>
        <div className="lg:border-r lg:border-zinc-100 lg:pr-6 dark:lg:border-zinc-800">
          <Waffle groups={groups} owe={owe} />
        </div>
        <Figures owe={owe} facts={facts} />
      </section>
      <DebtTable groups={groups} owe={owe} />
      <DebtList groups={groups} owe={owe} />
    </div>
  )
}

export default function Debts() {
  const [who, setWho] = useState('everyone')
  const data = useDebts(who)
  return (
    <>
      <PageHead title="Debts" sub="Everything you owe, in one place" />
      <div className="mb-3">
        <Chips label="Whose debts" options={WHO} value={who} onChange={setWho} />
      </div>
      {data.debts.length === 0 ? (
        <Panel id="debts-empty-h">
          <Note>Nothing owed here. Cards and loans show up when your banks share them.</Note>
        </Panel>
      ) : (
        <Summary key={who} {...data} />
      )}
    </>
  )
}
