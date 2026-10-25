// Accounts, calm draft (#185). Same jobs as web/src/screens/AccountsPage.jsx: whose accounts
// (Yours, each person, Everyone), net worth with have and owe, You have and You owe grouped by
// kind, and Connected banks with status and actions (Reconnect, Add APR and due dates, Unlink),
// plus Link a bank. Made-up names and amounts.
import { useState } from 'react'
import { Link2, Wallet, PiggyBank, Globe, Users, CreditCard, Car } from 'lucide-react'
import { Gauge } from '@/components/charts/gauge'
import * as D from '../home/data.js'
import { Panel, Rows, Row, Sub, Note, Money, Owed, Chips, Button, PageHead, Badge, usd } from './ui.jsx'

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
const OWNER = { maya: 'You', joint: 'You and James', leo: 'Leo' }

// Banks as Plaid reports them (made up). Monzo shows the "sign in again" state; Amex has no APR yet.
const BANKS = [
  { name: 'Chase', initials: 'CH', accounts: 3, whose: 'yours, James and Leo', status: 'ok', synced: '2 hours ago', canUnlink: true },
  { name: 'Ally', initials: 'AL', accounts: 2, whose: 'yours and James', status: 'ok', synced: '2 hours ago', canUnlink: true },
  { name: 'American Express', initials: 'AX', accounts: 1, whose: 'yours', status: 'ok', synced: '3 hours ago', canUnlink: true, cardsWithoutDetails: 1 },
  { name: 'Monzo', initials: 'MZ', accounts: 1, whose: 'yours', status: 'needs_reauth', canUnlink: true },
  { name: 'Wise', initials: 'WI', accounts: 1, whose: 'yours', status: 'ok', synced: 'yesterday', canUnlink: true },
]

function NetWorth({ have, owe }) {
  const net = have - owe
  const pct = have + owe > 0 ? Math.round((have / (have + owe)) * 100) : 0
  return (
    <section aria-label="Net worth" className="rounded-2xl bg-zinc-950 p-5 text-white dark:bg-black dark:ring-1 dark:ring-zinc-800">
      <p className="text-[13px] text-zinc-400">Net worth · in US dollars</p>
      <p className="mt-1 font-[family-name:'Space_Grotesk'] text-4xl font-bold tabular-nums">{usd(net)}</p>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <span className="h-full" style={{ width: `${pct}%`, background: 'var(--in)' }} />
        <span className="h-full" style={{ width: `${100 - pct}%`, background: 'var(--accent)' }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-5 text-[13px] text-zinc-400">
        <span>
          <i className="mr-1.5 inline-block size-2 rounded-full" style={{ background: 'var(--in)' }} />
          Have <span className="text-white">{usd(have)}</span>
        </span>
        <span>
          <i className="mr-1.5 inline-block size-2 rounded-full" style={{ background: 'var(--accent)' }} />
          Owe <span className="text-white">{usd(owe)}</span>
        </span>
      </p>
    </section>
  )
}

function Column({ id, title, total, accounts, owed, showOwner }) {
  const groups = [...new Set(accounts.map(KIND))]
  return (
    <Panel
      id={id}
      title={title}
      meta={owed ? <Owed v={total} className="text-sm" /> : <Money v={total} className="text-sm text-zinc-900 dark:text-white" />}
      className="h-full"
    >
      {accounts.length === 0 ? (
        <Note>{owed ? 'Nothing owed. Cards and loans show here when they have a balance.' : 'No accounts yet.'}</Note>
      ) : (
        groups.map((g) => (
          <div key={g}>
            <Sub>{g}</Sub>
            <Rows>
              {accounts
                .filter((a) => KIND(a) === g)
                .map((a) => (
                  <Row
                    key={a.name}
                    icon={ICON[a.name]}
                    name={a.name}
                    sub={[`${a.bank} ··${a.last4}`, a.cur !== 'USD' && D.native(a), a.note, showOwner && OWNER[a.who]].filter(Boolean).join(' · ')}
                  >
                    {owed ? <Owed v={a.usd} className="text-sm" /> : <Money v={a.usd} className="text-sm" />}
                  </Row>
                ))}
            </Rows>
            {g === 'Credit cards' &&
              accounts
                .filter((a) => KIND(a) === g)
                .map((a) => (
                  <div key={a.name + 'limit'} className="mt-1">
                    <Gauge
                      orientation="linear"
                      value={Math.round((-a.bal / 5000) * 100)}
                      totalNotches={28}
                      activeFill="var(--accent)"
                      defaultLabel="Limit used"
                      suffix="%"
                      minWidth={160}
                      linearHeight={14}
                    />
                    <Note className="mt-1">{usd(5000 + a.bal, 0)} available of $5,000</Note>
                  </div>
                ))}
          </div>
        ))
      )}
    </Panel>
  )
}

function Banks() {
  return (
    <Panel id="banks-h" title="Connected banks" meta={`${BANKS.length} banks`}>
      <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
        {BANKS.map((b) => (
          <li key={b.name} className="border-t border-zinc-100 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <Badge text={b.initials} tone={b.status === 'ok' ? '#3f3f46' : 'var(--accent)'} />
              <span className="min-w-0 grow">
                <span className="block truncate text-sm font-semibold">{b.name}</span>
                <span className={`block text-[13px] ${b.status === 'ok' ? 'text-zinc-500 dark:text-zinc-400' : 'font-semibold text-[var(--owe-text)]'}`}>
                  {b.status === 'ok' ? `Up to date · ${b.synced}` : 'Needs you to sign in again'}
                </span>
                <span className="block text-[13px] text-zinc-500 dark:text-zinc-400">
                  {b.accounts} {b.accounts === 1 ? 'account' : 'accounts'} · {b.whose}
                </span>
              </span>
            </div>
            {b.status === 'needs_reauth' && <Note className="mt-1.5 ml-11">This bank asked you to sign in again, so its balances aren’t updating.</Note>}
            {b.cardsWithoutDetails > 0 && <Note className="mt-1.5 ml-11">1 credit card doesn’t have APR or due dates yet.</Note>}
            {b.canUnlink && (
              <div className="mt-2 ml-11 flex flex-wrap gap-1.5">
                {b.status === 'needs_reauth' && <Button small>Reconnect</Button>}
                {b.cardsWithoutDetails > 0 && (
                  <Button small quiet>
                    Add APR and due dates
                  </Button>
                )}
                <Button small danger>
                  Unlink
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Note className="mt-2">Tallyn reads balances and transactions. It can’t move money.</Note>
    </Panel>
  )
}

export default function Accounts() {
  const [who, setWho] = useState('yours')
  const accounts = D.accounts.filter((a) => (who === 'everyone' ? true : who === 'yours' ? a.who === 'maya' : a.who === who))
  const haveList = accounts.filter((a) => a.usd > 0).sort((a, b) => b.usd - a.usd)
  const oweList = accounts.filter((a) => a.usd < 0).sort((a, b) => a.usd - b.usd)
  const have = haveList.reduce((s, a) => s + a.usd, 0)
  const owe = -oweList.reduce((s, a) => s + a.usd, 0)
  return (
    <>
      <PageHead title="Accounts" sub="Your banks and the ones shared with you">
        <Button icon={Link2}>Link a bank</Button>
      </PageHead>
      <div className="mb-3">
        <Chips label="Whose accounts" options={WHO} value={who} onChange={setWho} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="lg:col-span-12">
          <NetWorth have={have} owe={owe} />
        </div>
        <div className="lg:col-span-6">
          <Column id="have-h" title="You have" total={have} accounts={haveList} showOwner={who === 'everyone'} />
        </div>
        <div className="lg:col-span-6">
          <Column id="owe-h" title="You owe" total={owe} accounts={oweList} owed showOwner={who === 'everyone'} />
        </div>
        <div className="lg:col-span-12">
          <Banks />
        </div>
      </div>
    </>
  )
}
