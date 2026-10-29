import { useCallback, useEffect, useMemo, useState } from 'react'
import AccountIcon from '../components/AccountIcon.jsx'
import PageSkeleton from '../components/calm/PageSkeleton.jsx'
import LoadFailed, { StaleBanner } from '../components/LoadFailed.jsx'
import { useRetry } from '../lib/retry.js'
import { api } from '../lib/api.js'
import { canAddCardDetails, dueState, shortDate, todayISO } from '../lib/cards.js'
import { formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { ReconnectBank } from './Banks.jsx'
import { Head, Panel, Chips } from '../components/calm/ui.jsx'

// Debts (#27), in the calm redesign (#187, Dinesh picked layout F): a summary strip with a waffle
// for the split by kind and four figures (you owe, due this month, interest this year, overdue),
// then every debt as a row grouped by kind: its details line, a bar for how much of a limit is
// used (red) or of a loan is paid off (green), and the balance. Same people switcher as Accounts;
// the API only returns what this person may see (#28).

const GROUPS = [
  ['card', 'Credit cards', 'limit', 'var(--color-redesign-accent)'],
  ['student', 'Student loans', 'borrowed', 'var(--color-redesign-grey-1)'],
  ['mortgage', 'Mortgages', 'borrowed', 'var(--color-redesign-grey-2)'],
  ['other', 'Other loans', 'borrowed or limit', 'var(--color-redesign-grey-3)'],
]
const NUM = 'font-[family-name:var(--font-heading)] font-semibold tabular-nums'
const MUTED = 'text-zinc-500 dark:text-zinc-400'
const KID = new Set(['teen', 'child'])

export function groupOf(a) {
  if (a.type === 'credit') return 'card'
  const sub = (a.subtype ?? '').toLowerCase()
  if (sub === 'student') return 'student'
  if (sub === 'mortgage') return 'mortgage'
  return 'other'
}

// What a debt's gauge (and its ring) measures against, if the bank says.
export function measure(a) {
  const owed = Math.max(0, a.current_balance_minor ?? 0)
  if (a.type === 'credit' || (!a.loan?.original_minor && a.credit_limit_minor > 0)) {
    if (!(a.credit_limit_minor > 0)) return null
    return {
      kind: 'used',
      max: a.credit_limit_minor,
      percent: (owed / a.credit_limit_minor) * 100,
    }
  }
  const original = a.loan?.original_minor
  if (!(original > 0)) return null
  // Interest added to a loan can make it bigger than what was borrowed.
  return {
    kind: 'paid',
    max: original,
    percent: (Math.max(0, original - owed) / original) * 100,
    over: owed > original,
  }
}

const monthYear = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })

export default function DebtsPage({ me, household, refreshKey, onChanged }) {
  const [banks, setBanks] = useState(null)
  const [members, setMembers] = useState([])
  const [who, setWho] = useState('yours')
  const [error, setError] = useState('')
  const [failed, setFailed] = useState(false) // the last load failed (#151)
  const home = household.home_currency
  const money = useCallback((v) => formatMoney(v, home), [home])

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    return Promise.all([api(`/api/banks?household_id=${hh}`), api(`/api/households/${hh}/members`)]).then(
      ([b, m]) => {
        setBanks(b.banks)
        setMembers(m.members)
        setFailed(false)
      },
      () => setFailed(true),
    )
  }, [household.id])

  useEffect(() => {
    load()
  }, [load, refreshKey])
  const [retrying, retry] = useRetry(load)

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const owners = [...new Set((banks ?? []).map((b) => b.owner_user_id))].filter((id) => id !== me.user_id)
  const showSwitch = !KID.has(household.role) && owners.length > 0
  const shown = (banks ?? []).filter((b) => who === 'everyone' || b.owner_user_id === (who === 'yours' ? me.user_id : who))
  const owedAll = shown.flatMap((b) => b.accounts.filter((a) => a.type === 'credit' || a.type === 'loan').map((a) => ({ ...a, bank: b })))
  const debts = owedAll.filter((a) => a.currency === home && a.current_balance_minor != null)
  const others = owedAll.length - debts.length
  const owed = (a) => Math.max(0, a.current_balance_minor)
  const total = debts.reduce((t, a) => t + owed(a), 0)

  const groups = GROUPS.map(([key, label, maxNote, color]) => {
    const list = debts.filter((a) => groupOf(a) === key).sort((x, y) => owed(y) - owed(x))
    const value = list.reduce((t, a) => t + owed(a), 0)
    // Debts without a known limit or amount borrowed count as fully owed.
    // A ring never shows less than is owed (a loan can grow past what was borrowed).
    const max = list.reduce((t, a) => t + Math.max(measure(a)?.max ?? 0, owed(a)), 0)
    return { key, label, maxNote, color, list, value, max }
  }).filter((g) => g.list.length > 0)

  // The three facts under the rings.
  const month = todayISO().slice(0, 7)
  const due = debts
    .map((a) =>
      a.card ? [a.card.minimum_payment_minor, a.card.next_payment_due_date] : a.loan ? [a.loan.next_payment_minor, a.loan.next_payment_due_date] : [null, null],
    )
    .filter(([amount, date]) => amount != null && date?.startsWith(month))
  const knowsDates = debts.some((a) => a.card?.next_payment_due_date || a.loan?.next_payment_due_date)
  const interest = debts.filter((a) => a.loan?.ytd_interest_minor != null)
  const overdue = debts.filter((a) => a.card?.is_overdue || a.loan?.is_overdue).length

  return (
    <div className="calm">
      <Head title="Debts" sub="Everything you owe, in one place" />

      {showSwitch && (
        <div className="mb-3">
          <Chips
            label="Whose debts"
            options={[['yours', 'Yours'], ...owners.map((id) => [id, nameOf(people[id] ?? { user_id: id })]), ['everyone', 'Everyone']]}
            value={who}
            onChange={setWho}
          />
        </div>
      )}

      {error && (
        <p className="m-0 mb-3 text-[14px] font-semibold" style={{ color: 'var(--color-redesign-owe-text)' }} role="alert">
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
      ) : debts.length === 0 ? (
        <Panel label="No debts">
          <p className={`m-0 text-[14px] ${MUTED}`}>{who === 'yours' ? 'No credit cards or loans to show. Nice.' : 'No credit cards or loans to show here.'}</p>
        </Panel>
      ) : (
        <>
          <section aria-label="What you owe by kind" className="calm-glass mb-3 grid gap-5 rounded-2xl p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <div className="lg:border-r lg:border-zinc-200 dark:lg:border-zinc-800 lg:pr-6">
              <Waffle groups={groups} total={total} money={money} />
            </div>
            <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:divide-x sm:divide-zinc-200 dark:sm:divide-zinc-800">
              <Figure
                label={who === 'everyone' ? 'Everyone owes' : who === 'yours' ? 'You owe' : `${nameOf(people[who] ?? { user_id: who })} owes`}
                value={money(total)}
                tone="var(--color-redesign-owe-text)"
                first
              />
              <Figure
                label="Payments due this month"
                value={knowsDates ? money(due.reduce((t, [v]) => t + v, 0)) : '—'}
                note={knowsDates ? `${due.length} ${due.length === 1 ? 'payment' : 'payments'}` : 'Your banks haven’t shared due dates'}
              />
              <Figure
                label="Interest paid this year"
                value={interest.length ? money(interest.reduce((t, a) => t + a.loan.ytd_interest_minor, 0)) : '—'}
                note={interest.length ? 'on loans' : 'Your banks haven’t shared it'}
              />
              <Figure
                label="Overdue"
                value={overdue ? `${overdue} ${overdue === 1 ? 'debt' : 'debts'}` : 'None'}
                note={overdue ? 'Check with your bank' : 'All on time'}
                tone={overdue ? 'var(--color-redesign-owe-text)' : 'var(--color-redesign-in-text)'}
              />
            </dl>
          </section>

          <section aria-label="Your debts" className="calm-solid overflow-hidden rounded-2xl">
            <div
              className={`hidden grid-cols-[minmax(0,1fr)_240px_140px] gap-x-6 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-[13px] font-semibold sm:grid ${MUTED}`}
            >
              <span>Debt</span>
              <span>Progress</span>
              <span className="text-right">Balance</span>
            </div>
            {groups.map((g) => (
              <div key={g.key} role="group" aria-labelledby={`debts-${g.key}`}>
                <h2
                  id={`debts-${g.key}`}
                  className={`m-0 flex justify-between border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-1.5 font-[family-name:var(--font-body)] text-[13px] font-semibold ${MUTED}`}
                >
                  {g.label} <span className="tabular-nums">{money(g.value)}</span>
                </h2>
                <ul className="m-0 list-none p-0">
                  {g.list.map((a) => (
                    <DebtRow key={a.id} account={a} money={money} onChanged={onChanged} onError={setError} />
                  ))}
                </ul>
              </div>
            ))}
            <p className="m-0 flex justify-between border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold">
              {who === 'everyone' ? 'Everyone owes' : 'You owe'}
              <span className={NUM} style={{ color: 'var(--color-redesign-owe-text)' }}>
                {money(total)}
              </span>
            </p>
          </section>

          {others > 0 && (
            <p className={`m-0 mt-3 text-[13px] ${MUTED}`}>
              {others} {others === 1 ? 'debt is' : 'debts are'} in another currency or {others === 1 ? 'has' : 'have'} no balance yet. See Accounts.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// One figure in the summary strip.
function Figure({ label, value, note, tone, first }) {
  return (
    <div className={first ? 'sm:pr-4' : 'sm:px-3'}>
      <dt className={`text-[13px] whitespace-nowrap ${MUTED}`}>{label}</dt>
      <dd className={`m-0 text-[22px] whitespace-nowrap ${NUM}`} style={tone ? { color: tone } : undefined}>
        {value}
      </dd>
      {note && <dd className={`m-0 text-[13px] ${MUTED}`}>{note}</dd>}
    </div>
  )
}

// What's owed by kind as 100 cells, one per percent, labelled beside it.
function Waffle({ groups, total, money }) {
  const cells = []
  groups.forEach((g, i) => {
    const n = i === groups.length - 1 ? 100 - cells.length : Math.round((g.value / total) * 100)
    for (let k = 0; k < n; k++) cells.push(g.color)
  })
  return (
    <div className="flex items-center gap-4">
      <span className="grid shrink-0 grid-cols-10 gap-[2px]" aria-hidden="true">
        {cells.map((c, i) => (
          <i key={i} className="block size-[8px] rounded-[1.5px]" style={{ background: c }} />
        ))}
      </span>
      <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]">
        {groups.map((g) => (
          <li key={g.key} className="flex items-center gap-2">
            <i className="block size-2 shrink-0 rounded-[2px]" style={{ background: g.color }} />
            <span>{g.label}</span>
            <b className={`ml-auto pl-4 ${NUM}`}>{money(g.value)}</b>
            <span className={`w-10 text-right tabular-nums ${MUTED}`}>{total ? Math.round((g.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// A debt as a row: name and its details, a bar for how far along it is, the balance.
function DebtRow({ account: a, money, onChanged, onError }) {
  const m = measure(a)
  const owed = Math.max(0, a.current_balance_minor)
  const caption = m
    ? m.kind === 'used'
      ? [`${Math.round(m.percent)}% of ${money(m.max)} limit used`, `${money(Math.max(0, m.max - owed))} available`]
      : m.over
        ? [`Owes more than the ${money(m.max)} borrowed`, `${money(owed)} to go`]
        : [`${Math.round(m.percent)}% paid off of ${money(m.max)}`, `${money(owed)} to go`]
    : null
  return (
    <li
      aria-label={`${a.name}${a.mask ? ` ending ${a.mask}` : ''}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_240px_140px]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <AccountIcon account={a} />
        <div className="min-w-0">
          <p className="name m-0 truncate text-[15px] font-semibold">
            {a.name} {a.mask && <span className={`text-[13px] font-normal ${MUTED}`}>··{a.mask}</span>}
          </p>
          <Details account={a} money={money} onChanged={onChanged} onError={onError} />
        </div>
      </div>
      <div className="order-last col-span-2 sm:order-none sm:col-span-1">
        {m ? (
          <>
            <span className="relative block h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-redesign-track)' }} aria-hidden="true">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.min(100, m.percent)}%`, background: m.kind === 'used' ? 'var(--color-redesign-accent)' : 'var(--color-redesign-in)' }}
              />
            </span>
            <span className="mt-1 flex flex-wrap justify-between gap-x-3 text-[13px]">
              <strong>{caption[0]}</strong>
              <span className={MUTED}>{caption[1]}</span>
            </span>
          </>
        ) : (
          <span className={`text-[13px] ${MUTED}`}>No limit or amount borrowed yet</span>
        )}
      </div>
      <span className={`text-right text-[15px] ${NUM}`} style={{ color: 'var(--color-redesign-owe-text)' }}>
        {money(owed)}
      </span>
    </li>
  )
}

// The line under a debt's name: its rate, next payment and when it ends, or
// why there's nothing (and a way to get it, when one can help).
function Details({ account: a, money, onChanged, onError }) {
  const bank = a.bank
  const due = (amount, date, overdue) => {
    const state = dueState(date, overdue)
    if (state === 'late')
      return (
        <span className="rounded-full bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 font-semibold" style={{ color: 'var(--color-redesign-owe-text)' }}>
          Overdue
        </span>
      )
    if (!date) return amount != null ? `${money(amount)} a month` : null
    const text = `${amount != null ? `${money(amount)} ` : ''}${state === 'past' ? 'last due' : 'due'} ${shortDate(date)}`
    return state === 'soon' ? (
      <span className="rounded-full bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 font-semibold" style={{ color: 'var(--color-redesign-owe-text)' }}>
        {text}
      </span>
    ) : (
      text
    )
  }
  const join = (parts) => parts.filter(Boolean).reduce((out, p, i) => (i ? [...out, ' · ', <span key={i}>{p}</span>] : [<span key={i}>{p}</span>]), [])

  if (a.card) {
    const aprs = a.card.aprs ?? []
    const apr = (aprs.find((x) => x.type === 'purchase_apr') ?? aprs[0])?.percent
    return (
      <p className={`m-0 text-[13px] ${MUTED}`}>
        {join([
          apr && `APR ${apr}%`,
          a.card.minimum_payment_minor != null && `Min ${money(a.card.minimum_payment_minor)}`,
          due(null, a.card.next_payment_due_date, a.card.is_overdue),
        ])}
      </p>
    )
  }
  if (a.loan) {
    const l = a.loan
    const rate = l.rate_percent && `${l.rate_percent}%${l.rate_type ? ` ${l.rate_type}` : ''}`
    const end =
      l.payoff_date && (l.kind === 'mortgage' ? `${l.term ? `${l.term}, ` : ''}ends ${monthYear(l.payoff_date)}` : `Paid off by ${monthYear(l.payoff_date)}`)
    return (
      <p className={`m-0 text-[13px] ${MUTED}`}>
        {join([
          rate,
          due(l.next_payment_minor, l.next_payment_due_date, l.is_overdue),
          l.past_due_minor > 0 && `${money(l.past_due_minor)} past due`,
          end,
          l.repayment_plan,
        ])}
      </p>
    )
  }

  // No details: say why, and offer a fix when one can help (#51).
  const kind = a.type === 'credit' ? 'card' : ['student', 'mortgage'].includes((a.subtype ?? '').toLowerCase()) ? 'loan' : 'other'
  if (kind === 'other') return <p className={`m-0 text-[13px] ${MUTED}`}>Your bank doesn&apos;t share loan details for this account.</p>
  const needsSignIn = bank.status === 'needs_reauth'
  if (!needsSignIn && !canAddCardDetails(bank)) {
    return (
      <p className={`m-0 text-[13px] ${MUTED}`}>
        {kind === 'card' ? 'Your bank doesn’t share APR or due dates for this card.' : 'Your bank doesn’t share loan details for this account.'}
      </p>
    )
  }
  return (
    <p className={`m-0 text-[13px] ${MUTED}`}>
      {kind === 'card' ? 'No APR or due date yet' : 'No rate or due date yet'}
      {bank.can_unlink && (
        <>
          {' · '}
          <ReconnectBank
            bankId={bank.id}
            label={needsSignIn ? `Reconnect ${bank.institution_name || 'bank'}` : kind === 'card' ? 'Add APR and due dates' : 'Add rates and due dates'}
            className="font-semibold text-zinc-900 dark:text-white underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4"
            onDone={onChanged}
            onError={onError}
          />
        </>
      )}
    </p>
  )
}
