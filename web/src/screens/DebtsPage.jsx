import { useCallback, useEffect, useMemo, useState } from 'react'
import AccountIcon from '../components/AccountIcon.jsx'
import NotchGauge from '../components/NotchGauge.jsx'
import RingChart from '../components/RingChart.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import { api } from '../lib/api.js'
import { canAddCardDetails, dueState, shortDate, todayISO } from '../lib/cards.js'
import { formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { ReconnectBank } from './Banks.jsx'
import { PageHead } from './Shell.jsx'

// Debts (#27): everything you owe in one place. Dinesh's picks: rings on top
// (one per kind of debt, You owe in the middle) with three facts under them,
// then one card per debt, two side by side on web, each with a notched gauge:
// how much of a limit is used (Clay), or how much of a loan is paid off
// (Sage). Same people switcher as Accounts; the API only returns what this
// person may see (#28).

const GROUPS = [
  ['card', 'Credit cards', 'limit', 'var(--color-clay-deep)'],
  ['student', 'Student loans', 'borrowed', 'var(--color-clay)'],
  ['mortgage', 'Mortgages', 'borrowed', 'color-mix(in srgb, var(--color-clay) 70%, var(--color-white))'],
  ['other', 'Other loans', 'borrowed or limit', 'color-mix(in srgb, var(--color-clay) 45%, var(--color-white))'],
]
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
  const home = household.home_currency
  const money = useCallback((v) => formatMoney(v, home), [home])

  useEffect(() => {
    const hh = encodeURIComponent(household.id)
    Promise.all([api(`/api/banks?household_id=${hh}`), api(`/api/households/${hh}/members`)]).then(
      ([b, m]) => {
        setBanks(b.banks)
        setMembers(m.members)
      },
      () => setError("We couldn't load your debts. Try again in a moment."),
    )
  }, [household.id, refreshKey])

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
    <>
      <PageHead title="Debts" sub="Everything you owe, in one place" />

      {showSwitch && (
        <div className="chips page-chips" role="group" aria-label="Whose debts">
          {[['yours', 'Yours'], ...owners.map((id) => [id, nameOf(people[id] ?? { user_id: id })]), ['everyone', 'Everyone']].map(([key, label]) => (
            <button key={key} className="chip" aria-pressed={who === key} onClick={() => setWho(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!banks ? (
        <TallynLoader />
      ) : debts.length === 0 ? (
        <section className="panel empty-state">
          <p className="muted">{who === 'yours' ? 'No credit cards or loans to show. Nice.' : 'No credit cards or loans to show here.'}</p>
        </section>
      ) : (
        <>
          <div className="debts-top">
            <section className="panel debts-rings" aria-label="What you owe by kind">
              <RingChart
                key={who}
                rings={groups.map((g) => ({
                  key: g.key,
                  label: g.label,
                  value: g.value,
                  max: g.max,
                  maxNote: g.maxNote,
                  color: g.color,
                }))}
                total={total}
                totalLabel={who === 'everyone' ? 'Everyone owes' : who === 'yours' ? 'You owe' : `${nameOf(people[who] ?? { user_id: who })} owes`}
                format={money}
              />
            </section>
            {/* The facts in their own card, beside the rings on wide screens (Dinesh). */}
            <section className="panel debts-facts" aria-label="Payments, interest and overdue">
              <div>
                <span className="small muted">Payments due this month</span>
                <strong>{knowsDates ? money(due.reduce((t, [v]) => t + v, 0)) : '—'}</strong>
                <span className="small muted">
                  {knowsDates ? `${due.length} ${due.length === 1 ? 'payment' : 'payments'}` : 'Your banks haven’t shared due dates'}
                </span>
              </div>
              <div>
                <span className="small muted">Interest paid this year</span>
                <strong>{interest.length ? money(interest.reduce((t, a) => t + a.loan.ytd_interest_minor, 0)) : '—'}</strong>
                <span className="small muted">{interest.length ? 'on loans' : 'Your banks haven’t shared it'}</span>
              </div>
              <div className={overdue ? 'is-late' : 'is-ok'}>
                <span className="small muted">Overdue</span>
                <strong>{overdue ? `${overdue} ${overdue === 1 ? 'debt' : 'debts'}` : 'None'}</strong>
                <span className="small muted">{overdue ? 'Check with your bank' : 'All on time'}</span>
              </div>
            </section>
          </div>

          {groups.map((g) => (
            <section key={g.key} className="debts-group" aria-labelledby={`debts-${g.key}`}>
              <h2 id={`debts-${g.key}`} className="debts-group-head">
                {g.label} <span className="amount money-out">{money(g.value)}</span>
              </h2>
              <div className="debts-grid">
                {g.list.map((a) => (
                  <DebtCard key={a.id} account={a} money={money} onChanged={onChanged} onError={setError} />
                ))}
              </div>
            </section>
          ))}

          {others > 0 && (
            <p className="small muted">
              {others} {others === 1 ? 'debt is' : 'debts are'} in another currency or {others === 1 ? 'has' : 'have'} no balance yet. See Accounts.
            </p>
          )}
        </>
      )}
    </>
  )
}

function DebtCard({ account: a, money, onChanged, onError }) {
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
    <article className="panel debts-card" aria-label={`${a.name}${a.mask ? ` ending ${a.mask}` : ''}`}>
      <div className="debts-card-head">
        <AccountIcon account={a} />
        <div className="grow">
          <p className="name">
            {a.name} {a.mask && <span className="small muted">••{a.mask}</span>}
          </p>
          <Details account={a} money={money} onChanged={onChanged} onError={onError} />
        </div>
        <span className="amount money-out">{money(owed)}</span>
      </div>
      {m && (
        <div className="debts-gauge">
          <p className="debts-gauge-label small">
            <strong>{caption[0]}</strong>
            <span className="muted">{caption[1]}</span>
          </p>
          <NotchGauge percent={m.percent} tone={m.kind === 'used' ? 'clay' : 'sage'} label={`${caption[0]}, ${caption[1]}`} />
        </div>
      )}
    </article>
  )
}

// The line under a debt's name: its rate, next payment and when it ends, or
// why there's nothing (and a way to get it, when one can help).
function Details({ account: a, money, onChanged, onError }) {
  const bank = a.bank
  const due = (amount, date, overdue) => {
    const state = dueState(date, overdue)
    if (state === 'late') return <span className="tag cc-due-late">Overdue</span>
    if (!date) return amount != null ? `${money(amount)} a month` : null
    const text = `${amount != null ? `${money(amount)} ` : ''}${state === 'past' ? 'last due' : 'due'} ${shortDate(date)}`
    return state === 'soon' ? <span className="tag cc-due-soon">{text}</span> : text
  }
  const join = (parts) => parts.filter(Boolean).reduce((out, p, i) => (i ? [...out, ' · ', <span key={i}>{p}</span>] : [<span key={i}>{p}</span>]), [])

  if (a.card) {
    const aprs = a.card.aprs ?? []
    const apr = (aprs.find((x) => x.type === 'purchase_apr') ?? aprs[0])?.percent
    return (
      <p className="small muted">
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
      <p className="small muted">
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
  if (kind === 'other') return <p className="small muted">Your bank doesn&apos;t share loan details for this account.</p>
  const needsSignIn = bank.status === 'needs_reauth'
  if (!needsSignIn && !canAddCardDetails(bank)) {
    return (
      <p className="small muted">
        {kind === 'card' ? 'Your bank doesn’t share APR or due dates for this card.' : 'Your bank doesn’t share loan details for this account.'}
      </p>
    )
  }
  return (
    <p className="small muted">
      {kind === 'card' ? 'No APR or due date yet' : 'No rate or due date yet'}
      {bank.can_unlink && (
        <>
          {' · '}
          <ReconnectBank
            bankId={bank.id}
            label={needsSignIn ? `Reconnect ${bank.institution_name || 'bank'}` : kind === 'card' ? 'Add APR and due dates' : 'Add rates and due dates'}
            className="link small"
            onDone={onChanged}
            onError={onError}
          />
        </>
      )}
    </p>
  )
}
