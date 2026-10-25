// Debts, calm draft (#185). Same jobs as web/src/screens/DebtsPage.jsx: whose debts, what you owe
// by kind as rings with You owe in the middle, three facts (payments due this month, interest paid
// this year, overdue), then one card per debt grouped by kind with its details line and a notched
// gauge (limit used for cards, paid off for loans), and the note when a bank shares no details.
// Bklit ring chart and gauge. Made-up names and amounts.
import { useState } from 'react'
import { RingChart } from '@/components/charts/ring-chart'
import { Ring } from '@/components/charts/ring'
import { RingCenter } from '@/components/charts/ring-center'
import { Gauge } from '@/components/charts/gauge'
import * as D from '../home/data.js'
import { Panel, Note, Chips, PageHead, usd, useSize } from './ui.jsx'

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
    details: ['APR 24.99%', 'Min $35.00', { due: 'Oct 28', soon: true }],
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
    details: ['6.40%', { due: 'Nov 1', amount: 386 }, 'Paid off by Aug 2030'],
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

function DueTag({ d }) {
  const text = `${d.amount ? `${usd(d.amount)} ` : ''}due ${d.due}`
  return d.soon ? (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">{text}</span>
  ) : (
    <span>{text}</span>
  )
}

function DebtCard({ d }) {
  const pct = d.kind === 'used' ? (d.owed / d.max) * 100 : ((d.max - d.owed) / d.max) * 100
  const caption =
    d.kind === 'used'
      ? [`${Math.round(pct)}% of ${usd(d.max, 0)} limit used`, `${usd(d.max - d.owed, 0)} available`]
      : [`${Math.round(pct)}% paid off of ${usd(d.max, 0)}`, `${usd(d.owed, 0)} to go`]
  return (
    <article aria-label={`${d.name} ending ${d.mask}`} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {d.name} <span className="font-normal text-zinc-500 dark:text-zinc-400">··{d.mask}</span>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
            {d.details.map((x, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">·</span>}
                {typeof x === 'string' ? x : <DueTag d={x} />}
              </span>
            ))}
          </p>
        </div>
        <span className="shrink-0 font-[family-name:'Space_Grotesk'] text-lg font-semibold tabular-nums" style={{ color: 'var(--owe-text)' }}>
          {usd(-d.owed)}
        </span>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[13px]">
          <span className="font-semibold">{caption[0]}</span>
          <span className="text-zinc-500 dark:text-zinc-400">{caption[1]}</span>
        </div>
        <Gauge
          orientation="linear"
          inactiveFill="var(--track)"
          value={Math.round(pct)}
          totalNotches={32}
          activeFill={d.kind === 'used' ? 'var(--accent)' : 'var(--in)'}
          defaultLabel={`${caption[0]}, ${caption[1]}`}
          suffix="%"
          minWidth={160}
          linearHeight={18}
        />
      </div>
    </article>
  )
}

export default function Debts() {
  const [who, setWho] = useState('everyone')
  const trim = useSize() === 'c'
  const debts = DEBTS.filter((d) => who === 'everyone' || (who === 'yours' ? d.who === 'maya' : d.who === 'joint'))
  const groups = GROUPS.map(([key, label, color]) => ({ key, label, color, list: debts.filter((d) => d.group === key) }))
    .filter((g) => g.list.length)
    .map((g) => ({ ...g, value: g.list.reduce((s, d) => s + d.owed, 0), max: g.list.reduce((s, d) => s + Math.max(d.max, d.owed), 0) }))
  const owe = debts.reduce((s, d) => s + d.owed, 0)
  // Payments due this month: the Amex minimum on Oct 28 (the car loan is due Nov 1).
  const dueThisMonth = debts.filter((d) => d.id === 'amex').map(() => 35)
  const interest = debts.some((d) => d.id === 'loan') ? 756.4 : null

  return (
    <>
      <PageHead title="Debts" sub="Everything you owe, in one place" />
      <div className="mb-3">
        <Chips label="Whose debts" options={WHO} value={who} onChange={setWho} />
      </div>
      {debts.length === 0 ? (
        <Panel id="debts-empty-h">
          <Note>Nothing owed here. Cards and loans show up when your banks share them.</Note>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 [&>*]:min-w-0">
            <section
              aria-label="What you owe by kind"
              className="rounded-2xl border border-zinc-200 bg-white p-4 lg:col-span-7 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center gap-6">
                <RingChart
                  key={who}
                  data={groups.map((g) => ({ label: g.label, value: g.value, maxValue: g.max }))}
                  size={trim ? 160 : 200}
                  strokeWidth={trim ? 12 : 14}
                  ringGap={trim ? 5 : 6}
                  baseInnerRadius={trim ? 44 : 58}
                >
                  {groups.map((g, i) => (
                    <Ring key={g.key} index={i} color={g.color} showGlow={false} />
                  ))}
                  <RingCenter defaultLabel="You owe" prefix="$" />
                </RingChart>
                <ul className="grid grow gap-2 text-sm">
                  {groups.map((g) => (
                    <li key={g.key}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 font-semibold">
                          <i className="size-2.5 rounded-full" style={{ background: g.color }} />
                          {g.label}
                        </span>
                        <span className="font-[family-name:'Space_Grotesk'] font-semibold tabular-nums">{usd(g.value)}</span>
                      </div>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <span className="block h-full rounded-full" style={{ width: `${(g.value / owe) * 100}%`, background: g.color }} />
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
                    <span className="font-semibold">You owe</span>
                    <span className="font-[family-name:'Space_Grotesk'] font-semibold tabular-nums" style={{ color: 'var(--owe-text)' }}>
                      {usd(-owe)}
                    </span>
                  </li>
                </ul>
              </div>
            </section>
            <section
              aria-label="Payments, interest and overdue"
              className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-1 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <Note>Payments due this month</Note>
                <p className="font-[family-name:'Space_Grotesk'] text-xl font-semibold tabular-nums">
                  {dueThisMonth.length ? usd(dueThisMonth.reduce((a, b) => a + b, 0)) : '—'}
                </p>
                <Note>{dueThisMonth.length ? `${dueThisMonth.length} payment · Amex minimum, Oct 28` : 'None this month'}</Note>
              </div>
              <div>
                <Note>Interest paid this year</Note>
                <p className="font-[family-name:'Space_Grotesk'] text-xl font-semibold tabular-nums">{interest != null ? usd(interest) : '—'}</p>
                <Note>{interest != null ? 'on loans' : 'Your banks haven’t shared it'}</Note>
              </div>
              <div>
                <Note>Overdue</Note>
                <p className="font-[family-name:'Space_Grotesk'] text-xl font-semibold" style={{ color: 'var(--in-text)' }}>
                  None
                </p>
                <Note>All on time</Note>
              </div>
            </section>
          </div>

          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`debts-${g.key}`} className="mt-4">
              <h2 id={`debts-${g.key}`} className="mb-2 flex items-baseline justify-between font-[family-name:'Space_Grotesk'] text-[15px] font-semibold">
                {g.label}
                <span className="tabular-nums" style={{ color: 'var(--owe-text)' }}>
                  {usd(-g.value)}
                </span>
              </h2>
              <div className={`grid gap-3 ${g.list.length > 1 ? 'lg:grid-cols-2' : ''}`}>
                {g.list.map((d) => (
                  <DebtCard key={d.id} d={d} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  )
}
