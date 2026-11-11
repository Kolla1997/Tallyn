import { useRef, useState } from 'react'
import { Car, Check, Droplet, Flame, House, Plus, Wifi, X, Zap } from 'lucide-react'
import CountUp from '../components/CountUp.jsx'
import Heading from '../components/Heading.jsx'
import { loanPayment } from '../components/ManualLoan.jsx'
import { IconTile, Pill, MUTED, NUM, OWE, IN } from '../components/calm/ui.jsx'
import { api } from '../lib/api.js'
import { shiftMonth } from '../lib/bills.js'
import { toMinor } from '../lib/budgets.js'
import { formatMoney } from '../lib/money.js'

// Monthly commitments (#307), Dinesh's pick A4 of drafts/307-monthly-commitments-2.html: a skippable
// step straight after Create household, once, for the owner who created it. Chips add a payment; each
// one is edited as a sentence ("$1,850.00 a month, on day 1") and folds into a one-line row; a strip of
// 31 notches shows when in the month the money leaves; the total is last.
// Bills are saved as bills (#127) and a car loan as a manual loan (#306), with the endpoints those
// pages use. Nothing is saved until Save and continue, and a payment that saved is never sent twice.

export const KINDS = [
  { k: 'rent', name: 'Rent / Mortgage', icon: House, category: 'housing' },
  { k: 'electric', name: 'Electric', icon: Zap, category: 'utilities', varies: true },
  { k: 'gas', name: 'Gas', icon: Flame, category: 'utilities', varies: true },
  { k: 'water', name: 'Water', icon: Droplet, category: 'utilities', varies: true },
  { k: 'internet', name: 'Internet', icon: Wifi, category: 'utilities' },
  { k: 'car', name: 'Car loan', icon: Car, loan: true },
  { k: 'other', name: 'Other', icon: Plus, category: 'other', multi: true },
]
const KIND = Object.fromEntries(KINDS.map((k) => [k.k, k]))

const FIELD =
  'h-10 min-w-0 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-[14px] tabular-nums text-zinc-900 dark:text-white'
const PART = 'inline-flex items-center gap-1.5 whitespace-nowrap'
const X_BTN = `flex size-11 shrink-0 border-0 bg-transparent p-0 items-center justify-center rounded-lg lg:size-8 ${MUTED} hover:bg-zinc-100 dark:hover:bg-zinc-800`

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
export const ord = (d) => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th')

// A loan's four figures as numbers, or null until all four are filled in properly.
function loanOf(it, cur) {
  const principal = toMinor(it.principal, cur)
  const apr = Number(String(it.apr).replace('%', ''))
  const months = Number(it.months)
  const ok =
    principal > 0 &&
    it.apr.trim() !== '' &&
    apr >= 0 &&
    apr <= 100 &&
    Number.isInteger(months) &&
    months > 0 &&
    months <= 600 &&
    /^\d{4}-\d{2}-\d{2}$/.test(it.first)
  return ok ? { principal, apr, months } : null
}

// What a payment costs a month, in minor units (0 until it's filled in).
export function monthlyOf(it, cur) {
  if (!KIND[it.k].loan) return toMinor(it.amount, cur) ?? 0
  const l = loanOf(it, cur)
  return l ? loanPayment(l.principal, l.apr, l.months) : 0
}

// The day of the month it's due, 1–31 (0 until known).
export function dayOf(it) {
  const d = Number(KIND[it.k].loan ? it.first.slice(8, 10) : it.day)
  return Number.isInteger(d) && d >= 1 && d <= 31 ? d : 0
}

const ready = (it, cur) => (KIND[it.k].loan ? loanOf(it, cur) != null : it.name.trim() !== '' && monthlyOf(it, cur) > 0 && dayOf(it) > 0)

// A bill's first month ('YYYY-MM'): this month, or next month when its day has already passed, so a
// brand-new household doesn't open on a bill marked late.
export function startsOn(day, now) {
  const month = now.slice(0, 7)
  return day < Number(now.slice(8, 10)) ? shiftMonth(month, 1) : month
}

let nextId = 0
const blank = (k) => ({
  id: ++nextId,
  k,
  name: k === 'other' ? '' : KIND[k].name,
  amount: '',
  day: '',
  principal: '',
  apr: '',
  months: '',
  first: '',
  saved: false,
  failed: false,
})

export default function MonthlyCommitments({ household, onDone }) {
  const cur = household.home_currency
  const money = (v) => formatMoney(v, cur)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const list = useRef(null)

  const total = items.reduce((t, it) => t + monthlyOf(it, cur), 0)
  const failed = items.filter((it) => it.failed)
  const label = (it) => it.name.trim() || 'Something else'

  const focusOpen = () => setTimeout(() => list.current?.querySelector('[data-editor] input')?.focus(), 0)
  const edit = (id) => {
    setOpen(id)
    focusOpen()
  }
  const toggle = (k) => {
    setError('')
    const has = items.find((it) => it.k === k)
    if (has && !KIND[k].multi) {
      if (!has.saved) remove(has.id)
      return
    }
    const it = blank(k)
    setItems([...items, it])
    edit(it.id)
  }
  const remove = (id) => {
    setError('')
    setItems((all) => all.filter((it) => it.id !== id))
    if (open === id) setOpen(null)
  }
  const set = (id, key) => (e) => setItems((all) => all.map((it) => (it.id === id ? { ...it, [key]: e.target.value } : it)))

  const body = (it) => {
    if (KIND[it.k].loan) {
      const l = loanOf(it, cur)
      return [
        '/api/loans',
        {
          household_id: household.id,
          name: it.name,
          lender: '',
          principal_minor: l.principal,
          apr: String(l.apr),
          months: l.months,
          first_due: it.first,
          balance_minor: null,
        },
      ]
    }
    const day = dayOf(it)
    return [
      '/api/bills',
      {
        household_id: household.id,
        name: it.name.trim(),
        amount_minor: monthlyOf(it, cur),
        varies: Boolean(KIND[it.k].varies),
        frequency: 'monthly',
        due_day: day,
        starts_on: startsOn(day, today()),
        category: KIND[it.k].category,
        paused: false,
      },
    ]
  }

  const save = async () => {
    if (busy) return
    const unfinished = items.find((it) => !it.saved && !ready(it, cur))
    if (unfinished) {
      edit(unfinished.id)
      return setError(
        KIND[unfinished.k].loan
          ? 'Finish the car loan: the amount borrowed, interest, length and first payment. Or remove it.'
          : `Finish ${label(unfinished)}: ${unfinished.name.trim() ? '' : 'a name, '}the amount and the day it's due (1 to 31). Or remove it.`,
      )
    }
    setError('')
    setOpen(null)
    setBusy(true)
    const missed = []
    for (const it of items) {
      if (it.saved) continue
      const [path, payload] = body(it)
      let ok = true
      try {
        await api(path, { method: 'POST', body: payload })
      } catch {
        ok = false
        missed.push(label(it))
      }
      setItems((all) => all.map((x) => (x.id === it.id ? { ...x, saved: ok, failed: !ok } : x)))
    }
    if (!missed.length) return onDone()
    setBusy(false)
    setError(`We couldn't save ${missed.join(' and ')}. Try again, or continue and add ${missed.length > 1 ? 'them' : 'it'} later in Bills.`)
  }

  return (
    <section
      aria-labelledby="commitments-title"
      className="calm-card calm-glass w-full max-w-[600px] rounded-[22px] p-4 text-left text-[14px] text-zinc-900 sm:p-6 dark:text-white"
    >
      <Heading
        id="commitments-title"
        title="Monthly payments"
        className="m-0 text-balance font-[family-name:var(--font-heading)] text-[20px] leading-tight font-bold"
      >
        What do you pay every month that isn&apos;t in your bank feed?
      </Heading>
      <p className={`m-0 mt-1.5 text-[13px] ${MUTED}`}>
        Rent, utilities, a car loan. Add what you know now. Only household owners see these, and you can change them later in Bills.
      </p>

      <div role="group" aria-label="Quick add" className="mt-4 flex flex-wrap gap-2">
        {KINDS.map((k, i) => {
          const on = !k.multi && items.some((it) => it.k === k.k)
          const I = on ? Check : k.icon
          return (
            <button
              key={k.k}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => toggle(k.k)}
              style={{ '--d': `${200 + i * 50}ms` }}
              className="calm-rise inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 text-[13px] font-semibold whitespace-nowrap text-zinc-900 transition-[background-color,color,scale] duration-200 active:scale-[0.97] aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white lg:h-9 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:aria-pressed:border-white dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
            >
              <I className="size-3.5" aria-hidden="true" />
              {k.name}
            </button>
          )
        })}
      </div>

      {items.length > 0 && (
        <ul ref={list} aria-label="Your monthly payments" className="m-0 mt-4 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
          {items.map((it) =>
            open === it.id && !it.saved ? (
              <Editor key={it.id} it={it} cur={cur} money={money} set={set} onRemove={() => remove(it.id)} onDone={() => setOpen(null)} />
            ) : (
              <Line key={it.id} it={it} cur={cur} money={money} busy={busy} name={label(it)} onEdit={() => edit(it.id)} onRemove={() => remove(it.id)} />
            ),
          )}
        </ul>
      )}

      {items.length > 0 && <Month items={items} cur={cur} money={money} />}

      {error && (
        <p className="m-0 mt-3 text-[13px] font-semibold" style={OWE} role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {items.length ? (
          <p className="m-0">
            <span className={`block text-[22px] leading-tight ${NUM}`}>
              <CountUp value={total} format={money} />
            </span>
            <span className={`text-[13px] ${MUTED}`}>
              a month · {items.length} payment{items.length > 1 ? 's' : ''} outside your bank feed
            </span>
          </p>
        ) : (
          <p className={`m-0 text-[13px] ${MUTED}`}>Nothing added yet.</p>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!items.length ? (
            <Pill quiet onClick={onDone}>
              Skip for now
            </Pill>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onDone}
                className={`border-0 bg-transparent px-1.5 py-2.5 text-[13px] font-semibold underline underline-offset-4 ${MUTED}`}
              >
                {failed.length ? `Continue without ${failed.length > 1 ? 'them' : 'it'}` : 'Skip for now'}
              </button>
              <Pill onClick={save} disabled={busy}>
                {busy ? 'Saving…' : failed.length ? 'Try again' : 'Save and continue'}
              </Pill>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// One payment, folded: name, when it's due, what it costs. Tap to change it.
function Line({ it, cur, money, busy, name, onEdit, onRemove }) {
  const k = KIND[it.k]
  const I = k.icon
  const amount = monthlyOf(it, cur)
  const day = dayOf(it)
  const sub = `${day ? `Due on the ${ord(day)}` : 'No due day yet'}${k.varies ? ' · typical amount' : k.loan ? ' · loan' : ''}`
  const inner = (
    <>
      <IconTile>
        <I className="size-4" />
      </IconTile>
      <span className="min-w-0 grow">
        <span className="block truncate font-semibold">{name}</span>
        <span className={`block text-[13px] ${MUTED}`}>{sub}</span>
      </span>
      {amount ? (
        <span className={`shrink-0 text-[15px] ${NUM}`}>{money(amount)}</span>
      ) : (
        <span className={`shrink-0 text-[13px] underline underline-offset-4 ${MUTED}`}>Add amount</span>
      )}
    </>
  )
  if (it.saved || busy) {
    return (
      <li className="mc-new flex min-h-[52px] items-center gap-2.5 py-1.5">
        {inner}
        <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-[13px] font-semibold" style={it.saved ? IN : undefined} role="status">
          {it.saved ? (
            <>
              Saved <Check className="size-3.5" aria-hidden="true" />
            </>
          ) : (
            <span className={MUTED}>Saving…</span>
          )}
        </span>
      </li>
    )
  }
  return (
    <li className="mc-new flex items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${name}`}
        className="flex min-h-[52px] min-w-0 grow items-center gap-2.5 rounded-xl border-0 bg-transparent px-0 py-1.5 text-left text-[14px] text-inherit"
      >
        {inner}
      </button>
      {it.failed && (
        <span className="shrink-0 text-[13px] font-semibold" style={OWE}>
          Not saved
        </span>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className={X_BTN}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// One payment, open: a sentence whose words are the labels.
function Editor({ it, cur, money, set, onRemove, onDone }) {
  const k = KIND[it.k]
  const I = k.icon
  const name = it.name.trim() || 'this payment'
  const input = (key, label, placeholder, width, extra = {}) => (
    <input
      className={`${FIELD} ${width}`}
      value={it[key]}
      onChange={set(it.id, key)}
      aria-label={label}
      placeholder={placeholder}
      autoComplete="off"
      inputMode="decimal"
      {...extra}
    />
  )
  const pay = monthlyOf(it, cur)
  const day = dayOf(it)
  const done = (
    <button type="submit" className="ml-auto h-9 rounded-full border-0 bg-zinc-900 px-4 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900">
      Done
    </button>
  )
  return (
    <li data-editor className="mc-new my-2 rounded-2xl border-0 bg-zinc-100 p-3 dark:bg-zinc-800">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onDone()
        }}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2"
      >
        <IconTile>
          <I className="size-4" />
        </IconTile>
        {it.k === 'other' ? (
          input('name', 'Name', 'Childcare', 'w-full max-w-60 font-semibold', { inputMode: 'text', maxLength: 60 })
        ) : (
          <b className="text-[14px]">{it.name}</b>
        )}
        <button type="button" onClick={onRemove} aria-label={`Remove ${it.name.trim() || 'payment'}`} className={X_BTN}>
          <X className="size-4" aria-hidden="true" />
        </button>
        {/* The sentence sits on its own line under the name, Done at its end, so a bill is always one line. */}
        <div className={`col-span-full flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13px] sm:col-start-2 ${MUTED}`}>
          {k.loan ? (
            <>
              <span className={PART}>borrowed ${input('principal', 'Amount borrowed', '25000', 'w-24')}</span>
              <span className={PART}>at {input('apr', 'Interest, APR percent', '4.9', 'w-16')}%</span>
              <span className={PART}>over {input('months', 'Length in months', '60', 'w-16', { inputMode: 'numeric' })} months,</span>
              <span className={PART}>first payment {input('first', 'First payment date', '', 'w-40', { type: 'date', inputMode: undefined })}</span>
            </>
          ) : (
            <>
              <span className={PART}>
                {k.varies ? 'about ' : ''}${input('amount', `Amount for ${name}`, '0.00', 'w-24')}
              </span>
              <span className={PART}>a month, on day {input('day', `Due day for ${name}`, '1–31', 'w-14', { inputMode: 'numeric' })}</span>
            </>
          )}
          {!k.loan && done}
        </div>
        {k.loan && (
          <div className="col-span-full flex flex-wrap items-center gap-2 sm:col-start-2">
            <p className="m-0 min-w-0 flex-1 basis-60 rounded-xl border border-dashed border-zinc-400 px-3 py-2 text-[13px] dark:border-zinc-600">
              {pay ? (
                <>
                  Your payment: <b className="tabular-nums">{money(pay)}</b> a month{day ? `, due on the ${ord(day)}` : ''}. Payoff date and interest show in
                  Debts.
                </>
              ) : (
                'From your loan papers. Coinroof works out the payment.'
              )}
            </p>
            {done}
          </div>
        )}
      </form>
    </li>
  )
}

// Your month: 31 notches, a tall one on each due day, and what lands when.
function Month({ items, cur, money }) {
  const days = new Map()
  let firstWeek = 0
  for (const it of items) {
    const d = dayOf(it)
    const amount = monthlyOf(it, cur)
    if (!d || !amount) continue
    days.set(d, [...(days.get(d) ?? []), it.name.trim() || 'Something else'])
    if (d <= 7) firstWeek += amount
  }
  const due = [...days.keys()].sort((a, b) => a - b)
  return (
    <div className="mt-4 border-t border-zinc-200 pt-3.5 dark:border-zinc-800">
      {due.length ? (
        <>
          <div role="img" aria-label={`Due days across the month: ${due.map(ord).join(', ')}`} className="flex h-[26px] items-end gap-0.5">
            {Array.from({ length: 31 }, (_, i) =>
              days.has(i + 1) ? (
                <i key={`on${i}`} className="calm-pop h-full flex-1 origin-bottom rounded-[2px] bg-zinc-900 dark:bg-white" />
              ) : (
                <i key={i} className="h-2 flex-1 rounded-[2px] bg-zinc-200 dark:bg-zinc-700" />
              ),
            )}
          </div>
          <div className={`mt-1 flex justify-between text-[12px] tabular-nums ${MUTED}`}>
            <span>1st</span>
            <span>31st</span>
          </div>
          <p className={`m-0 mt-1.5 text-[13px] ${MUTED}`}>
            {due.map((d, i) => (
              <span key={d}>
                {i > 0 && ' · '}
                <b className="text-zinc-900 tabular-nums dark:text-white">{ord(d)}</b> {days.get(d).join(', ')}
              </span>
            ))}
            {firstWeek > 0 && (
              <>
                . <b className="text-zinc-900 tabular-nums dark:text-white">{money(firstWeek)}</b> of it is due in the first week.
              </>
            )}
          </p>
        </>
      ) : (
        <p className={`m-0 text-[13px] ${MUTED}`}>Add a due day and it shows here, across the month.</p>
      )}
    </div>
  )
}
