// Accounts, calm draft (#185). Same jobs as web/src/screens/AccountsPage.jsx: whose accounts
// (Yours, each person, Everyone), net worth with have and owe, You have and You owe grouped by
// kind, and Connected banks with status and actions (Reconnect, Unlink), plus Link a bank.
// Four layouts to compare (draft only, ?l=a|b|c|d), all under the same summary strip:
// A Ledger (one table, have then owe), B By bank (each bank heads its own accounts, so banks are
// listed once), C Tiles (small account cards in a grid), D Mix (B's banks, A's columns).
// Made-up names and amounts.
import { useState } from 'react'
import { Link2, Wallet, PiggyBank, Globe, Users, CreditCard, Car } from 'lucide-react'
import * as D from '../home/data.js'
import { Note, Chips, Button, PageHead, Badge, usd } from './ui.jsx'

const WHO = [
  ['yours', 'Yours'],
  ['joint', 'James'],
  ['leo', 'Leo'],
  ['everyone', 'Everyone'],
]
const LAYOUTS = [
  ['a', 'A · Ledger'],
  ['b', 'B · By bank'],
  ['c', 'C · Tiles'],
  ['d', 'D · Mix'],
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
function Waffle({ parts, total }) {
  const cells = []
  parts.forEach((p, i) => {
    const n = i === parts.length - 1 ? 100 - cells.length : Math.round((p.value / total) * 100)
    for (let k = 0; k < n; k++) cells.push(p.color)
  })
  return (
    <div className="flex items-center gap-4">
      <span className="grid shrink-0 grid-cols-10 gap-[2px]" aria-hidden="true">
        {cells.map((c, i) => (
          <i key={i} className="size-[7px] rounded-[1.5px]" style={{ background: c }} />
        ))}
      </span>
      <ul className="grid gap-1 text-[13px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <i className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
            <span>{p.label}</span>
            <b className={`${NUM} ml-auto pl-4`}>{usd(p.value)}</b>
            <span className={`w-9 text-right tabular-nums ${MUTED}`}>{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Summary({ have, owe, parts, counts }) {
  const figures = [
    ['Net worth', usd(have - owe), 'In US dollars'],
    ['You have', usd(have), `${counts[0]} ${counts[0] === 1 ? 'account' : 'accounts'}`, 'var(--in-text)'],
    ['You owe', usd(-owe), `${counts[1]} ${counts[1] === 1 ? 'card or loan' : 'cards and loans'}`, 'var(--owe-text)'],
  ]
  return (
    <section aria-label="What you have and owe" className={`${CARD} grid gap-5 p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center`}>
      {have > 0 && (
        <div className={`lg:border-r lg:pr-6 ${LINE}`}>
          <Waffle parts={parts} total={have} />
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
const Head = ({ children, right }) => (
  <div className={`flex items-baseline justify-between border-b px-4 py-2.5 ${LINE}`}>
    <h2 className="font-display text-[15px] font-semibold">{children}</h2>
    {right}
  </div>
)
const MoveNote = () => <Note className={`border-t px-4 py-2.5 ${LINE}`}>Tallyn reads balances and transactions. It can’t move money.</Note>

// An account as a row: name and where it lives, the detail, the balance. `bank` adds a bank column.
function AccountRow({ a, bank, showOwner }) {
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1.5 border-b px-4 py-2.5 last:border-b-0 ${LINE} ${
        bank ? 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_120px]' : 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_120px]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <AccountIcon a={a} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{a.name}</span>
          <span className={`block truncate text-[12px] ${MUTED}`}>
            ··{a.last4}
            {showOwner && `, ${OWNER[a.who]}`}
          </span>
        </span>
      </span>
      {bank && <span className={`hidden truncate text-[13px] sm:block ${MUTED}`}>{bank}</span>}
      <span className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
        <Detail a={a} />
      </span>
      <Balance a={a} className="text-right" />
    </li>
  )
}

// ── A · Ledger: one table, You have then You owe, banks listed below as rows.
function Ledger({ haveList, oweList, have, owe, showOwner, visibleBanks }) {
  const group = (list) =>
    [...new Set(list.map(KIND))].map((k) => (
      <div key={k}>
        <p className={`border-b bg-zinc-50 px-4 py-1.5 text-[12px] font-semibold dark:bg-zinc-800/40 ${LINE} ${MUTED}`}>{k}</p>
        <ul>
          {list
            .filter((a) => KIND(a) === k)
            .map((a) => (
              <AccountRow key={a.name} a={a} bank={BANKS.find((b) => b.key === a.bank).name} showOwner={showOwner} />
            ))}
        </ul>
      </div>
    ))
  return (
    <>
      <section aria-label="Your accounts" className={`${CARD} overflow-hidden`}>
        <Head right={<span className={`${NUM} text-sm`}>{usd(have)}</span>}>You have</Head>
        {haveList.length ? group(haveList) : <Note className="px-4 py-2.5">No accounts yet.</Note>}
        <div className={`border-t ${LINE}`} />
        <Head right={<span className={`${NUM} text-sm text-[var(--owe-text)]`}>{usd(-owe)}</span>}>You owe</Head>
        {oweList.length ? group(oweList) : <Note className="px-4 py-2.5">Nothing owed. Cards and loans show here when they have a balance.</Note>}
      </section>
      <section aria-label="Connected banks" className={`${CARD} overflow-hidden`}>
        <Head right={<span className={`text-[13px] ${MUTED}`}>{visibleBanks.length} banks</span>}>Connected banks</Head>
        <ul>
          {visibleBanks.map(({ b, list }) => (
            <li key={b.key} className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 last:border-b-0 ${LINE}`}>
              <Badge text={b.initials} tone={b.status === 'ok' ? 'var(--grey-5)' : 'var(--accent)'} />
              <span className="min-w-0 grow">
                <span className="block text-sm font-semibold">{b.name}</span>
                <span className={`block text-[12px] ${MUTED}`}>
                  {list.length} {list.length === 1 ? 'account' : 'accounts'} in this view
                </span>
              </span>
              <Status b={b} />
              <BankActions b={b} />
            </li>
          ))}
        </ul>
        <MoveNote />
      </section>
    </>
  )
}

// ── B · By bank: each bank heads its accounts; its status and actions sit in its header.
function ByBank({ visibleBanks, showOwner }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {visibleBanks.map(({ b, list }) => (
        <section key={b.key} aria-label={b.name} className={`${CARD} overflow-hidden ${b.status !== 'ok' ? 'ring-1 ring-[var(--accent)]' : ''}`}>
          <div className={`flex items-center gap-3 border-b px-4 py-2.5 ${LINE}`}>
            <Badge text={b.initials} tone={b.status === 'ok' ? 'var(--grey-5)' : 'var(--accent)'} />
            <span className="min-w-0 grow">
              <span className="block text-sm font-semibold">{b.name}</span>
              <Status b={b} />
            </span>
            <BankActions b={b} />
          </div>
          <ul>
            {list.map((a) => (
              <li key={a.name} className={`flex items-center gap-2.5 border-b px-4 py-2.5 last:border-b-0 ${LINE}`}>
                <AccountIcon a={a} />
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className={`block truncate text-[12px] ${MUTED}`}>
                    {KIND(a)}, ··{a.last4}
                    {showOwner && `, ${OWNER[a.who]}`}
                  </span>
                </span>
                <span className="text-right">
                  <Balance a={a} className="block" />
                  {a.cur !== 'USD' && <span className={`block text-[12px] ${MUTED}`}>{D.native(a)}</span>}
                </span>
              </li>
            ))}
          </ul>
          {b.status !== 'ok' && <Note className={`border-t px-4 py-2 ${LINE}`}>This bank asked you to sign in again, so its balances aren’t updating.</Note>}
        </section>
      ))}
      <Note className="md:col-span-2">Tallyn reads balances and transactions. It can’t move money.</Note>
    </div>
  )
}

// ── C · Tiles: each account as a small card, have then owe; banks as one slim row of chips.
function Tiles({ haveList, oweList, showOwner, visibleBanks }) {
  const tiles = (list) => (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {list.map((a) => (
        <li key={a.name} className={`${CARD} grid content-between gap-2 p-3`}>
          <span className="flex items-center gap-2">
            <AccountIcon a={a} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{a.name}</span>
              <span className={`block truncate text-[12px] ${MUTED}`}>
                {a.bank} ··{a.last4}
                {showOwner && `, ${OWNER[a.who]}`}
              </span>
            </span>
          </span>
          <Balance a={a} className="text-lg" />
          <Detail a={a} />
        </li>
      ))}
    </ul>
  )
  return (
    <>
      {haveList.length > 0 && (
        <section aria-label="You have">
          <h2 className={`mb-2 text-[13px] font-semibold ${MUTED}`}>You have</h2>
          {tiles(haveList)}
        </section>
      )}
      {oweList.length > 0 && (
        <section aria-label="You owe">
          <h2 className={`mb-2 text-[13px] font-semibold ${MUTED}`}>You owe</h2>
          {tiles(oweList)}
        </section>
      )}
      <section aria-label="Connected banks" className={`${CARD} p-3`}>
        <ul className="flex flex-wrap gap-2">
          {visibleBanks.map(({ b }) => (
            <li
              key={b.key}
              className={`flex items-center gap-2 rounded-full border py-1 pr-1 pl-1 ${b.status === 'ok' ? 'border-zinc-200 dark:border-zinc-700' : 'border-[var(--accent)]'}`}
            >
              <Badge text={b.initials} tone={b.status === 'ok' ? 'var(--grey-5)' : 'var(--accent)'} />
              <span className="text-[13px] font-semibold">{b.name}</span>
              {b.status !== 'ok' ? <Button small>Reconnect</Button> : <span className={`pr-2 text-[12px] ${MUTED}`}>{b.synced}</span>}
            </li>
          ))}
        </ul>
        <Note className="mt-2">Tallyn reads balances and transactions. It can’t move money. Unlink a bank from its menu.</Note>
      </section>
    </>
  )
}

// ── D · Mix: B's banks (each bank once, heading its accounts, status and actions in the header)
// laid out as A's single table with its columns, so it scans top to bottom.
function Mix({ visibleBanks, showOwner }) {
  return (
    <section aria-label="Your accounts by bank" className={`${CARD} overflow-hidden`}>
      <div className={`hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_120px] gap-x-5 border-b px-4 py-2 text-[12px] font-semibold sm:grid ${LINE} ${MUTED}`}>
        <span>Account</span>
        <span>Detail</span>
        <span className="text-right">Balance</span>
      </div>
      {visibleBanks.map(({ b, list }) => (
        <div key={b.key}>
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-zinc-50 px-4 py-2 dark:bg-zinc-800/40 ${LINE}`}>
            <Badge text={b.initials} tone={b.status === 'ok' ? 'var(--grey-5)' : 'var(--accent)'} />
            <span className="text-[13px] font-semibold">{b.name}</span>
            <Status b={b} />
            <span className="ml-auto">
              <BankActions b={b} />
            </span>
          </div>
          <ul>
            {list.map((a) => (
              <AccountRow key={a.name} a={a} showOwner={showOwner} />
            ))}
          </ul>
        </div>
      ))}
      <MoveNote />
    </section>
  )
}

const VIEWS = { a: Ledger, b: ByBank, c: Tiles, d: Mix }

export default function Accounts() {
  const [who, setWho] = useState('yours')
  const [layout, setLayout] = useState(() => {
    const l = new URLSearchParams(location.search).get('l')
    return VIEWS[l] ? l : 'd'
  })
  const pick = (l) => {
    setLayout(l)
    const u = new URL(location.href)
    u.searchParams.set('l', l)
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
  const View = VIEWS[layout]
  return (
    <>
      <PageHead title="Accounts" sub="Your banks and the ones shared with you">
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
        <Button icon={Link2}>Link a bank</Button>
      </PageHead>
      <div className="mb-3">
        <Chips label="Whose accounts" options={WHO} value={who} onChange={setWho} />
      </div>
      <div className="grid gap-3">
        <Summary key={who} have={have} owe={owe} parts={parts} counts={[haveList.length, oweList.length]} />
        <View key={`${layout}-${who}`} haveList={haveList} oweList={oweList} have={have} owe={owe} showOwner={who === 'everyone'} visibleBanks={visibleBanks} />
      </div>
    </>
  )
}
