import { useMemo, useState } from 'react'
import { formatMoney } from '../lib/money.js'

// Spending by day in the calm redesign (#187; Dinesh picked the mix in #185): one bar per day of
// a month, as tall and as red as that day's spending, a dashed line for the daily average, and
// three facts beside it. Pointing at a day shows its amount; picking one narrows the list to it
// (picking it again shows every day). A day far above the rest (a bills day) is capped and
// labelled so it doesn't flatten the others. Every day is a button that names its date and amount.

const SHADES = ['var(--color-redesign-spend-1)', 'var(--color-redesign-spend-2)', 'var(--color-redesign-spend-3)', 'var(--color-redesign-spend-4)']
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const label = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export default function SpendingBars({ month, days, home, selected, onPick }) {
  const [pointed, setPointed] = useState('')
  const money = (v) => formatMoney(v, home)
  const { list, total, avg, cap, biggest, quietest, level } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const byDay = Object.fromEntries((days ?? []).filter((d) => d.currency === home && d.date.startsWith(month)).map((d) => [d.date, d.amount_minor]))
    const today = iso(new Date())
    const list = []
    for (let d = new Date(y, m - 1, 1, 12); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
      const key = iso(d)
      list.push({ key, amount: byDay[key] ?? 0, future: key > today })
    }
    const spent = list.filter((d) => !d.future && d.amount > 0)
    const total = spent.reduce((t, d) => t + d.amount, 0)
    const past = list.filter((d) => !d.future).length || 1
    const avg = Math.round(total / past)
    const sorted = spent.map((d) => d.amount).sort((a, b) => a - b)
    // The bar scale ignores one far-off day, so a bills day doesn't flatten the month.
    const cap = Math.max(sorted.at(-2) ?? sorted.at(-1) ?? 1, avg * 2, 1)
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
    const cuts = [q(0.25), q(0.5), q(0.75)]
    const level = (v) => (v <= cuts[0] ? 0 : v <= cuts[1] ? 1 : v <= cuts[2] ? 2 : 3)
    const biggest = spent.reduce((a, d) => (!a || d.amount > a.amount ? d : a), null)
    const quietest = spent.reduce((a, d) => (!a || d.amount < a.amount ? d : a), null)
    return { list, total, avg, cap, biggest, quietest, level }
  }, [month, days, home])

  const read = pointed || selected
  const readDay = list.find((d) => d.key === read)
  const monthName = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long' })

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
      <div className="min-w-0">
        <h2 className="m-0 font-[family-name:var(--font-heading)] text-[15px] font-semibold">Spending by day</h2>
        <p aria-live="polite" className="m-0 text-[13px] text-zinc-500 tabular-nums">
          {readDay ? (
            <>
              <b className="font-semibold text-zinc-900">{label(readDay.key)}</b> · {money(readDay.amount)} spent
            </>
          ) : (
            `${money(total)} spent in ${monthName} so far · taller, redder days spent more`
          )}
        </p>
        <div className="relative mt-6 flex h-28 items-end gap-[3px]" onMouseLeave={() => setPointed('')}>
          <span
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-zinc-400"
            style={{ bottom: `${Math.min(100, (avg / cap) * 100)}%` }}
            aria-hidden="true"
          />
          {list.map((d) => {
            const capped = d.amount > cap
            const on = selected === d.key
            return (
              <button
                key={d.key}
                type="button"
                disabled={d.future || !d.amount}
                aria-pressed={d.amount ? on : undefined}
                aria-label={d.future ? `${label(d.key)}: still to come` : `${label(d.key)}: ${money(d.amount)}`}
                onMouseEnter={() => !d.future && setPointed(d.key)}
                onFocus={() => !d.future && setPointed(d.key)}
                onBlur={() => setPointed('')}
                onClick={() => onPick(on ? '' : d.key)}
                className="relative flex h-full flex-1 items-end border-0 bg-transparent p-0"
              >
                {capped && (
                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full font-[family-name:var(--font-heading)] text-[11px] font-semibold whitespace-nowrap tabular-nums">
                    {money(d.amount)}
                  </span>
                )}
                <span
                  className={`block w-full rounded-t-[3px] ${on ? 'outline-2 outline-offset-1 outline-zinc-900' : ''}`}
                  style={
                    d.future || !d.amount
                      ? { height: 4, background: 'var(--color-redesign-track)' }
                      : { height: `${Math.max(4, (Math.min(d.amount, cap) / cap) * 100)}%`, background: SHADES[level(d.amount)] }
                  }
                />
              </button>
            )
          })}
        </div>
        <div className="mt-1 flex text-[12px] text-zinc-500" aria-hidden="true">
          {list.map((d, i) => (
            <span key={d.key} className="flex-1 whitespace-nowrap">
              {[0, 7, 14, 21, 28].includes(i) ? label(d.key).split(', ')[1] : ''}
            </span>
          ))}
        </div>
        <p className="m-0 mt-2 text-[13px] text-zinc-500">
          {selected ? 'Showing that day below. Pick it again to see every day.' : 'Pick a day to see its spending below.'}
        </p>
      </div>
      <dl className="m-0 grid content-start gap-2.5 text-[13px] sm:border-l sm:border-zinc-200 sm:pl-4">
        <div>
          <dt className="text-zinc-500">A day, on average</dt>
          <dd className="m-0 font-[family-name:var(--font-heading)] text-[16px] font-semibold tabular-nums">{money(avg)}</dd>
        </div>
        {biggest && (
          <div>
            <dt className="text-zinc-500">Biggest day</dt>
            <dd className="m-0 font-semibold tabular-nums" style={{ color: 'var(--color-redesign-owe-text)' }}>
              {money(biggest.amount)} <span className="font-normal text-zinc-500">· {label(biggest.key)}</span>
            </dd>
          </div>
        )}
        {quietest && (
          <div>
            <dt className="text-zinc-500">Quietest day</dt>
            <dd className="m-0 font-semibold tabular-nums">
              {money(quietest.amount)} <span className="font-normal text-zinc-500">· {label(quietest.key)}</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
