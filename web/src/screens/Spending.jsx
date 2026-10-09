import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { categoryLabel, formatMoney } from '../lib/money.js'

// Money out by category this month (#9). Currencies stay separate until
// conversion exists (#11). Budgets come with #13.
export default function Spending({ householdId, refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/spending?household_id=${encodeURIComponent(householdId)}`).then(setData, () =>
      setError("We couldn't load your spending."),
    )
  }, [householdId, refreshKey])

  if (error) return <p className="error">{error}</p>
  if (!data) return null

  const byCurrency = {}
  for (const s of data.spending) (byCurrency[s.currency] ||= []).push(s)

  return (
    <>
      <h2>Spending this month</h2>
      {data.spending.length === 0 && <p className="muted">No spending yet this month.</p>}
      {Object.entries(byCurrency).map(([currency, rows]) => {
        const max = Math.max(...rows.map((r) => r.amount_minor))
        const total = rows.reduce((sum, r) => sum + r.amount_minor, 0)
        return (
          <div className="spending" key={currency}>
            <p className="muted">
              Total <span className="amount">{formatMoney(total, currency)}</span>
            </p>
            <ul>
              {rows.map((r) => (
                <li key={r.category}>
                  <div className="spending-row">
                    <span>{categoryLabel(r.category)}</span>
                    <span className="amount">{formatMoney(r.amount_minor, currency)}</span>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <div style={{ width: `${Math.max(2, (r.amount_minor / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </>
  )
}
