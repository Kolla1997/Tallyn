// Accounts, calm draft (#185). Same jobs as web/src/screens/AccountsPage.jsx: whose accounts
// (Yours, each person, Everyone), net worth with have and owe, You have and You owe grouped by
// kind, and Connected banks with status and actions (Reconnect, Unlink), plus Link a bank.
// Debts' layout (Dinesh picked F): a summary strip with a waffle and four figures, then rows in
// columns instead of stretched cards; phones stack each row. Made-up names and amounts.
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
// The waffle's colours for what you have, by kind.
const HAVE_KINDS = [
  ['Everyday', 'var(--ink)'],
  ['Savings', 'var(--in)'],
  ['Other currencies', 'var(--grey-2)'],
]
const OWNER = { maya: 'You', joint: 'You and James', leo: 'Leo' }

// Banks as Plaid reports them (made up). Monzo shows the "sign in again" state.
const BANKS = [
  { name: 'Chase', initials: 'CH', accounts: 3, whose: 'You, James and Leo', status: 'ok', synced: '2 hours ago' },
  { name: 'Ally', initials: 'AL', accounts: 2, whose: 'You and James', status: 'ok', synced: '2 hours ago' },
  { name: 'American Express', initials: 'AX', accounts: 1, whose: 'You', status: 'ok', synced: '3 hours ago' },
  { name: 'Monzo', initials: 'MZ', accounts: 1, whose: 'You', status: 'needs_reauth' },
  { name: 'Wise', initials: 'WI', accounts: 1, whose: 'You', status: 'ok', synced: 'yesterday' },
]
const NUM = 'font-display font-semibold tabular-nums'
const CARD = 'rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
const MUTED = 'text-zinc-500 dark:text-zinc-400'
const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_240px_140px]'

// 100 cells, one per percent of what you have, coloured by kind, labelled beside it.
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
          <i key={i} className="size-[8px] rounded-[1.5px]" style={{ background: c }} />
        ))}
      </span>
      <ul className="grid gap-1.5 text-[13px]">
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
        <div className="lg:border-r lg:border-zinc-100 lg:pr-6 dark:lg:border-zinc-800">
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

// One account per row: name and bank, what's worth knowing (native amount, limit, terms), balance.
function AccountRows({ accounts, showOwner, owe }) {
  if (!accounts.length && !owe) return <Note className="py-3">No accounts yet.</Note>
  const kinds = [...new Set(accounts.map(KIND))]
  return kinds.map((k) => (
    <tbody key={k} className="contents">
      <tr className="contents">
        <th
          scope="rowgroup"
          className={`block border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-left text-[12px] font-semibold dark:border-zinc-800 dark:bg-zinc-800/40 ${MUTED}`}
        >
          {k}
        </th>
      </tr>
      {accounts
        .filter((a) => KIND(a) === k)
        .map((a) => {
          const I = ICON[a.name]
          const used = KIND(a) === 'Credit cards' ? Math.round((-a.bal / 5000) * 100) : null
          return (
            <tr key={a.name} className={`${ROW} border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-800`}>
              <th scope="row" className="flex min-w-0 items-center gap-3 text-left font-normal">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <I className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className={`block truncate text-[13px] ${MUTED}`}>
                    {a.bank} ··{a.last4}
                    {showOwner && `, ${OWNER[a.who]}`}
                  </span>
                </span>
              </th>
              <td className={`order-last col-span-2 text-[13px] sm:order-none sm:col-span-1 ${MUTED}`}>
                {used != null ? (
                  <>
                    <span className="block h-2 overflow-hidden rounded-full" style={{ background: 'var(--track)' }} aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ width: `${used}%`, background: 'var(--accent)' }} />
                    </span>
                    <span className="mt-1 block">
                      <b className="font-semibold text-zinc-700 dark:text-zinc-200">{used}% of $5,000 limit</b>, {usd(5000 + a.bal, 0)} available, {a.note}
                    </span>
                  </>
                ) : a.cur !== 'USD' ? (
                  <>
                    {D.native(a)} in {a.cur}
                  </>
                ) : (
                  a.note
                )}
              </td>
              <td className={`${NUM} text-right text-sm`} style={a.usd < 0 ? { color: 'var(--owe-text)' } : undefined}>
                {usd(a.usd)}
              </td>
            </tr>
          )
        })}
    </tbody>
  ))
}

function AccountTable({ title, total, accounts, owe, showOwner }) {
  return (
    <section aria-labelledby={`${title}-h`} className={`${CARD} overflow-hidden`}>
      <div className="flex items-baseline justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <h2 id={`${title}-h`} className="font-display text-[15px] font-semibold">
          {title}
        </h2>
        <span className={`${NUM} text-sm`} style={owe ? { color: 'var(--owe-text)' } : undefined}>
          {usd(owe ? -total : total)}
        </span>
      </div>
      {accounts.length === 0 ? (
        <Note className="px-4 py-3">{owe ? 'Nothing owed. Cards and loans show here when they have a balance.' : 'No accounts yet.'}</Note>
      ) : (
        <table className="block w-full">
          <AccountRows accounts={accounts} showOwner={showOwner} owe={owe} />
        </table>
      )}
    </section>
  )
}

function Banks() {
  return (
    <section aria-labelledby="banks-h" className={`${CARD} overflow-hidden`}>
      <div className="flex items-baseline justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <h2 id="banks-h" className="font-display text-[15px] font-semibold">
          Connected banks
        </h2>
        <span className="text-[13px]">
          <span className={MUTED}>{BANKS.length} banks, </span>
          <b className="font-semibold text-[var(--owe-text)]">{BANKS.filter((b) => b.status !== 'ok').length} needs you</b>
        </span>
      </div>
      <ul>
        {BANKS.map((b) => {
          const ok = b.status === 'ok'
          return (
            <li
              key={b.name}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-zinc-100 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_240px_auto] dark:border-zinc-800"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Badge text={b.initials} tone={ok ? 'var(--grey-5)' : 'var(--accent)'} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{b.name}</span>
                  <span className={`block truncate text-[13px] ${MUTED}`}>
                    {b.accounts} {b.accounts === 1 ? 'account' : 'accounts'}, {b.whose}
                  </span>
                </span>
              </div>
              <p className="order-last col-span-2 text-[13px] sm:order-none sm:col-span-1">
                {ok ? (
                  <span className={MUTED}>Up to date, {b.synced}</span>
                ) : (
                  <>
                    <b className="font-semibold text-[var(--owe-text)]">Needs you to sign in again</b>
                    <span className={`block ${MUTED}`}>Its balances aren’t updating.</span>
                  </>
                )}
              </p>
              <div className="flex justify-end gap-1.5">
                {!ok && <Button small>Reconnect</Button>}
                <Button small danger>
                  Unlink
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <Note className="border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800">Tallyn reads balances and transactions. It can’t move money.</Note>
    </section>
  )
}

export default function Accounts() {
  const [who, setWho] = useState('yours')
  const accounts = D.accounts.filter((a) => (who === 'everyone' ? true : who === 'yours' ? a.who === 'maya' : a.who === who))
  const haveList = accounts.filter((a) => a.usd > 0).sort((a, b) => b.usd - a.usd)
  const oweList = accounts.filter((a) => a.usd < 0).sort((a, b) => a.usd - b.usd)
  const have = haveList.reduce((s, a) => s + a.usd, 0)
  const owe = -oweList.reduce((s, a) => s + a.usd, 0)
  const parts = HAVE_KINDS.map(([label, color]) => ({ label, color, value: haveList.filter((a) => KIND(a) === label).reduce((s, a) => s + a.usd, 0) })).filter(
    (p) => p.value > 0,
  )
  return (
    <>
      <PageHead title="Accounts" sub="Your banks and the ones shared with you">
        <Button icon={Link2}>Link a bank</Button>
      </PageHead>
      <div className="mb-3">
        <Chips label="Whose accounts" options={WHO} value={who} onChange={setWho} />
      </div>
      <div className="grid gap-3">
        <Summary key={who} have={have} owe={owe} parts={parts} counts={[haveList.length, oweList.length]} />
        <AccountTable title="You have" total={have} accounts={haveList} showOwner={who === 'everyone'} />
        <AccountTable title="You owe" total={owe} accounts={oweList} owe showOwner={who === 'everyone'} />
        <Banks />
      </div>
    </>
  )
}
