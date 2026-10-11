import { categoryLabel, formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import TxIcon from './TxIcon.jsx'

// One transaction (#42), used on Home and the Transactions page: icon
// (merchant logo or category), merchant, details, and whose it is when it
// isn't yours. Time and place only appear when this person may see them.
export default function TransactionRow({ tx, meId, people, showDate = true }) {
  const mine = tx.owner_user_id === meId
  const owner = tx.owner_user_id ? people[tx.owner_user_id] ?? { user_id: tx.owner_user_id } : null
  const shown = -tx.amount_minor // Plaid: positive = money out
  return (
    <li className="tx-row">
      <TxIcon tx={tx} />
      <div className="grow">
        <p className="name">{tx.merchant}</p>
        <p className="small muted tx-meta">
          {!mine && owner && (
            <span className="tx-owner">
              <Avatar member={owner} small />
              {nameOf(owner)}
            </span>
          )}
          <span>{details(tx, showDate)}</span>
        </p>
      </div>
      <span className={`amount ${shown < 0 ? 'money-out' : 'money-in'}`}>
        {shown > 0 ? '+' : shown < 0 ? '−' : ''}
        {formatMoney(Math.abs(shown), tx.currency)}
      </span>
    </li>
  )
}

function details(tx, showDate) {
  const w = tx.whereabouts
  const when = w?.authorized_at || w?.posted_at
  return [
    showDate && formatDay(tx),
    when && new Date(when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    [w?.city, w?.region].filter(Boolean).join(', '),
    tx.payment_channel,
    tx.category_primary && categoryLabel(tx.category_primary),
    tx.pending && 'pending',
  ]
    .filter(Boolean)
    .join(' · ')
}

function formatDay(tx) {
  const day = tx.authorized_date || tx.date // when you paid, if the bank says
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
