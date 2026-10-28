import { useId, useState } from 'react'

// Picks a month, or none (#14, Dinesh picked the mix of the month draft):
// a field that reads in words ("June 2027 · 8 months away"), opening a panel
// with quick picks on top of a year-by-year month grid. Same look in every
// browser, unlike <input type="month">. value is "YYYY-MM" or "".

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const QUICK = [
  ['No date', 0],
  ['6 months', 6],
  ['1 year', 12],
  ['2 years', 24],
]
const YEARS_AHEAD = 10

const index = (iso) => +iso.slice(0, 4) * 12 + (+iso.slice(5, 7) - 1)
const toValue = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

export function awayWords(n) {
  if (n < 0) return 'passed'
  if (n === 0) return 'this month'
  if (n % 12 === 0) return `${n / 12} ${n === 12 ? 'year' : 'years'} away`
  return `${n} ${n === 1 ? 'month' : 'months'} away`
}

export default function MonthPicker({ label, value, onChange, today }) {
  const id = useId()
  const now = index(today)
  const picked = value ? index(value) : null
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Math.floor((picked ?? now + 1) / 12))
  const first = Math.floor((now + 1) / 12)

  const set = (i) => {
    onChange(i == null ? '' : toValue(i))
    if (i != null) setYear(Math.floor(i / 12))
  }
  const close = (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault() // keep the dialog open
    e.stopPropagation()
    setOpen(false)
    document.getElementById(`${id}-field`)?.focus()
  }

  return (
    <div className="month-picker">
      <span className="month-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        id={`${id}-field`}
        className="month-field"
        aria-labelledby={`${id}-label ${id}-field`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(!open)}
      >
        {picked == null ? (
          <span className="month-empty">Any time</span>
        ) : (
          <span>
            {LONG[picked % 12]} {Math.floor(picked / 12)} <span className="month-away">· {awayWords(picked - now)}</span>
          </span>
        )}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
      {open && (
        <div className="month-panel" id={`${id}-panel`} role="group" aria-label={label} onKeyDown={close}>
          <div className="month-quick">
            {QUICK.map(([name, n]) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={n === 0 ? picked == null : picked === now + n}
                onClick={() => set(n === 0 ? null : now + n)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="month-year">
            <button type="button" className="month-step" aria-label="Previous year" disabled={year <= first} onClick={() => setYear(year - 1)}>
              ‹
            </button>
            <strong aria-live="polite">{year}</strong>
            <button type="button" className="month-step" aria-label="Next year" disabled={year >= first + YEARS_AHEAD} onClick={() => setYear(year + 1)}>
              ›
            </button>
          </div>
          <div className="month-grid">
            {SHORT.map((name, m) => {
              const i = year * 12 + m
              return (
                <button
                  key={name}
                  type="button"
                  className="month-cell"
                  aria-label={`${LONG[m]} ${year}`}
                  aria-pressed={picked === i}
                  disabled={i <= now}
                  onClick={() => {
                    set(i)
                    setOpen(false)
                  }}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
