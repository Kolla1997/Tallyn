import { useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { useModal } from '../lib/modal.js'
import { Pill, MUTED, OWE } from './calm/ui.jsx'

// Mark a bill paid with the amount and day actually paid (#127): from Bills' "Different amount",
// a "Paid from your bank?" match (due.suggest), or the bill reminder (#126). Solid, like every dialog.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`
const NOTE = `m-0 text-[13px] ${MUTED}`
const FIELD = 'h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[14px]'
const DIALOG =
  'm-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-white dark:bg-zinc-900 p-5 text-zinc-900 dark:text-white shadow-2xl backdrop:bg-black/40'
const DIALOG_H = 'm-0 mb-1 font-[family-name:var(--font-heading)] text-[18px] font-semibold'

export default function PaidDialog({ bill, due, now, onClose, onSaved }) {
  const ref = useRef(null)
  useModal(ref)
  const start = due.suggest ? due.suggest.amount_minor : due.expected_minor
  const [amount, setAmount] = useState(fromMinor(start, bill.currency))
  const [on, setOn] = useState(due.suggest ? due.suggest.date : now)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    const minor = toMinor(amount, bill.currency)
    if (!minor || minor <= 0) return setError('Enter the amount you paid, like 71.35.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return setError('Pick the day you paid.')
    setBusy(true)
    try {
      await api(`/api/bills/${bill.id}/payments/${due.due}`, {
        method: 'PUT',
        body: { paid_minor: minor, paid_on: on, transaction_id: due.suggest?.transaction_id ?? '' },
      })
      onSaved()
    } catch {
      setError("We couldn't save it. Try again in a moment.")
      setBusy(false)
    }
  }
  return (
    <dialog ref={ref} className={DIALOG} aria-labelledby="paid-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save} className="grid gap-3 text-[14px]">
        <h2 id="paid-title" className={DIALOG_H}>
          {bill.name} · due {short(due.due)}
        </h2>
        <p className={NOTE}>
          {due.suggest
            ? `From your bank: ${due.suggest.name} on ${short(due.suggest.date)}.`
            : bill.varies
              ? 'This one varies each month. Enter what you paid.'
              : 'Enter what you paid, if it was different.'}
        </p>
        <label className="grid gap-1">
          <span className="font-semibold">Amount paid ({bill.currency})</span>
          <input
            className={`${FIELD} tabular-nums`}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Paid on</span>
          <input className={FIELD} type="date" value={on} max={now} onChange={(e) => setOn(e.target.value)} />
        </label>
        {error && (
          <p className="m-0 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Pill quiet onClick={onClose} disabled={busy}>
            Cancel
          </Pill>
          <Pill type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Mark paid'}
          </Pill>
        </div>
      </form>
    </dialog>
  )
}
