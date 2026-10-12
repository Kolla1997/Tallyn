import { useState } from 'react'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { cleanName } from './TransactionRow.jsx'
import TxIcon from './TxIcon.jsx'
import TallynLoader from './TallynLoader.jsx'

// The Transactions page's right column (#58): a summary of whatever is
// filtered, or the details of the transaction you picked.

// Ring colours, top four categories then Other. Flat brand colours only.
const RING = ['var(--color-clay-deep)', 'var(--color-sage-deep)', 'var(--color-cocoa)', 'var(--color-sage-light)']
const OTHER = 'var(--color-sand)'

// The space inside the ring is about 76 of the drawing's 140 units. Shrink
// long text (big totals, long names) so it always fits; ~0.6em per character.
const INSIDE = 76
const fit = (text, max) => Math.min(max, INSIDE / (String(text).length * 0.6))

export function TxSummary({ totals, scope, month, day }) {
  if (!totals) {
    return (
      <section className="panel">
        {totals === null ? <TallynLoader small /> : <p className="small muted">Nothing to add up for these filters.</p>}
      </section>
    )
  }
  const cur = totals.currency
  return (
    <div className="tx-summary">
      <section className="panel" aria-labelledby="sum-h">
        <div className="panel-head">
          <h2 id="sum-h">{scope}</h2>
        </div>
        <div className="have-owe">
          <div className="tone-sage">
            <span className="small">Money in</span>
            <span className="amount money-in">+{formatMoney(totals.money_in_minor, cur)}</span>
          </div>
          <div className="tone-clay">
            <span className="small">Spent</span>
            <span className="amount">{formatMoney(totals.spent_minor, cur)}</span>
          </div>
        </div>
        {totals.transfers_minor > 0 && (
          <p className="small muted">Transfers and loan payments ({formatMoney(totals.transfers_minor, cur)}) aren&apos;t counted as spending.</p>
        )}
      </section>

      <CategoryRing categories={totals.categories} spent={totals.spent_minor} cur={cur} month={month} day={day} />

      {totals.merchants.length > 0 && (
        <section className="panel" aria-labelledby="merch-h">
          <div className="panel-head">
            <h2 id="merch-h">Top merchants</h2>
          </div>
          <ul className="rows">
            {totals.merchants.map((m) => (
              <li key={m.merchant}>
                <span className="grow">
                  <span className="name block">{cleanName(m.merchant)}</span>
                  <span className="small muted block">
                    {m.count} {m.count === 1 ? 'purchase' : 'purchases'}
                  </span>
                </span>
                <span className="amount">{formatMoney(m.amount_minor, cur)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// Spending by category as a ring: total in the middle, a legend with each
// category's share. Top four get their own colour; the rest are Other.
// Hover a colour or its legend entry (or tap, or focus it) to see that
// category in the middle; the others fade back.
function CategoryRing({ categories, spent, cur, month, day }) {
  const [active, setActive] = useState(null) // label of the highlighted category
  const top = categories
    .slice(0, RING.length)
    .map((c, i) => ({ label: categoryLabel(c.category), amount: c.amount_minor, count: c.count, color: RING[i] }))
  const rest = categories.slice(RING.length)
  if (rest.length > 0) {
    top.push({
      label: 'Other',
      amount: rest.reduce((t, c) => t + c.amount_minor, 0),
      count: rest.reduce((t, c) => t + c.count, 0),
      color: OTHER,
    })
  }
  const shown = top.find((c) => c.label === active)
  const tag = day
    ? new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : month ? new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short' }) : 'All time'
  const R = 52
  const C = 2 * Math.PI * R
  const GAP = top.length > 1 ? 6 : 0
  let offset = 0
  const pct = (v) => {
    const p = (v / spent) * 100
    return p < 1 ? '<1%' : `${Math.round(p)}%`
  }

  return (
    <section className="panel" aria-labelledby="cat-h">
      <div className="panel-head">
        <h2 id="cat-h">By category</h2>
        <span className="tag">{tag}</span>
      </div>
      {spent <= 0 ? (
        <p className="small muted">No spending here.</p>
      ) : (
        <div className="ring-wrap">
          <svg width="180" height="180" viewBox="0 0 140 140" role="img" aria-label={`Spending by category, ${formatMoney(spent, cur)} in total`}>
            {top.map((c) => {
              const share = (c.amount / spent) * C
              const len = Math.max(share - GAP, 1)
              const seg = (
                <circle
                  key={c.label}
                  className={active && active !== c.label ? 'ring-seg ring-dim' : 'ring-seg'}
                  onMouseEnter={() => setActive(c.label)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive(active === c.label ? null : c.label)}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  style={{ stroke: c.color }}
                  strokeWidth="16"
                  strokeLinecap={top.length > 1 ? 'round' : 'butt'}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              )
              offset += share
              return seg
            })}
            {shown ? (
              <>
                <text x="70" y="56" textAnchor="middle" className="ring-label" fontSize={fit(shown.label, 11)}>
                  {shown.label}
                </text>
                <text x="70" y="76" textAnchor="middle" className="ring-total" fontSize={fit(formatMoney(shown.amount, cur), 17)}>
                  {formatMoney(shown.amount, cur)}
                </text>
                <text x="70" y="93" textAnchor="middle" className="ring-label" fontSize={fit(`${pct(shown.amount)} · ${shown.count} purchases`, 10)}>
                  {pct(shown.amount)} · {shown.count} {shown.count === 1 ? 'purchase' : 'purchases'}
                </text>
              </>
            ) : (
              <>
                <text x="70" y="64" textAnchor="middle" className="ring-label" fontSize="11">
                  Total spent
                </text>
                <text x="70" y="84" textAnchor="middle" className="ring-total" fontSize={fit(formatMoney(spent, cur), 17)}>
                  {formatMoney(spent, cur)}
                </text>
              </>
            )}
          </svg>
          <ul className="ring-legend">
            {top.map((c) => (
              <li key={c.label}>
                <button
                  type="button"
                  className={active && active !== c.label ? 'ring-key ring-dim' : 'ring-key'}
                  aria-label={`${c.label}: ${formatMoney(c.amount, cur)}, ${pct(c.amount)}, ${c.count} ${c.count === 1 ? 'purchase' : 'purchases'}`}
                  onMouseEnter={() => setActive(c.label)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(c.label)}
                  onBlur={() => setActive(null)}
                >
                  <span className="small muted block">{c.label}</span>
                  <span className="ring-pct">
                    <span className="ring-tick" style={{ background: c.color }} aria-hidden="true" />
                    {pct(c.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// One transaction in full. Time and place only show when the API returned
// them, i.e. when you may see them (#28).
export function TxDetails({ tx, meId, people, onBack, onMerchant }) {
  const shown = -tx.amount_minor
  const w = tx.whereabouts
  const when = w?.authorized_at || w?.posted_at
  const day = new Date(`${tx.authorized_date || tx.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const time = when && new Date(when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const place = [w?.city, [w?.region, w?.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const hasPlace = Boolean(w?.address || place || (w?.lat != null && w?.lon != null))
  const owner = tx.owner_user_id === meId ? 'You' : nameOf(people[tx.owner_user_id] ?? { user_id: tx.owner_user_id })
  const name = cleanName(tx.merchant)

  return (
    <section className="panel tx-details" aria-labelledby="tx-details-h">
      <button className="link small tx-back" onClick={onBack}>
        ← Back to summary
      </button>
      <div className="tx-details-head">
        <TxIcon tx={tx} />
        <h2 id="tx-details-h" className="grow">
          {name}
        </h2>
        <span className={shown > 0 ? 'amount money-in' : 'amount'}>
          {shown > 0 ? '+' : shown < 0 ? '−' : ''}
          {formatMoney(Math.abs(shown), tx.currency)}
        </span>
      </div>
      <dl className="kv">
        <dt>When</dt>
        <dd>
          {day}
          {time && ` · ${time}`}
          {tx.pending && ' · pending'}
        </dd>
        <dt>Who</dt>
        <dd>{owner}</dd>
        {tx.account_name && (
          <>
            <dt>Account</dt>
            <dd>{tx.account_name}</dd>
          </>
        )}
        <dt>Category</dt>
        <dd>{tx.category_primary ? categoryLabel(tx.category_primary) : 'Other'}</dd>
      </dl>
      {hasPlace ? (
        <div className="tx-place">
          <div className="tx-address">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            <span>
              {w.address && <span className="block">{w.address}</span>}
              {place && <span className="block">{place}</span>}
              {w.store_number && <span className="block small muted">Store #{w.store_number}</span>}
            </span>
          </div>
          <a className="btn btn-secondary btn-small tx-maps" href={mapsLink(w, name)} target="_blank" rel="noreferrer noopener">
            Open in Maps
          </a>
          <p className="small muted">Opens your maps app. Tallyn doesn&apos;t send the location anywhere until you tap.</p>
        </div>
      ) : (
        <p className="small muted">No location for this one.</p>
      )}
      <button className="link small" onClick={() => onMerchant(tx.merchant)}>
        All {name} transactions
      </button>
    </section>
  )
}

// A link to the place in the person's maps app: Apple Maps on Apple devices,
// Google Maps elsewhere. Coordinates when the bank gave them, else the address.
function mapsLink(w, name) {
  const coords = w.lat != null && w.lon != null ? `${w.lat},${w.lon}` : null
  const text = [w.address, w.city, w.region, w.postal_code].filter(Boolean).join(', ') || name
  if (/Mac|iPhone|iPad/.test(navigator.userAgent)) {
    const p = new URLSearchParams({ q: name })
    if (coords) p.set('ll', coords)
    else p.set('address', text)
    return `https://maps.apple.com/?${p}`
  }
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: coords ?? text })}`
}
