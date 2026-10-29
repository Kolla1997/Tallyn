import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, Users, CreditCard, Car } from 'lucide-react'
import AccountIcon from '../components/AccountIcon.jsx'
import TxIcon from '../components/TxIcon.jsx'
import { cleanName } from '../components/TransactionRow.jsx'
import { api } from '../lib/api.js'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { currencies, isOwed, summarize } from '../lib/summary.js'
import { LinkBank } from './Banks.jsx'
import PageSkeleton from '../components/calm/PageSkeleton.jsx'
import LoadFailed, { StaleBanner } from '../components/LoadFailed.jsx'
import { useRetry } from '../lib/retry.js'
import { shortDate } from '../lib/cards.js'
import { Head, Panel, See, Rows, Row, Money, Pill, PILL, NUM, MUTED, OWE, IN } from '../components/calm/ui.jsx'
import SplitFlapText from '@/components/kokonutui/split-flap-text'
import NotificationStack from '@/components/kokonutui/notification-stack'
import MetricCard from '@/components/kokonutui/metric-card'
import SmoothTab from '@/components/kokonutui/smooth-tab'
import { Gauge } from '@/components/charts/gauge'
import OpensOver from '../components/calm/OpensOver.jsx'

// Home in the calm redesign (#187), built from the #185/#182 draft (web/src/lab/home/CalmHome.jsx):
// a 12-column grid with
//   1 Total (8)                       | Coming up (4)
//   2 Spending, last 90 days (8)      | Recent transactions (4)
//   3 Your accounts (4) | Credit cards + Shared with you (4) | Family + Goals (4)
// Kokonut's split-flap total, notification stack, metric card and smooth tabs, Bklit gauges.
// Everything shown is what the API returns for this person, so the sharing rules (#28) apply.
// Yours / Everyone switches the whole page (#68).

const now = new Date()
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const monthName = (d) => d.toLocaleDateString('en-US', { month: 'long' })
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DAY = 86400000

// Spending, transfers and income are kept apart, so loan payments and moves between accounts
// don't look like spending (#77).
const TRANSFER = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])
export function txKind(t) {
  if (TRANSFER.has(t.category_primary)) return 'transfers'
  if (t.category_primary === 'INCOME') return 'income'
  return 'spending'
}

export default function HomePage({ me, household, refreshKey, onChanged }) {
  const [banks, setBanks] = useState(null)
  const [members, setMembers] = useState([])
  const [txs, setTxs] = useState(null)
  const [mine, setMine] = useState(null)
  const [spending, setSpending] = useState(null) // { yours, everyone } month summaries, one per currency
  const [daily, setDaily] = useState({ yours: [], everyone: [] })
  const [scope, setScope] = useState('yours') // Home opens on your own money (#68)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState(false) // the last load failed (#151)
  const home = household.home_currency

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    const owner = encodeURIComponent(me.user_id)
    const year = now.getFullYear()
    // The spending trend loads on its own, so Home never waits for it. Each half stands alone: one
    // failing never blanks the other. The last 90 days can start in last year, so that year too.
    Promise.all([
      dailyFor(hh, year, `&owner=${owner}`),
      dailyFor(hh, year, ''), // everyone you can see: no owner filter
    ]).then(([yours, everyone]) => setDaily({ yours, everyone }))
    return Promise.all([
      api(`/api/banks?household_id=${hh}`),
      api(`/api/households/${hh}/members`),
      api(`/api/transactions?household_id=${hh}&limit=200`),
      api(`/api/transactions?household_id=${hh}&owner=${owner}&limit=100`),
      api(`/api/transactions/summary?household_id=${hh}&month=${MONTH}&owner=${owner}`),
      api(`/api/transactions/summary?household_id=${hh}&month=${MONTH}`),
    ]).then(
      ([b, m, t, y, sy, se]) => {
        setBanks(b.banks)
        setMembers(m.members)
        setTxs(t.transactions)
        setMine(y.transactions)
        setSpending({ yours: sy.summary, everyone: se.summary })
        setFailed(false)
        setError('')
      },
      () => setFailed(true),
    )
  }, [household.id, me.user_id])

  useEffect(() => {
    load()
  }, [load, refreshKey])
  const [retrying, retry] = useRetry(load)

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const roles = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.role])), [members])
  const canLink = household.role === 'owner' || household.role === 'adult'
  const everyone = scope === 'everyone'
  const greeting = me.display_name ? `Hello, ${me.display_name}` : 'Hello'
  const shown = banks ? (everyone ? banks : banks.filter((b) => b.owner_user_id === me.user_id)) : []
  const summary = spending?.[scope]?.find((x) => x.currency === home)

  return (
    <div className="calm">
      <Head title={household.name} tab="Home" sub={greeting}>
        {canLink && <LinkBank householdId={household.id} onLinked={onChanged} onError={setError} className={PILL} />}
        {/* One button for the Family page, where inviting and sharing both live (#97). */}
        <Pill to="/family" quiet icon={Users}>
          Family and sharing
        </Pill>
      </Head>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {failed && banks && <StaleBanner busy={retrying} onRetry={retry} />}
      {!banks ? (
        failed ? (
          <LoadFailed busy={retrying} onRetry={retry} />
        ) : (
          <PageSkeleton />
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 [&>*]:min-w-0">
          <div className="md:col-span-2 lg:col-span-8">
            <Total banks={banks} me={me} roles={roles} home={home} scope={scope} onScope={setScope} spent={summary?.spent_minor ?? 0} />
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <OpensOver>
              <ComingUp banks={shown} home={home} />
            </OpensOver>
          </div>
          <div className="md:col-span-2 lg:col-span-8">
            <Spending days={daily[scope]} summary={summary} home={home} everyone={everyone} />
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <Recent txs={(everyone ? txs : mine) ?? []} me={me} people={people} everyone={everyone} />
          </div>
          <div className="lg:col-span-4">
            <YourAccounts banks={shown} home={home} everyone={everyone} canLink={canLink} />
          </div>
          <div className="grid content-start gap-3 lg:col-span-4">
            <Cards banks={shown} />
            <SharedWithYou banks={banks} me={me} people={people} roles={roles} />
          </div>
          <div className="grid content-start gap-3 md:col-span-2 lg:col-span-4">
            <Family members={members} isOwner={household.role === 'owner'} />
            <Goals household={household} />
          </div>
        </div>
      )}
    </div>
  )
}

// Daily spending for the chart: this year and, early in the year, last year. Never rejects: a part
// that fails just leaves those days out.
function dailyFor(hh, year, owner) {
  const years = new Date(Date.now() - 90 * DAY).getFullYear() < year ? [year - 1, year] : [year]
  return Promise.all(
    years.map((y) =>
      api(`/api/transactions/daily?household_id=${hh}&year=${y}${owner}`).then(
        (d) => d?.days ?? [],
        () => [],
      ),
    ),
  ).then((parts) => parts.flat())
}

// Row 1: the total on dark, as split-flap figures, with Yours / Everyone (#68).
function Total({ banks, me, roles, home, scope, onScope, spent }) {
  const yours = scope === 'yours'
  const totals = summarize(yours ? banks.filter((b) => b.owner_user_id === me.user_id) : banks, me.user_id, roles)
  const list = currencies(totals, home)
  const cur = list[0]
  const t = cur ? totals[cur] : null
  return (
    <section
      aria-label={yours ? 'Your balance' : 'Total balance'}
      className="flex h-full flex-col justify-center gap-3 rounded-2xl bg-zinc-950 p-5 text-white dark:bg-black dark:ring-1 dark:ring-zinc-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[13px] text-zinc-400">{yours ? `Your balance · in ${cur ?? home}` : `Everything you can see · in ${cur ?? home}`}</p>
        <div role="group" aria-label="Show on Home" className="flex rounded-full bg-white/10 p-0.5 text-[13px] font-semibold">
          {[
            ['yours', 'Yours'],
            ['everyone', 'Everyone'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={scope === k}
              onClick={() => onScope(k)}
              className="rounded-full border-0 bg-transparent px-3 py-1 text-zinc-300 transition-[background-color,color] duration-150 aria-pressed:bg-white aria-pressed:text-zinc-950"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!t ? (
        <>
          <p className={`m-0 text-4xl ${NUM}`}>—</p>
          <p className="m-0 text-[13px] text-zinc-400">Link a bank to see your total.</p>
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <SplitFlapText text={formatMoney(t.have, cur)} className="text-2xl md:text-4xl" />
            <span className="sr-only">{formatMoney(t.have, cur)}</span>
          </div>
          <p className="m-0 text-[13px] text-zinc-400">
            {yours ? 'Your net worth' : 'Net worth'} <span className="text-white">{formatMoney(t.net, cur)}</span> after {formatMoney(t.owe, cur)} owed on cards
            and loans.
            {spent > 0 && <> −{formatMoney(spent, cur)} spent this month.</>}
            {list.length > 1 && (
              <>
                {' '}
                Also{' '}
                {list
                  .slice(1)
                  .map((c) => `${formatMoney(totals[c].have, c)} in ${c}`)
                  .join(', ')}
                .
              </>
            )}
          </p>
        </>
      )}
    </section>
  )
}

// Coming up: card and loan payments due in the next 8 days, as Kokonut's notification stack.
function ComingUp({ banks, home }) {
  const [today] = useState(() => iso(new Date()))
  const [until] = useState(() => iso(new Date(Date.now() + 8 * DAY)))
  const items = banks
    .flatMap((b) =>
      b.accounts.map((a) => {
        const [amount, date] = a.card
          ? [a.card.minimum_payment_minor ?? a.current_balance_minor, a.card.next_payment_due_date]
          : a.loan
            ? [a.loan.next_payment_minor, a.loan.next_payment_due_date]
            : []
        return date && date >= today && date <= until ? { a, amount, date, bank: b.institution_name } : null
      }),
    )
    .filter(Boolean)
    .sort((x, y) => x.date.localeCompare(y.date))
  const total = items.reduce((t, i) => t + (i.amount ?? 0), 0)
  const days = (d) => Math.round((Date.parse(d) - Date.parse(today)) / DAY)
  return (
    <Panel id="due-h" title="Coming up" meta={items.length ? `Next 8 days · ${formatMoney(total, home)}` : 'Next 8 days'}>
      {items.length === 0 ? (
        <p className={`m-0 text-[13px] ${MUTED}`}>Nothing due from your cards or loans in the next 8 days.</p>
      ) : (
        <NotificationStack
          notifications={items.map((i) => {
            const I = i.a.card ? CreditCard : Car
            const soon = days(i.date) <= 5
            return {
              id: i.a.id,
              app: `Due ${shortDate(i.date)}`,
              title: `${i.a.name} · ${formatMoney(i.amount, i.a.currency)}`,
              body: `${i.bank}, in ${days(i.date)} ${days(i.date) === 1 ? 'day' : 'days'}.`,
              time: shortDate(i.date),
              icon: (
                <span
                  className="flex size-8 items-center justify-center rounded-lg text-white"
                  style={{ background: soon ? 'var(--color-redesign-accent)' : 'var(--color-redesign-grey-5)' }}
                >
                  <I className="size-4" aria-hidden="true" />
                </span>
              ),
            }
          })}
        />
      )}
    </Panel>
  )
}

// Row 2: spending over the last 90 days as Kokonut's metric card (7, 30 or 90 days).
function Spending({ days, summary, home, everyone }) {
  const [end] = useState(() => Date.now())
  const data = useMemo(() => {
    const byDay = Object.fromEntries((days ?? []).filter((d) => d.currency === home).map((d) => [d.date, d.amount_minor]))
    const out = []
    for (let i = 89; i >= 0; i--) {
      const key = iso(new Date(end - i * DAY))
      out.push({ date: key, parts: [(byDay[key] ?? 0) / 100] })
    }
    return out
  }, [days, home, end])
  const spent = summary?.spent_minor ?? 0
  return (
    <section aria-label={`${everyone ? 'Spending' : 'Your spending'} in ${monthName(now)}`} className="min-w-0">
      <MetricCard
        label={everyone ? 'Spending' : 'Your spending'}
        segments={['Spending']}
        data={data}
        events={[]}
        periods={[7, 30, 90]}
        defaultPeriod={30}
        format="currency"
        currency={home}
        upIsGood={false}
        className="w-full max-w-none"
      />
      <p className={`m-0 mt-1.5 px-1 text-[13px] ${MUTED}`}>
        {spent > 0 ? (
          <>
            {monthName(now)} so far: <b className="font-semibold text-zinc-900 dark:text-white">{formatMoney(spent, home)}</b> spent.{' '}
          </>
        ) : (
          <>No spending yet this month. </>
        )}
        Transfers and loan payments aren&apos;t counted as spending. <See to="/budgets">Budgets</See>
      </p>
    </section>
  )
}

// Recent transactions by kind, in Kokonut's smooth tabs.
function Recent({ txs, me, people, everyone }) {
  const list = (kind, empty) => {
    const shown = txs.filter((t) => txKind(t) === kind).slice(0, 6)
    if (txs.length === 0) return <p className={`m-0 text-[13px] ${MUTED}`}>No transactions yet. A new bank can take a few minutes to show its history.</p>
    if (shown.length === 0) return <p className={`m-0 text-[13px] ${MUTED}`}>{empty}</p>
    return (
      <Rows>
        {shown.map((t) => {
          const out = t.amount_minor > 0
          const who = t.owner_user_id === me.user_id ? 'You' : nameOf(people[t.owner_user_id] ?? { user_id: t.owner_user_id })
          return (
            <Row
              key={t.id}
              lead={<TxIcon tx={t} />}
              name={cleanName(t.merchant || t.name || 'Transaction')}
              sub={`${categoryLabel(t.category_primary)} · ${shortDate(t.date)}${t.pending ? ' · pending' : ''}${everyone ? ` · ${who}` : ''}`}
            >
              <Money className="text-[14px]" tone={out ? undefined : IN}>
                {out ? '−' : '+'}
                {formatMoney(Math.abs(t.amount_minor), t.currency)}
              </Money>
            </Row>
          )
        })}
      </Rows>
    )
  }
  return (
    <Panel
      id="tx-h"
      title={everyone ? 'Recent transactions' : 'Your recent transactions'}
      meta={<See to={everyone ? '/transactions?owner=all' : '/transactions'}>See all</See>}
      className="h-full"
    >
      <div className="overflow-hidden">
        <SmoothTab
          label="Kind of transaction"
          activeColor="bg-zinc-900 dark:bg-white"
          activeTextColor="text-white dark:text-zinc-900"
          items={[
            { id: 'spending', title: 'Spending', content: list('spending', 'No spending yet.') },
            { id: 'transfers', title: 'Transfers', content: list('transfers', 'No transfers yet.') },
            { id: 'income', title: 'Income', content: list('income', 'No income yet.') },
          ]}
        />
      </div>
    </Panel>
  )
}

// Row 3: what you have, biggest first; the full list is on Accounts.
function YourAccounts({ banks, home, everyone, canLink }) {
  const all = banks.flatMap((b) => b.accounts.map((a) => ({ ...a, bankName: b.institution_name })))
  const have = all.filter((a) => !isOwed(a)).sort((x, y) => (y.current_balance_minor ?? 0) - (x.current_balance_minor ?? 0))
  return (
    <Panel
      id="yours-h"
      title={everyone ? 'Everyone’s accounts' : 'Your accounts'}
      meta={
        all.length > 0 && (
          <See to={everyone ? '/accounts?person=everyone' : '/accounts'}>{`All ${all.length} ${all.length === 1 ? 'account' : 'accounts'}`}</See>
        )
      }
    >
      {all.length === 0 ? (
        <p className={`m-0 text-[13px] ${MUTED}`}>{canLink ? 'You haven’t linked a bank yet. Use Link a bank above.' : 'You don’t have any banks linked.'}</p>
      ) : (
        <Rows>
          {have.slice(0, 6).map((a) => (
            <Row
              key={a.id}
              lead={<AccountIcon account={a} />}
              name={a.name}
              sub={[a.bankName, a.mask && `··${a.mask}`, a.currency !== home && a.currency].filter(Boolean).join(' ')}
            >
              <Money className="text-[14px]">{formatMoney(a.current_balance_minor, a.currency)}</Money>
            </Row>
          ))}
        </Rows>
      )}
    </Panel>
  )
}

// Each credit card: what's owed, what's available of the limit, when it's due, a notched gauge.
function Cards({ banks }) {
  const cards = banks
    .flatMap((b) => b.accounts.filter((a) => a.type === 'credit').map((a) => ({ ...a, bankName: b.institution_name })))
    .sort((x, y) => (y.current_balance_minor ?? 0) - (x.current_balance_minor ?? 0))
  if (cards.length === 0) return null
  return (
    <Panel
      id="card-h"
      title={cards.length === 1 ? 'Credit card' : 'Credit cards'}
      meta={<See to="/debts">{cards.length > 3 ? `All ${cards.length} on Debts` : 'Debts'}</See>}
    >
      <ul className="m-0 grid list-none gap-3 p-0">
        {cards.slice(0, 3).map((a) => {
          const limit = a.credit_limit_minor
          const used = limit > 0 ? Math.round(((a.current_balance_minor ?? 0) / limit) * 100) : null
          return (
            <li key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-[14px] font-semibold">
                    {a.name} {a.mask && <span className={`font-normal ${MUTED}`}>··{a.mask}</span>}
                  </span>
                  <span className={`block text-[13px] ${MUTED}`}>
                    {limit > 0
                      ? `${formatMoney(Math.max(0, limit - (a.current_balance_minor ?? 0)), a.currency)} available of ${formatMoney(limit, a.currency)}`
                      : a.bankName}
                  </span>
                </span>
                <span className="text-right">
                  <Money className="block text-[14px]" tone={OWE}>
                    {formatMoney(a.current_balance_minor, a.currency)}
                  </Money>
                  {a.card?.next_payment_due_date && <span className={`block text-[13px] ${MUTED}`}>Due {shortDate(a.card.next_payment_due_date)}</span>}
                </span>
              </div>
              {used != null && (
                <div className="mt-2">
                  <Gauge
                    orientation="linear"
                    inactiveFill="var(--color-redesign-track)"
                    value={Math.min(100, used)}
                    totalNotches={28}
                    activeFill="var(--color-redesign-accent)"
                    defaultLabel="Limit used"
                    suffix="%"
                    minWidth={160}
                    linearHeight={14}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// Shared with you (#37): each account someone else shares, kept apart from your own money.
function SharedWithYou({ banks, me, people, roles }) {
  const theirs = banks
    .filter((b) => b.owner_user_id !== me.user_id)
    .flatMap((b) => b.accounts.map((a) => ({ ...a, owner: b.owner_user_id, bankName: b.institution_name })))
  if (theirs.length === 0) return null
  return (
    <Panel id="shared-h" title="Shared with you" meta={<See to="/accounts?person=everyone">{theirs.length > 5 ? `All ${theirs.length}` : 'Accounts'}</See>}>
      <Rows>
        {theirs.slice(0, 5).map((a) => {
          const m = people[a.owner] ?? { user_id: a.owner }
          const kid = ['teen', 'child'].includes(roles[a.owner])
          return (
            <Row
              key={a.id}
              lead={<Avatar member={m} />}
              name={a.name}
              sub={`${kid ? 'You see this as a parent' : `From ${nameOf(m)}`} · ${a.bankName}${a.mask ? ` ··${a.mask}` : ''}`}
            >
              <Money className="text-[14px]" tone={isOwed(a) ? OWE : undefined}>
                {a.current_balance_minor == null ? '—' : formatMoney(a.current_balance_minor, a.currency)}
              </Money>
            </Row>
          )
        })}
      </Rows>
    </Panel>
  )
}

function Family({ members, isOwner }) {
  return (
    <Panel id="fam-h" title="Family" meta={<See to="/family">{isOwner ? 'Manage' : 'Sharing'}</See>}>
      <Rows>
        {members.map((m) => (
          <Row
            key={m.user_id}
            lead={<Avatar member={m} />}
            name={`${nameOf(m)}${m.is_you ? ' (you)' : ''}`}
            sub={m.role ? m.role[0].toUpperCase() + m.role.slice(1) : ''}
          />
        ))}
      </Rows>
    </Panel>
  )
}

// Goals on Home (#14): each goal and how full it is. Loads on its own so Home never waits for it.
function Goals({ household }) {
  const [goals, setGoals] = useState(null)
  const today = new Date().toLocaleDateString('en-CA')
  useEffect(() => {
    api(`/api/goals?household_id=${encodeURIComponent(household.id)}&today=${today}`).then(
      (d) => setGoals(d.goals ?? []),
      () => setGoals([]),
    )
  }, [household.id, today])
  const list = goals ?? []
  return (
    <Panel id="goals-h" title="Goals" meta={list.length > 0 && <See to="/goals">See goals</See>}>
      {list.length === 0 ? (
        <p className={`m-0 text-[13px] ${MUTED}`}>
          Save for a trip or a school fund, and let a savings account keep track for you. <See to="/goals">Set a goal</See>
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {list.map((g) => {
            const known = g.saved_minor != null
            const pct = known ? Math.min(100, Math.round((g.saved_minor / g.target_minor) * 100)) : 0
            return (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold">{g.name}</span>
                  <span className={`text-[14px] ${NUM}`}>
                    {known ? formatMoney(g.saved_minor, g.currency) : 'Private'}{' '}
                    <span className={`font-[family-name:var(--font-body)] text-[13px] font-normal ${MUTED}`}>of {formatMoney(g.target_minor, g.currency)}</span>
                  </span>
                </div>
                <p className={`m-0 text-[13px] ${MUTED}`}>
                  {known
                    ? `${g.by_month ? `By ${new Date(`${g.by_month}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · ` : ''}${pct}%`
                    : 'Progress is private'}
                </p>
                {known && (
                  <div className="mt-1.5">
                    <Gauge
                      orientation="linear"
                      inactiveFill="var(--color-redesign-track)"
                      value={pct}
                      totalNotches={28}
                      activeFill="var(--color-redesign-in)"
                      defaultLabel={g.name}
                      suffix="%"
                      minWidth={160}
                      linearHeight={12}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
