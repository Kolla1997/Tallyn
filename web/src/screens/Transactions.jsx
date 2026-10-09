import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'

// Recent transactions (#9). Time and place appear only when the bank sent
// them and this person may see them (their own, or an owner seeing a teen's
// or child's); the API leaves them out otherwise.
export default function Transactions({ householdId, refreshKey }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/transactions?household_id=${encodeURIComponent(householdId)}&limit=50`).then(
      (d) => setList(d.transactions),
      () => setError("We couldn't load your transactions."),
    )
  }, [householdId, refreshKey])

  if (error) return <p className="error">{error}</p>
  if (!list) return null

  return (
    <>
      <h2>Recent transactions</h2>
      {list.length === 0 && (
        <p className="muted">No transactions yet. New banks can take a few minutes to show their history.</p>
      )}
      <ul className="transactions">
        {list.map((t) => {
          // Plaid's sign is positive for money out; show money out as negative.
          const shown = -t.amount_minor
          return (
            <li key={t.id}>
              <div className="tx-main">
                <span className="tx-merchant">{t.merchant}</span>
                <span className={`amount ${shown < 0 ? 'money-out' : 'money-in'}`}>
                  {shown > 0 ? '+' : ''}
                  {formatMoney(shown, t.currency)}
                </span>
              </div>
              <div className="tx-meta muted">{describe(t)}</div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function describe(t) {
  const parts = []
  const w = t.whereabouts
  const when = w?.authorized_at || w?.posted_at
  const day = new Date(`${t.authorized_date || t.date}T12:00:00`)
  parts.push(day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  if (when) parts.push(new Date(when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
  const place = [w?.city, w?.region].filter(Boolean).join(', ')
  if (place) parts.push(place)
  if (t.payment_channel) parts.push(t.payment_channel)
  parts.push(t.account_name)
  if (t.pending) parts.push('pending')
  return parts.join(' · ')
}
