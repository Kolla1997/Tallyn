// Accounts, calm draft (#185). Same jobs as web/src/screens/AccountsPage.jsx: whose accounts
// (Yours, each person, Everyone), net worth with have and owe, You have and You owe grouped by
// kind, and Connected banks with status and actions (Reconnect, Unlink), plus Link a bank.
// Layout (Dinesh picked F, the bank bento): a summary strip, then one card per bank holding its
// accounts as tiles, each card as wide as its number of accounts, rows filled.
// Made-up names and amounts.
import { useState } from 'react'
import { Link2, Wallet, PiggyBank, Globe, Users, CreditCard, Car } from 'lucide-react'
import { RingChart } from '@/components/charts/ring-chart'
import { Ring } from '@/components/charts/ring'
import { Gauge } from '@/components/charts/gauge'
import SpendingRing from '@/components/kokonutui/spending-ring'
import * as D from '../home/data.js'
import { Note, Chips, Button, PageHead, Badge, usd } from './ui.jsx'

const WHO = [
  ['yours', 'Yours'],
  ['joint', 'James'],
  ['leo', 'Leo'],
  ['everyone', 'Everyone'],
]
const ICON = {
  'Everyday checking': Wallet,
  'High-yield savings': PiggyBank,
  'UK current account': Globe,
  'Euro account': Globe,
  'Joint checking': Users,
  'Teen savings': PiggyBank,
  'Credit card': CreditCard,
  'Car loan': Car,
}
const KIND = (a) =>
  a.bal < 0 ? (a.kind === 'loan' ? 'Loans' : 'Credit cards') : a.cur !== 'USD' ? 'Other currencies' : /savings/i.test(a.name) ? 'Savings' : 'Everyday'
const HAVE_KINDS = [
  ['Everyday', 'var(--ink)'],
  ['Savings', 'var(--in)'],
  ['Other currencies', 'var(--grey-2)'],
]
const OWNER = { maya: 'You', joint: 'You and James', leo: 'Leo' }

// Banks as Plaid reports them (made up). Monzo shows the "sign in again" state.
const BANKS = [
  { key: 'Chase', name: 'Chase', initials: 'CH', status: 'ok', synced: '2 hours ago' },
  { key: 'Ally', name: 'Ally', initials: 'AL', status: 'ok', synced: '2 hours ago' },
  { key: 'Amex', name: 'American Express', initials: 'AX', status: 'ok', synced: '3 hours ago' },
  { key: 'Monzo', name: 'Monzo', initials: 'MZ', status: 'needs_reauth' },
  { key: 'Wise', name: 'Wise', initials: 'WI', status: 'ok', synced: 'yesterday' },
]
const NUM = 'font-display font-semibold tabular-nums'
const CARD = 'rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
const MUTED = 'text-zinc-500 dark:text-zinc-400'
const LINE = 'border-zinc-100 dark:border-zinc-800'

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────
// What you have, by kind: four ways to draw it in place of the waffle (draft: ?s=).
// Bklit rings and gauges, and Kokonut's ring with its own card frame taken off. Each keeps the
// amount and share written beside its marks.
const SPLITS = [
  ['rings', 'Rings'],
  ['notches', 'Notches'],
  ['donut', 'Donut'],
  ['mix', 'Mix'],
]
const DONUT_CLASS = {
  Everyday: { stroke: 'stroke-[var(--ink)]', dot: 'bg-[var(--ink)]' },
  Savings: { stroke: 'stroke-[var(--in)]', dot: 'bg-[var(--in)]' },
  'Other currencies': { stroke: 'stroke-[var(--grey-2)]', dot: 'bg-[var(--grey-2)]' },
}
const pct = (p, total) => Math.round((p.value / total) * 100)
const Legend = ({ parts, total }) => (
  <ul className="grid gap-1 text-[13px]">
    {parts.map((p) => (
      <li key={p.label} className="flex items-center gap-2">
        <i className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
        <span>{p.label}</span>
        <b className={`${NUM} ml-auto pl-4`}>{usd(p.value)}</b>
        <span className={`w-9 text-right tabular-nums ${MUTED}`}>{pct(p, total)}%</span>
      </li>
    ))}
  </ul>
)
function Rings({ parts, total, size = 120 }) {
  return (
    <RingChart
      data={parts.map((p) => ({ label: p.label, value: p.value, maxValue: total }))}
      size={size}
      strokeWidth={size > 100 ? 9 : 7}
      ringGap={3}
      baseInnerRadius={size > 100 ? 30 : 22}
    >
      {parts.map((p, i) => (
        <Ring key={p.label} index={i} color={p.color} showGlow={false} />
      ))}
    </RingChart>
  )
}
const NotchRows = ({ parts, total, notches = 20 }) => (
  <ul className="grid w-full min-w-0 gap-2 text-[13px] sm:w-auto sm:min-w-[260px]">
    {parts.map((p) => (
      <li key={p.label}>
        <span className="mb-1 flex items-baseline gap-2">
          <span className="font-semibold">{p.label}</span>
          <b className={`${NUM} ml-auto`}>{usd(p.value)}</b>
          <span className={`w-9 text-right tabular-nums ${MUTED}`}>{pct(p, total)}%</span>
        </span>
        <Gauge
          orientation="linear"
          inactiveFill="var(--track)"
          value={pct(p, total)}
          totalNotches={notches}
          activeFill={p.color}
          defaultLabel={p.label}
          suffix="%"
          minWidth={160}
          linearHeight={8}
        />
      </li>
    ))}
  </ul>
)
function Split({ kind, parts, total }) {
  if (kind === 'notches') return <NotchRows parts={parts} total={total} />
  if (kind === 'donut')
    return (
      <SpendingRing
        title="What you have"
        currency="USD"
        className="max-w-[300px] rounded-none border-0 bg-transparent p-0 dark:bg-transparent"
        categories={parts.map((p) => ({ name: p.label, amount: p.value, change: undefined, ...DONUT_CLASS[p.label] }))}
      />
    )
  if (kind === 'mix')
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Rings parts={parts} total={total} size={84} />
        <NotchRows parts={parts} total={total} notches={16} />
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Rings parts={parts} total={total} />
      <Legend parts={parts} total={total} />
    </div>
  )
}

function Summary({ have, owe, parts, counts, split }) {
  const figures = [
    ['Net worth', usd(have - owe), 'In US dollars'],
    ['You have', usd(have), `${counts[0]} ${counts[0] === 1 ? 'account' : 'accounts'}`, 'var(--in-text)'],
    ['You owe', usd(-owe), `${counts[1]} ${counts[1] === 1 ? 'card or loan' : 'cards and loans'}`, 'var(--owe-text)'],
  ]
  return (
    <section aria-label="What you have and owe" className={`${CARD} grid gap-5 p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center`}>
      {have > 0 && (
        <div className={`lg:border-r lg:pr-6 ${LINE}`}>
          <Split kind={split} parts={parts} total={have} />
        </div>
      )}
      <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-3 sm:divide-x sm:divide-zinc-100 dark:sm:divide-zinc-800">
        {figures.map(([k, v, note, tone], i) => (
          <div key={k} className={i ? 'sm:px-4' : 'sm:pr-4'}>
            <dt className={`text-[13px] whitespace-nowrap ${MUTED}`}>{k}</dt>
            <dd className={`${NUM} text-xl whitespace-nowrap`} style={tone ? { color: tone } : undefined}>
              {v}
            </dd>
            <dd className={`text-[12px] ${MUTED}`}>{note}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const AccountIcon = ({ a }) => {
  const I = ICON[a.name]
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      <I className="size-3.5" aria-hidden="true" />
    </span>
  )
}
// The one thing worth knowing beyond the balance: the limit, the foreign amount, the terms.
function Detail({ a }) {
  if (KIND(a) === 'Credit cards') {
    const used = Math.round((-a.bal / 5000) * 100)
    return (
      <span className="block min-w-0">
        <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--track)' }} aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${used}%`, background: 'var(--accent)' }} />
        </span>
        <span className={`mt-1 block text-[12px] ${MUTED}`}>
          {used}% of $5,000 limit, {a.note}
        </span>
      </span>
    )
  }
  if (a.cur !== 'USD')
    return (
      <span className={`text-[12px] ${MUTED}`}>
        {D.native(a)} in {a.cur}
      </span>
    )
  return a.note ? <span className={`text-[12px] ${MUTED}`}>{a.note}</span> : null
}
const Balance = ({ a, className = '' }) => (
  <span className={`${NUM} text-sm whitespace-nowrap ${className}`} style={a.usd < 0 ? { color: 'var(--owe-text)' } : undefined}>
    {usd(a.usd)}
  </span>
)
const Status = ({ b }) =>
  b.status === 'ok' ? (
    <span className={`text-[12px] ${MUTED}`}>Up to date, {b.synced}</span>
  ) : (
    <span className="text-[12px] font-semibold text-[var(--owe-text)]">Needs you to sign in again</span>
  )
const BankActions = ({ b }) => (
  <span className="flex shrink-0 gap-1.5">
    {b.status !== 'ok' && <Button small>Reconnect</Button>}
    <Button small danger>
      Unlink
    </Button>
  </span>
)

// One account as a small tile, inside its bank's card.
function Tile({ a, showOwner, bankLine }) {
  return (
    <div className="grid gap-2">
      <span className="flex min-w-0 items-center gap-2">
        <AccountIcon a={a} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{a.name}</span>
          <span className={`block truncate text-[12px] ${MUTED}`}>
            {bankLine ?? KIND(a)} ··{a.last4}
            {showOwner && `, ${OWNER[a.who]}`}
          </span>
        </span>
      </span>
      <Balance a={a} className="text-lg" />
      <Detail a={a} />
    </div>
  )
}

// The bank bento: one card per bank holding its accounts as tiles. A card grows with
// its number of accounts, and cards wrap and stretch so every row is filled.
function Bento({ visibleBanks, showOwner }) {
  return (
    <>
      <ul className="flex flex-wrap gap-3">
        {visibleBanks.map(({ b, list }) => {
          const ok = b.status === 'ok'
          return (
            <li
              key={b.key}
              aria-label={b.name}
              className={`${CARD} flex min-w-[280px] flex-col overflow-hidden ${ok ? '' : 'ring-1 ring-[var(--accent)]'}`}
              style={{ flex: `${list.length} 1 ${list.length * 320}px` }}
            >
              <div className={`flex items-center gap-2.5 border-b px-3 py-2 ${LINE}`}>
                <Badge text={b.initials} tone={ok ? 'var(--grey-5)' : 'var(--accent)'} />
                <span className="min-w-0 grow truncate text-[13px] font-semibold">{b.name}</span>
              </div>
              <div className={`grid grow divide-x ${LINE}`} style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
                {list.map((a) => (
                  <div key={a.name} className={`p-3 ${LINE}`}>
                    <Tile a={a} showOwner={showOwner} />
                  </div>
                ))}
              </div>
              <div className={`mt-auto flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 ${LINE}`}>
                <Status b={b} />
                <BankActions b={b} />
              </div>
            </li>
          )
        })}
      </ul>
      <Note>Tallyn reads balances and transactions. It can’t move money.</Note>
    </>
  )
}

export default function Accounts() {
  const [who, setWho] = useState('yours')
  const [split, setSplit] = useState(() => {
    const v = new URLSearchParams(location.search).get('s')
    return SPLITS.some(([k]) => k === v) ? v : 'mix'
  })
  const pickSplit = (v) => {
    setSplit(v)
    const u = new URL(location.href)
    u.searchParams.set('s', v)
    history.replaceState(null, '', u)
  }
  const accounts = D.accounts.filter((a) => (who === 'everyone' ? true : who === 'yours' ? a.who === 'maya' : a.who === who))
  const haveList = accounts.filter((a) => a.usd > 0).sort((a, b) => b.usd - a.usd)
  const oweList = accounts.filter((a) => a.usd < 0).sort((a, b) => a.usd - b.usd)
  const have = haveList.reduce((s, a) => s + a.usd, 0)
  const owe = -oweList.reduce((s, a) => s + a.usd, 0)
  const parts = HAVE_KINDS.map(([label, color]) => ({ label, color, value: haveList.filter((a) => KIND(a) === label).reduce((s, a) => s + a.usd, 0) })).filter(
    (p) => p.value > 0,
  )
  // Banks with an account in this view, each with its accounts (have first, then owe).
  const visibleBanks = BANKS.map((b) => ({ b, list: [...haveList, ...oweList].filter((a) => a.bank === b.key) })).filter((x) => x.list.length)
  return (
    <>
      <PageHead title="Accounts" sub="Your banks and the ones shared with you">
        <Button icon={Link2}>Link a bank</Button>
      </PageHead>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Chips label="Whose accounts" options={WHO} value={who} onChange={setWho} />
        <span
          role="group"
          aria-label="Draft: what you have"
          className="flex gap-1 rounded-full border border-dashed border-zinc-300 p-0.5 text-[12px] dark:border-zinc-700"
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
      </div>
      <div className="grid gap-3">
        <Summary key={who} have={have} owe={owe} parts={parts} counts={[haveList.length, oweList.length]} split={split} />
        <Bento key={who} showOwner={who === 'everyone'} visibleBanks={visibleBanks} />
      </div>
    </>
  )
}
