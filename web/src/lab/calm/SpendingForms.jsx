// Spending by day, four forms to compare (#185). Same idea and red scale as the activity grid,
// drawn to fill the card's width instead of fitting a square grid to its height. October's days
// are the draft's data (they add up to $3,486 in data.js); the weeks before October are made up.
import { useState } from 'react'
import * as D from '../home/data.js'
import { usd } from './ui.jsx'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// October 2026, day by day so far (Oct 1 carries the month's bills).
const OCT = D.series.slice(0, D.today).map((r, i, a) => ({ day: i + 1, amount: Math.round((r.spent - (i ? a[i - 1].spent : 0)) * 100) / 100 }))
console.assert(Math.abs(OCT.reduce((s, d) => s + d.amount, 0) - D.spent) < 0.01, 'October days add up to spent')
const date = (day) => new Date(Date.UTC(2026, 9, day))
const label = (d) => `${DOW[(d.getUTCDay() + 6) % 7]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`
const avg = Math.round(D.spent / D.today)
const iso = (d) => d.toISOString().slice(0, 10)
const SEL = 'ring-2 ring-zinc-900 ring-offset-1 dark:ring-white dark:ring-offset-zinc-900'
const biggest = OCT.reduce((a, b) => (b.amount > a.amount ? b : a))
const quietest = OCT.reduce((a, b) => (b.amount < a.amount ? b : a))

// 0 nothing, then up to $60, $100, $200, and more. Text colour flips where the red gets deep.
const level = (v) => (v <= 0 ? 0 : v < 60 ? 1 : v < 100 ? 2 : v < 200 ? 3 : 4)
const FILL = [
  'bg-zinc-100 dark:bg-zinc-800',
  'bg-[#fecaca] dark:bg-[#3b1414]',
  'bg-[#f87171] dark:bg-[#6b1d1d]',
  'bg-[#dc2626] dark:bg-[#b91c1c]',
  'bg-[#7f1d1d] dark:bg-[#f87171]',
]
const INK = ['text-zinc-500', 'text-zinc-900 dark:text-white', 'text-zinc-950 dark:text-white', 'text-white', 'text-white dark:text-zinc-950']

// Thirteen weeks to Oct 24 for the grid: made-up amounts before October, the real days after.
const WEEKS = (() => {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const end = date(24)
  const first = new Date(end)
  first.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7) - 12 * 7) // a Monday, 12 weeks back
  const days = []
  for (let d = new Date(first); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const inOct = d.getUTCMonth() === 9
    days.push({ d: new Date(d), amount: inOct ? OCT[d.getUTCDate() - 1].amount : Math.round(20 + rnd() * 120) })
  }
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7))
})()

function Legend() {
  return (
    <div className="flex items-center gap-1 text-[12px] text-zinc-500 dark:text-zinc-400">
      <span className="mr-1">Less</span>
      {FILL.map((f, i) => (
        <span key={i} className={`size-2.5 rounded-[3px] ${f}`} />
      ))}
      <span className="ml-1">More</span>
    </div>
  )
}
const Readout = ({ pick }) => (
  <p aria-live="polite" className="text-[13px] text-zinc-500 tabular-nums dark:text-zinc-400">
    {pick ? (
      <>
        <b className="font-semibold text-zinc-900 dark:text-white">{label(pick.d)}</b> · {usd(pick.amount, 0)} spent
      </>
    ) : (
      `${usd(D.spent, 0)} spent in October so far · redder days spent more`
    )}
  </p>
)

// 1 · The grid as it is, but its columns stretch to the card's width.
function WideGrid({ sel, onPick }) {
  const [pick, setPick] = useState(null)
  return (
    <>
      <Readout pick={pick} />
      <div className="mt-3 grid grid-cols-[28px_1fr] gap-x-2">
        <span />
        <div className="grid gap-[3px] text-[11px] text-zinc-500 dark:text-zinc-400" style={{ gridTemplateColumns: `repeat(${WEEKS.length}, 1fr)` }}>
          {WEEKS.map((w, i) => {
            const m = w[0].d.getUTCMonth()
            const show = i === 0 || WEEKS[i - 1][0].d.getUTCMonth() !== m
            return <span key={i}>{show ? MON[m] : ''}</span>
          })}
        </div>
        <div className="grid grid-rows-7 gap-[3px] text-[11px] text-zinc-500 dark:text-zinc-400">
          {DOW.map((d, i) => (
            <span key={d} className="leading-[18px]">
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>
        <div
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${WEEKS.length}, 1fr)` }}
          onMouseLeave={() => setPick(null)}
        >
          {WEEKS.flat().map((x) => (
            <button
              type="button"
              key={iso(x.d)}
              aria-label={`${label(x.d)}: ${usd(x.amount, 0)}`}
              aria-pressed={sel === iso(x.d)}
              onMouseEnter={() => setPick(x)}
              onFocus={() => setPick(x)}
              onClick={() => onPick(iso(x.d))}
              className={`h-[18px] rounded-[3px] ${FILL[level(x.amount)]} ${sel === iso(x.d) ? SEL : ''}`}
            />
          ))}
        </div>
      </div>
    </>
  )
}

// 2 · October as a calendar: every day shows what it cost.
function Calendar({ sel, onPick }) {
  const lead = (date(1).getUTCDay() + 6) % 7 // Oct 1 2026 is a Thursday
  const cells = [...Array(lead).fill(null), ...Array.from({ length: D.days }, (_, i) => i + 1)]
  return (
    <>
      <Readout />
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <li key={`e${i}`} aria-hidden="true" />
          const x = OCT[day - 1]
          if (!x)
            return (
              <li
                key={day}
                className="flex h-10 items-start rounded-md border border-dashed border-zinc-200 px-1.5 py-1 text-[11px] text-zinc-400 dark:border-zinc-800"
              >
                {day}
              </li>
            )
          const l = level(x.amount)
          return (
            <li key={day}>
              <button
                type="button"
                aria-label={`${label(date(day))}: ${usd(x.amount, 0)}`}
                aria-pressed={sel === iso(date(day))}
                onClick={() => onPick(iso(date(day)))}
                className={`flex h-10 w-full flex-col justify-between rounded-md px-1.5 py-1 text-left ${FILL[l]} ${INK[l]} ${sel === iso(date(day)) ? SEL : ''}`}
              >
                <span className="text-[11px] leading-none opacity-80">{day}</span>
                <span className="self-end font-[family-name:'Space_Grotesk'] text-[12px] leading-none font-semibold tabular-nums">{usd(x.amount, 0)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </>
  )
}

// 3 · One strip: October's 31 days in a single row, like a tally tape.
function Strip({ sel, onPick }) {
  const [pick, setPick] = useState(null)
  return (
    <>
      <Readout pick={pick} />
      <div className="mt-3 flex gap-[3px]" onMouseLeave={() => setPick(null)}>
        {Array.from({ length: D.days }, (_, i) => {
          const x = OCT[i]
          if (!x) return <span key={i} className="h-12 flex-1 rounded-[4px] border border-dashed border-zinc-200 dark:border-zinc-800" aria-hidden="true" />
          const d = date(i + 1)
          return (
            <button
              type="button"
              key={i}
              aria-label={`${label(d)}: ${usd(x.amount, 0)}`}
              aria-pressed={sel === iso(d)}
              onMouseEnter={() => setPick({ d, amount: x.amount })}
              onFocus={() => setPick({ d, amount: x.amount })}
              onClick={() => onPick(iso(d))}
              className={`h-12 flex-1 rounded-[4px] ${FILL[level(x.amount)]} ${sel === iso(d) ? SEL : ''}`}
            />
          )
        })}
      </div>
      <div className="mt-1 flex text-[11px] text-zinc-500 dark:text-zinc-400">
        {Array.from({ length: D.days }, (_, i) => (
          <span key={i} className="flex-1 whitespace-nowrap">
            {[1, 8, 15, 22, 29].includes(i + 1) ? `Oct ${i + 1}` : ''}
          </span>
        ))}
      </div>
    </>
  )
}

// 4 · Mix: the strip's single row, grown into bars so each day's size reads at a glance, the
// calendar's amount for the day you point at, the grid's red scale, and three facts beside it.
function Mix({ sel, onPick }) {
  const [pick, setPick] = useState(null)
  const CAP = 300 // Oct 1's bills ($1,495) would flatten every other day, so its bar is capped and labelled.
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_168px]">
      <div className="min-w-0">
        <Readout pick={pick} />
        <div className="relative mt-6 flex h-28 items-end gap-[3px]" onMouseLeave={() => setPick(null)}>
          <span
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-zinc-400 dark:border-zinc-500"
            style={{ bottom: `${(avg / CAP) * 100}%` }}
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute right-0 translate-y-full pt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400"
            style={{ bottom: `${(avg / CAP) * 100}%` }}
            aria-hidden="true"
          >
            avg {usd(avg, 0)}
          </span>
          {Array.from({ length: D.days }, (_, i) => {
            const x = OCT[i]
            const capped = x && x.amount > CAP
            return (
              <button
                type="button"
                key={i}
                disabled={!x}
                aria-label={x ? `${label(date(i + 1))}: ${usd(x.amount, 0)}` : `Oct ${i + 1}: still to come`}
                aria-pressed={x ? sel === iso(date(i + 1)) : undefined}
                onMouseEnter={() => x && setPick({ d: date(i + 1), amount: x.amount })}
                onFocus={() => x && setPick({ d: date(i + 1), amount: x.amount })}
                onClick={() => onPick(iso(date(i + 1)))}
                className="relative flex h-full flex-1 items-end"
              >
                {capped && (
                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full font-[family-name:'Space_Grotesk'] text-[10px] font-semibold whitespace-nowrap tabular-nums">
                    {usd(x.amount, 0)}
                  </span>
                )}
                <span
                  className={`block w-full rounded-t-[3px] ${x ? FILL[level(x.amount)] : 'h-1 bg-zinc-100 dark:bg-zinc-800'} ${x && sel === iso(date(i + 1)) ? SEL : ''} ${capped ? 'bg-[repeating-linear-gradient(0deg,transparent_0_6px,rgb(255_255_255/.35)_6px_8px)]' : ''}`}
                  style={x ? { height: `${Math.max(4, (Math.min(x.amount, CAP) / CAP) * 100)}%` } : undefined}
                />
              </button>
            )
          })}
        </div>
        <div className="mt-1 flex text-[11px] text-zinc-500 dark:text-zinc-400">
          {Array.from({ length: D.days }, (_, i) => (
            <span key={i} className="flex-1 whitespace-nowrap">
              {[1, 8, 15, 22, 29].includes(i + 1) ? `Oct ${i + 1}` : ''}
            </span>
          ))}
        </div>
      </div>
      <dl className="grid content-start gap-2.5 text-[13px] sm:border-l sm:border-zinc-100 sm:pl-4 dark:sm:border-zinc-800">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">A day, on average</dt>
          <dd className="font-[family-name:'Space_Grotesk'] text-base font-semibold tabular-nums">{usd(avg, 0)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Biggest day</dt>
          <dd className="font-semibold tabular-nums" style={{ color: 'var(--owe-text)' }}>
            {usd(biggest.amount, 0)} <span className="font-normal text-zinc-500 dark:text-zinc-400">· {label(date(biggest.day))}, bills</span>
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Quietest day</dt>
          <dd className="font-semibold tabular-nums">
            {usd(quietest.amount, 0)} <span className="font-normal text-zinc-500 dark:text-zinc-400">· {label(date(quietest.day))}</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

export const FORMS = [
  ['1', '1 · Wide grid', WideGrid],
  ['2', '2 · Calendar', Calendar],
  ['3', '3 · Strip', Strip],
  ['4', '4 · Mix', Mix],
]

export default function SpendingByDay({ sel = '', onPick = () => {} }) {
  const [form, setForm] = useState(() => {
    const f = new URLSearchParams(location.search).get('f')
    return FORMS.some(([k]) => k === f) ? f : '4'
  })
  const pickForm = (f) => {
    setForm(f)
    const u = new URL(location.href)
    u.searchParams.set('f', f)
    history.replaceState(null, '', u)
  }
  const Form = FORMS.find(([k]) => k === form)[2]
  return (
    <section aria-labelledby="spend-day-h" className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="spend-day-h" className="font-[family-name:'Space_Grotesk'] text-[15px] font-semibold">
          Spending by day
        </h2>
        <span
          role="group"
          aria-label="Draft: form"
          className="flex gap-1 rounded-full border border-dashed border-zinc-300 p-0.5 text-[12px] dark:border-zinc-700"
        >
          {FORMS.map(([k, name]) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === form}
              onClick={() => pickForm(k)}
              className="rounded-full px-2.5 py-0.5 font-semibold text-zinc-600 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:text-zinc-300 dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
            >
              {name}
            </button>
          ))}
        </span>
      </div>
      <Form sel={sel} onPick={(d) => onPick(d === sel ? '' : d)} />
      <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
        {sel ? 'Showing that day below. Pick it again to see every day.' : 'Pick a day to see its spending below.'}
      </p>
      <div className="mt-3 flex justify-end">
        <Legend />
      </div>
    </section>
  )
}
