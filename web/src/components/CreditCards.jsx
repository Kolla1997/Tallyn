import { formatMoney } from '../lib/money.js'
import { useFadeOnChange } from '../lib/motion.js'
import CountUp from './CountUp.jsx'

// Credit cards on Home (#27, Dinesh picked F): one bar for the total limit,
// each card's balance a piece of it in a shade of clay, the rest available.
// Under it, one line per card: used of its limit, APR, minimum and due date,
// soonest due first. APR, minimum and due date come from the bank (Plaid
// Liabilities) about once a day; until then a card shows its balance only.

const SHADES = 5 // .cc-shade-0 .. -4, darkest first
const SOON_DAYS = 5

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shortDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// The rate people compare: purchase APR, else the first one the bank gives.
function mainAPR(card) {
  const aprs = card?.aprs ?? []
  return (aprs.find((a) => a.type === 'purchase_apr') ?? aprs[0])?.percent
}

function dueState(card, today) {
  if (card?.is_overdue) return 'late'
  const due = card?.next_payment_due_date
  if (!due) return ''
  const days = (new Date(`${due}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000
  return days >= 0 && days <= SOON_DAYS ? 'soon' : ''
}

export default function CreditCards({ banks, me, home, everyone = false }) {
  const fading = useFadeOnChange(everyone) // #87
  const shown = everyone ? banks : banks.filter((b) => b.owner_user_id === me.user_id)
  const all = shown.flatMap((b) => b.accounts.filter((a) => a.type === 'credit').map((a) => ({ ...a, bankName: b.institution_name })))
  if (all.length === 0) return null

  // One currency at a time, like Your accounts: home first.
  const cur = all.some((a) => a.currency === home) ? home : all[0].currency
  const today = iso(new Date())
  const cards = all
    .filter((a) => a.currency === cur)
    .sort((x, y) => (x.card?.next_payment_due_date ?? '9999').localeCompare(y.card?.next_payment_due_date ?? '9999') || x.name.localeCompare(y.name))
  const others = all.length - cards.length
  const used = (a) => Math.max(0, a.current_balance_minor ?? 0)
  const totalUsed = cards.reduce((t, a) => t + used(a), 0)
  const withLimit = cards.filter((a) => a.credit_limit_minor > 0)
  const totalLimit = withLimit.reduce((t, a) => t + a.credit_limit_minor, 0)
  const available = Math.max(0, totalLimit - withLimit.reduce((t, a) => t + used(a), 0))
  const pct = totalLimit ? Math.round((withLimit.reduce((t, a) => t + used(a), 0) / totalLimit) * 100) : null

  return (
    <section className={fading ? 'panel is-fading' : 'panel'} aria-labelledby="cards-h">
      <div className="panel-head">
        <h2 id="cards-h">{everyone ? 'Everyone’s credit cards' : 'Credit cards'}</h2>
        <span className="small muted">
          <strong className="cc-total">
            <CountUp value={totalUsed} format={(v) => formatMoney(v, cur)} />
          </strong>{' '}
          used
          {totalLimit > 0 && <> of {formatMoney(totalLimit, cur)} total limit</>}
        </span>
      </div>

      {totalLimit > 0 && (
        <>
          <div className="cc-bar" role="img" aria-label={`${pct}% of your ${formatMoney(totalLimit, cur)} total limit used, ${formatMoney(available, cur)} available`}>
            {withLimit.map((a, i) => (
              <span key={a.id} className={`cc-piece cc-shade-${i % SHADES}`} style={{ width: `${Math.min(100, (used(a) / totalLimit) * 100)}%` }} />
            ))}
          </div>
          <div className="cc-ticks small muted">
            <span>{pct}% used</span>
            <span>{formatMoney(available, cur)} available</span>
          </div>
        </>
      )}

      <ul className="rows cc-rows">
        {cards.map((a) => {
          const i = withLimit.indexOf(a)
          const apr = mainAPR(a.card)
          const min = a.card?.minimum_payment_minor
          const due = a.card?.next_payment_due_date
          const state = dueState(a.card, today)
          const details = [a.bankName, apr && `APR ${apr}%`, min != null && `Min ${formatMoney(min, cur)}`].filter(Boolean).join(' · ')
          return (
            <li key={a.id}>
              <span className={i >= 0 ? `cc-swatch cc-shade-${i % SHADES}` : 'cc-swatch cc-swatch-none'} aria-hidden="true" />
              <div className="grow">
                <p className="name">
                  {a.name} {a.mask && <span className="small muted">••{a.mask}</span>}
                </p>
                <p className="small muted">{details}</p>
                {!a.card && <p className="small muted">No APR or due date from the bank yet.</p>}
              </div>
              <div className="cc-right">
                <p>
                  <span className="amount">{formatMoney(used(a), cur)}</span>
                  {a.credit_limit_minor > 0 && <span className="small muted"> of {formatMoney(a.credit_limit_minor, cur)}</span>}
                </p>
                {state === 'late' ? (
                  <span className="tag cc-due-late">Overdue</span>
                ) : (
                  due && <span className={state === 'soon' ? 'tag cc-due-soon' : 'small muted'}>Due {shortDate(due)}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {others > 0 && (
        <p className="small muted">
          {others} {others === 1 ? 'card is' : 'cards are'} in another currency. See All accounts.
        </p>
      )}
    </section>
  )
}
