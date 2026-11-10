import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { useModal } from '../lib/modal.js'
import PaidDialog from './PaidDialog.jsx'
import { Pill, MUTED, NUM, OWE } from './calm/ui.jsx'

// Bill reminders (#126, Dinesh picked B of drafts/126-bill-reminders.html): when an owner opens
// Coinroof and a bill is due today or late this month, a dialog asks them to record it. "Not yet"
// hides a bill until tomorrow; closing hides them all until tomorrow. Kept in this browser only
// (a convenience, not a record), so it can come back in a private window. Owners only, like Bills.

const SNOOZE_KEY = 'coinroof.billReminder'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`
const today = () => new Date().toLocaleDateString('en-CA')

// Bills hidden today: { day, ids }. Anything from another day has expired.
function snoozed(day) {
  try {
    const s = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? 'null')
    return s?.day === day ? new Set(s.ids) : new Set()
  } catch {
    return new Set()
  }
}
function snooze(day, ids) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ day, ids: [...snoozed(day), ...ids] }))
  } catch {
    // Private window or blocked storage: it simply asks again next time.
  }
}
const keyOf = (d) => `${d.bill_id}|${d.due}`

// Which of the month's dues to ask about: late, or due today and not paid, and not hidden today.
export function toRecord(dues, now, hidden = new Set()) {
  return dues.filter((d) => (d.status === 'late' || (d.status === 'due' && d.due === now)) && !hidden.has(keyOf(d)))
}

export default function BillReminder({ household, onChanged }) {
  const [state, setState] = useState(null) // { now, bills: {id: bill}, list: [due] }
  const [paying, setPaying] = useState(null) // the due being marked with a different amount
  const owner = household.role === 'owner'

  useEffect(() => {
    if (!owner) return
    let live = true
    const now = today()
    api(`/api/bills?household_id=${encodeURIComponent(household.id)}&month=${now.slice(0, 7)}&today=${now}`).then(
      (d) => {
        if (!live) return
        const list = toRecord(d.dues ?? [], now, snoozed(now))
        setState({ now, bills: Object.fromEntries((d.bills ?? []).map((b) => [b.id, b])), list })
      },
      () => {}, // a reminder is never worth an error message
    )
    return () => {
      live = false
    }
  }, [household.id, owner])

  if (!owner || !state || state.list.length === 0) return null
  const drop = (due) => setState((s) => ({ ...s, list: s.list.filter((d) => keyOf(d) !== keyOf(due)) }))

  if (paying) {
    return (
      <PaidDialog
        bill={state.bills[paying.bill_id]}
        due={paying}
        now={state.now}
        onClose={() => setPaying(null)}
        onSaved={() => {
          drop(paying)
          setPaying(null)
          onChanged?.()
        }}
      />
    )
  }
  return (
    <ReminderDialog
      state={state}
      onPaid={async (due) => {
        await api(`/api/bills/${due.bill_id}/payments/${due.due}`, { method: 'PUT', body: { paid_minor: due.expected_minor, paid_on: state.now } })
        drop(due)
        onChanged?.()
      }}
      onDifferent={setPaying}
      onNotYet={(due) => {
        snooze(state.now, [keyOf(due)])
        drop(due)
      }}
      onClose={() => {
        snooze(state.now, state.list.map(keyOf))
        setState((s) => ({ ...s, list: [] }))
      }}
    />
  )
}

function ReminderDialog({ state, onPaid, onDifferent, onNotYet, onClose }) {
  const ref = useRef(null)
  useModal(ref)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const n = state.list.length
  return (
    <dialog
      ref={ref}
      aria-labelledby="bill-reminder-h"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="bill-reminder m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-white p-5 text-zinc-900 shadow-2xl backdrop:bg-black/40 dark:bg-zinc-900 dark:text-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="bill-reminder-h" className="m-0 font-[family-name:var(--font-heading)] text-[18px] font-semibold">
            {n === 1 ? '1 bill to record' : `${n} bills to record`}
          </h2>
          <p className={`m-0 mt-0.5 text-[13px] ${MUTED}`}>Paid any of these? Mark them so your spending is right.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Later" className={`-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-full ${MUTED}`}>
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <ul className="m-0 mt-2 list-none p-0">
        {state.list.map((d) => {
          const bill = state.bills[d.bill_id]
          if (!bill) return null
          const late = d.status === 'late'
          const k = `${d.bill_id}|${d.due}`
          return (
            <li
              key={k}
              className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-zinc-200 py-3 first:border-t-0 dark:border-zinc-800"
            >
              <span
                className="flex size-8 items-center justify-center rounded-lg border-[1.5px] border-dashed border-zinc-400 text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                aria-hidden="true"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  focusable="false"
                >
                  <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2zM8 8h8M8 12h8M8 16h5" />
                </svg>
              </span>
              <span className="min-w-0">
                <b className="block truncate text-[14px] font-semibold">{bill.name}</b>
                <span className={`block text-[13px] ${late ? 'font-semibold' : MUTED}`} style={late ? OWE : undefined}>
                  {late ? `Late · was due ${short(d.due)}` : 'Due today'}
                </span>
              </span>
              <span className={`text-[15px] ${NUM}`} style={late ? OWE : undefined}>
                {bill.varies && <span className={`text-[12px] font-medium ${MUTED}`}>about </span>}
                {formatMoney(d.expected_minor, bill.currency)}
              </span>
              <div className="col-start-2 col-end-4 mt-1 flex flex-wrap items-center gap-2">
                <Pill
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(k)
                    setError('')
                    try {
                      await onPaid(d)
                    } catch {
                      setError("We couldn't save it. Try again in a moment.")
                    } finally {
                      setBusy('')
                    }
                  }}
                >
                  {busy === k ? 'Saving…' : 'Mark paid'}
                </Pill>
                <Pill quiet disabled={!!busy} onClick={() => onDifferent(d)}>
                  Different amount
                </Pill>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => onNotYet(d)}
                  className={`h-9 border-0 bg-transparent px-1.5 text-[13px] font-semibold underline underline-offset-4 ${MUTED}`}
                >
                  Not yet
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {error && (
        <p className="m-0 mt-1 text-[13px] font-semibold" style={OWE} role="alert">
          {error}
        </p>
      )}
    </dialog>
  )
}
