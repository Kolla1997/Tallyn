import { useEffect, useMemo, useRef, useState } from 'react'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { cleanName } from './TransactionRow.jsx'

// A year of spending as dots (#75, Dinesh's idea): one dot per day, seven rows
// (Sunday to Saturday) by about 53 weeks, redder on days with more spending.
// Days ahead are hollow. Hover, focus or tap a dot for that day's overview;
// clicking a spending day narrows the list to it. No labels: each dot
// names its date and amount for screen readers.

const LEVELS = ['day-dot-0', 'day-dot-1', 'day-dot-2', 'day-dot-3', 'day-dot-4']
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const longDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export default function SpendingDots({ year, days, home, selected, onPick }) {
  const [shown, setShown] = useState(null) // { key, left, top }
  const box = useRef(null)
  const scroller = useRef(null)
  const today = iso(new Date())

  const byDay = useMemo(() => Object.fromEntries((days ?? []).filter((d) => d.currency === home).map((d) => [d.date, d])), [days, home])

  // Four shades by quartile of this year's spending days, so every family's
  // scale reads well, from a few dollars to thousands.
  const level = useMemo(() => {
    const amounts = Object.values(byDay)
      .map((d) => d.amount_minor)
      .sort((a, b) => a - b)
    const q = (p) => amounts[Math.min(amounts.length - 1, Math.floor(p * amounts.length))] ?? 0
    const cuts = [q(0.25), q(0.5), q(0.75)]
    return (v) => (!v ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4)
  }, [byDay])

  // Every day of the year, starting on the Sunday on or before Jan 1.
  const cells = useMemo(() => {
    const first = new Date(Number(year), 0, 1, 12)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
    const out = []
    for (let i = 0; i < 54 * 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      if (d.getFullYear() > Number(year) && d.getDay() === 0) break
      out.push(d)
    }
    return out
  }, [year])

  // Phones: start scrolled to the current month.
  useEffect(() => {
    const el = scroller.current
    if (el && el.scrollWidth > el.clientWidth) {
      const week = Math.floor(cells.findIndex((d) => iso(d) === today) / 7)
      el.scrollLeft = Math.max(0, week * 11 - el.clientWidth / 2)
    }
  }, [cells, today])

  const show = (key, el) => {
    const r = el.getBoundingClientRect()
    const b = box.current.getBoundingClientRect()
    const left = Math.min(Math.max(0, r.left - b.left - 110), b.width - 250)
    setShown({ key, left, top: r.bottom - b.top + 8 })
  }

  const card = shown && cardFor(shown.key, byDay[shown.key], shown.key > today)

  function cardFor(key, day, ahead) {
    const date = longDate(new Date(`${key}T12:00:00`))
    if (ahead) return { date, line: 'Still ahead', top: [], more: 0 }
    if (!day) return { date, line: 'Nothing spent', top: [], more: 0 }
    return {
      date,
      line: `${formatMoney(day.amount_minor, day.currency)} spent · ${day.count} ${day.count === 1 ? 'purchase' : 'purchases'}`,
      top: day.top,
      more: day.count - day.top.length,
      currency: day.currency,
      link: true,
    }
  }

  return (
    <div className="dots" ref={box} onMouseLeave={() => setShown(null)}>
      <div className="dots-scroll" ref={scroller}>
        <div className="dots-grid" role="group" aria-label={`Your spending by day in ${year}`}>
          {cells.map((d) => {
            const key = iso(d)
            if (d.getFullYear() !== Number(year)) return <span key={key} className="day-dot day-dot-blank" aria-hidden="true" />
            const ahead = key > today
            const day = byDay[key]
            const label = `${longDate(d)}, ${ahead ? 'still ahead' : day ? `${formatMoney(day.amount_minor, day.currency)} spent` : 'nothing spent'}`
            return (
              <button
                key={key}
                type="button"
                className={`day-dot ${ahead ? 'day-dot-ahead' : LEVELS[level(day?.amount_minor)]}${selected === key ? ' day-dot-selected' : ''}`}
                aria-label={label}
                aria-pressed={selected === key}
                onMouseEnter={(e) => show(key, e.currentTarget)}
                onFocus={(e) => show(key, e.currentTarget)}
                onBlur={() => setShown(null)}
                onClick={(e) => (ahead || !day ? show(key, e.currentTarget) : onPick(selected === key ? '' : key))}
              />
            )
          })}
        </div>
      </div>
      {card && (
        <div className="dots-card" style={{ left: shown.left, top: shown.top }} role="tooltip">
          <p className="dots-card-date">{card.date}</p>
          <p className="small muted">{card.line}</p>
          {card.top.map((t, i) => (
            <div key={i} className="dots-card-row">
              <span className="grow">
                <span className="block">{cleanName(t.merchant)}</span>
                {t.category && <span className="small muted block">{categoryLabel(t.category)}</span>}
              </span>
              <span className="amount">−{formatMoney(t.amount_minor, card.currency)}</span>
            </div>
          ))}
          {card.more > 0 && <p className="small muted">+ {card.more} more</p>}
          {card.link && <p className="small dots-card-link">Click the dot to see this day&apos;s transactions</p>}
        </div>
      )}
    </div>
  )
}
