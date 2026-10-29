import { useRef } from 'react'
import { ArrowLeft, MapPin } from 'lucide-react'
import { useTakeover } from '../lib/takeover.js'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { cleanName } from './TransactionRow.jsx'
import TxIcon from './TxIcon.jsx'
import TallynLoader from './TallynLoader.jsx'
import CountUp from './CountUp.jsx'
import { Panel, Rows, NUM, MUTED, IN } from './calm/ui.jsx'

// The Transactions page's right column (#58), in the calm redesign (#187, the #185 draft): a
// summary of whatever is filtered (money in and spent, top merchants, spending by category as
// bars with their shares), or the details of the transaction you picked.

export function TxSummary({ totals, scope }) {
  if (!totals) {
    return (
      <Panel label="Summary">{totals === null ? <TallynLoader small /> : <p className={`text-[13px] ${MUTED}`}>Nothing to add up for these filters.</p>}</Panel>
    )
  }
  const cur = totals.currency
  const cats = totals.categories ?? []
  const top = cats[0]?.amount_minor || 1
  const pct = (v) => {
    const p = (v / (totals.spent_minor || 1)) * 100
    return p < 1 ? '<1%' : `${Math.round(p)}%`
  }
  return (
    <div className="grid gap-3">
      <Panel id="sum-h" title={scope} glass>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={`text-[13px] ${MUTED}`}>Money in</p>
            <p className={`text-[22px] ${NUM}`} style={IN}>
              <CountUp value={totals.money_in_minor} format={(v) => `+${formatMoney(v, cur)}`} />
            </p>
          </div>
          <div>
            <p className={`text-[13px] ${MUTED}`}>Spent</p>
            <p className={`text-[22px] ${NUM}`}>
              <CountUp value={totals.spent_minor} format={(v) => `−${formatMoney(v, cur)}`} />
            </p>
          </div>
        </div>
        {totals.transfers_minor > 0 && (
          <p className={`mt-2 text-[13px] ${MUTED}`}>
            Transfers and loan payments ({formatMoney(totals.transfers_minor, cur)}) aren&apos;t counted as spending.
          </p>
        )}
      </Panel>

      {totals.merchants?.length > 0 && (
        <Panel id="merch-h" title="Top merchants">
          <Rows>
            {totals.merchants.map((m) => (
              <li key={m.merchant} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{cleanName(m.merchant)}</span>
                  <span className={`block text-[13px] ${MUTED}`}>
                    {m.count} {m.count === 1 ? 'purchase' : 'purchases'}
                  </span>
                </span>
                <span className={`text-[14px] ${NUM}`}>{formatMoney(m.amount_minor, cur)}</span>
              </li>
            ))}
          </Rows>
        </Panel>
      )}

      {cats.length > 0 && (
        <Panel id="cat-h" title="By category">
          <ul aria-label="Categories" className="grid gap-2.5">
            {cats.map((c) => (
              <li key={c.category}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="font-semibold">{categoryLabel(c.category)}</span>
                  <span className="flex items-baseline gap-2">
                    <span className={`text-[13px] ${MUTED}`}>{pct(c.amount_minor)}</span>
                    <span className={NUM}>{formatMoney(c.amount_minor, cur)}</span>
                  </span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--color-redesign-track)' }} aria-hidden="true">
                  <span className="block h-full rounded-full bg-zinc-500" style={{ width: `${(c.amount_minor / top) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

export function TxDetails({ tx, meId, people, onBack, onMerchant }) {
  const shown = -tx.amount_minor
  const w = tx.whereabouts
  const when = w?.authorized_at || w?.posted_at
  const day = new Date(`${tx.authorized_date || tx.date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const time = when && new Date(when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const place = [w?.city, [w?.region, w?.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const hasPlace = Boolean(w?.address || place || (w?.lat != null && w?.lon != null))
  const owner = tx.owner_user_id === meId ? 'You' : nameOf(people[tx.owner_user_id] ?? { user_id: tx.owner_user_id })
  const name = cleanName(tx.merchant)
  // On phones the details cover the page (#153): focus moves in, and back to the row when they close.
  const panel = useRef(null)
  const heading = useRef(null)
  useTakeover(panel, heading, { key: tx.id })

  return (
    <section ref={panel} className="tx-details calm-solid rounded-2xl p-4" aria-labelledby="tx-details-h">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to summary
      </button>
      <div className="flex items-center gap-3">
        <TxIcon tx={tx} />
        <h2 ref={heading} id="tx-details-h" className="grow font-[family-name:var(--font-heading)] text-[18px] font-semibold" tabIndex={-1}>
          {name}
        </h2>
        <span className={`text-[18px] ${NUM}`} style={shown > 0 ? IN : undefined}>
          {shown > 0 ? '+' : shown < 0 ? '−' : ''}
          {formatMoney(Math.abs(shown), tx.currency)}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-[96px_1fr] gap-y-2 text-[14px]">
        <dt className={MUTED}>When</dt>
        <dd>
          {day}
          {time && ` · ${time}`}
          {tx.pending && ' · pending'}
        </dd>
        <dt className={MUTED}>Who</dt>
        <dd>{owner}</dd>
        {tx.account_name && (
          <>
            <dt className={MUTED}>Account</dt>
            <dd>{tx.account_name}</dd>
          </>
        )}
        <dt className={MUTED}>Category</dt>
        <dd>{tx.category_primary ? categoryLabel(tx.category_primary) : 'Other'}</dd>
      </dl>
      {hasPlace ? (
        <div className="mt-4 grid gap-2">
          <p className="flex items-start gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {w.address && <span className="block">{w.address}</span>}
              {place && <span className="block">{place}</span>}
              {w.store_number && <span className={`block ${MUTED}`}>Store #{w.store_number}</span>}
            </span>
          </p>
          <a
            className="inline-flex h-8 w-fit items-center rounded-full border border-zinc-300 dark:border-zinc-700 px-3 text-[13px] font-semibold"
            href={mapsLink(w, name)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open in Maps
          </a>
          <p className={`text-[13px] ${MUTED}`}>Opens your maps app. Coinroof doesn&apos;t send the location anywhere until you tap.</p>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          No location for this one.
        </p>
      )}
      <button
        type="button"
        onClick={() => onMerchant(tx.merchant)}
        className="mt-3 text-[13px] font-semibold text-zinc-900 dark:text-white underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4"
      >
        All {name} transactions
      </button>
    </section>
  )
}

// A link to the place in the person's maps app: Apple Maps on Apple devices, Google Maps
// elsewhere. Coordinates when the bank gave them, else the address.
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
