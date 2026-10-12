import { useMemo, useRef, useState } from 'react'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { cleanName } from './TransactionRow.jsx'

// A year of spending as dots (#75, Dinesh's idea): one dot per day, redder on
// days with more spending, as twelve little months (Dinesh picked C): each
// month is a calendar block, seven days across starting Sunday.
// Days ahead are hollow. Hover, focus or tap a dot for that day's overview;
// clicking a spending day narrows the list to it. No labels: each dot
// names its date and amount for screen readers.
//
// Keyboard (#98): the year is one Tab stop. Arrows move a day (left, right)
// or a week (up, down), Home and End go to the start or end of the month,
// Page Up and Page Down move a month, Enter picks the day, Esc hides the card.

const LEVELS = ['day-dot-0', 'day-dot-1', 'day-dot-2', 'day-dot-3', 'day-dot-4']
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const longDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export default function SpendingDots({ year, days, home, selected, onPick }) {
  const [shown, setShown] = useState(null) // { key, left, top }
  const [active, setActive] = useState('') // the dot Tab lands on (#98)
  const box = useRef(null)
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

  // Each month: blanks up to the weekday of the 1st, then its days.
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => {
        const first = new Date(Number(year), m, 1, 12)
        const days = []
        for (let d = new Date(first); d.getMonth() === m; d.setDate(d.getDate() + 1)) days.push(new Date(d))
        return { name: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), lead: first.getDay(), days }
      }),
    [year],
  )

  // The one Tab stop: the last dot used, else the picked day, else today,
  // else 1 January.
  const inYear = (key) => key?.startsWith(`${year}-`)
  const stop = inYear(active) ? active : inYear(selected) ? selected : inYear(today) ? today : `${year}-01-01`

  const show = (key, el) => {
    const r = el.getBoundingClientRect()
    const b = box.current.getBoundingClientRect()
    const left = Math.max(0, Math.min(r.left - b.left - 116, b.width - 240))
    setShown({ key, left, top: r.bottom - b.top + 8 })
  }

  // Phones (#97): ‹ › on the day card step to the day before or after, so a
  // missed tap on a small dot is easy to correct. Stays within the year.
  const step = (delta) => {
    const d = new Date(`${shown.key}T12:00:00`)
    d.setDate(d.getDate() + delta)
    const el = box.current?.querySelector(`[data-key="${iso(d)}"]`)
    if (!el) return
    show(iso(d), el)
    setActive(iso(d))
    el.focus({ preventScroll: true })
  }

  // Arrows, Home/End and Page Up/Down move between days, within the year.
  const keyDown = (e) => {
    if (e.key === 'Escape' && shown) {
      e.preventDefault()
      setShown(null)
      if (!e.target.dataset.key) box.current?.querySelector(`[data-key="${shown.key}"]`)?.focus({ preventScroll: true })
      return
    }
    const from = e.target.dataset.key
    if (!from || e.altKey || e.ctrlKey || e.metaKey) return
    const d = new Date(`${from}T12:00:00`)
    const end = (y, m) => new Date(y, m + 1, 0).getDate()
    const month = (delta) => {
      const day = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + delta)
      d.setDate(Math.min(day, end(d.getFullYear(), d.getMonth())))
    }
    const moves = {
      ArrowLeft: () => d.setDate(d.getDate() - 1),
      ArrowRight: () => d.setDate(d.getDate() + 1),
      ArrowUp: () => d.setDate(d.getDate() - 7),
      ArrowDown: () => d.setDate(d.getDate() + 7),
      Home: () => d.setDate(1),
      End: () => d.setDate(end(d.getFullYear(), d.getMonth())),
      PageUp: () => month(-1),
      PageDown: () => month(1),
    }
    if (!moves[e.key]) return
    e.preventDefault()
    moves[e.key]()
    const key = iso(d) < `${year}-01-01` ? `${year}-01-01` : iso(d) > `${year}-12-31` ? `${year}-12-31` : iso(d)
    setActive(key)
    box.current?.querySelector(`[data-key="${key}"]`)?.focus()
  }
  // Keep the card while focus moves onto its own buttons.
  const blur = (e) => {
    if (!e.relatedTarget?.closest?.('.dots-card')) setShown(null)
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
    <div className="dots" ref={box} onMouseLeave={() => setShown(null)} onKeyDown={keyDown}>
      <div className="dots-months" role="group" aria-label={`Your spending by day in ${year}. Use the arrow keys to move between days.`}>
        {months.map((month) => (
          <div key={month.name} className="dots-month" role="group" aria-label={month.name}>
            {Array.from({ length: month.lead }, (_, i) => (
              <span key={i} className="day-dot day-dot-blank" aria-hidden="true" />
            ))}
            {month.days.map((d) => {
              const key = iso(d)
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
                  tabIndex={key === stop ? 0 : -1}
                  onMouseEnter={(e) => show(key, e.currentTarget)}
                  data-key={key}
                  onFocus={(e) => {
                    setActive(key)
                    show(key, e.currentTarget)
                  }}
                  onBlur={blur}
                  onClick={(e) => (ahead || !day ? show(key, e.currentTarget) : onPick(selected === key ? '' : key))}
                />
              )
            })}
          </div>
        ))}
      </div>
      {card && (
        <div className="dots-card" style={{ left: shown.left, top: shown.top }} role="tooltip">
          <div className="dots-card-step">
            <button type="button" aria-label="Day before" onClick={() => step(-1)} onBlur={blur}>
              ‹
            </button>
            <button type="button" aria-label="Day after" onClick={() => step(1)} onBlur={blur}>
              ›
            </button>
          </div>
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
