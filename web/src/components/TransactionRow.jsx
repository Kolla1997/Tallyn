import { categoryLabel, formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import TxIcon from './TxIcon.jsx'

// One transaction (#42), used on Home and the Transactions page: icon
// (merchant logo or category), merchant, details, and whose it is when it
// isn't yours. Time and place only appear when this person may see them.
// With onSelect, the row is a button that picks this transaction (#58).
// With showBank, the bank and the account's last digits sit under the amount
// (#83, option B); hidden when the account is (shared without balances).
export default function TransactionRow({ tx, meId, people, showDate = true, showBank = false, onSelect, selected = false }) {
  const mine = tx.owner_user_id === meId
  const owner = tx.owner_user_id ? (people[tx.owner_user_id] ?? { user_id: tx.owner_user_id }) : null
  const shown = -tx.amount_minor // Plaid: positive = money out
  const Wrap = onSelect ? 'button' : 'div'
  const pick = onSelect && { type: 'button', 'aria-pressed': selected, onClick: () => onSelect(tx.id) }
  return (
    <li className={onSelect ? 'tx-row tx-row-pick' : 'tx-row'}>
      <Wrap className="tx-row-inner" {...pick}>
        <TxIcon tx={tx} />
        <div className="grow">
          <p className="name">{cleanName(tx.merchant)}</p>
          <p className="small muted tx-meta">
            {!mine && owner && (
              <span className="tx-owner">
                <Avatar member={owner} small />
                {nameOf(owner)}
              </span>
            )}
            <span>{details(tx, showDate)}</span>
            {/* Phones (#97, A): the bank sits next to the category, so the
                merchant name keeps its room; web shows it under the amount. */}
            {showBank && tx.bank_name && (
              <span className="tx-bank-inline">
                {' · '}
                {tx.bank_name}
                {tx.account_mask && ` ••${tx.account_mask}`}
              </span>
            )}
          </p>
        </div>
        <span className="tx-amount">
          {/* Money out in plain text, money in green: spending isn't an alarm. */}
          <span className={shown > 0 ? 'amount money-in' : 'amount'}>
            {shown > 0 ? '+' : shown < 0 ? '−' : ''}
            {formatMoney(Math.abs(shown), tx.currency)}
          </span>
          {showBank && tx.bank_name && (
            <span className="small muted tx-bank">
              {tx.bank_name}
              {tx.account_mask && ` ••${tx.account_mask}`}
            </span>
          )}
        </span>
      </Wrap>
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

// Bank descriptions often arrive in capitals with stray symbols
// ("CREDIT CARD 3333 PAYMENT *//"). Show them in sentence case without the
// clutter. Display only: the stored name is unchanged. Names that already
// have lower case ("Uber") are left alone.
const KEEP_CAPS = new Set(['ACH', 'ATM', 'CD', 'HSA', 'IRA', 'IRS', 'LLC', 'UPS', 'USA'])

export function cleanName(name = '') {
  if (/[a-z]/.test(name)) return name
  const words = name
    .replace(/[*/#\\|_]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
  const out = words.map((w) => (KEEP_CAPS.has(w) ? w : w.toLowerCase())).join(' ')
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : name
}
