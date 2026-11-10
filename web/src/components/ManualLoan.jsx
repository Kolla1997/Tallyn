import { useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog.jsx'
import { api } from '../lib/api.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { useModal } from '../lib/modal.js'
import { Pill, MUTED, NUM, OWE } from './calm/ui.jsx'

// Loans Plaid can't see, like a car loan (#306, Dinesh picked C of drafts/306-loans.html): a row
// in Debts → Other loans, and tapping it opens this detail card: left to pay, three facts, and the
// last payment split into interest and what came off the balance. Figures are estimates worked out
// on the server (internal/db/loans.go); the form's preview uses the same formula.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (d) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : null)
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`
const today = () => new Date().toLocaleDateString('en-CA')
const FIELD = 'h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[14px] tabular-nums'
const DIALOG =
  'm-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-white dark:bg-zinc-900 p-5 text-zinc-900 dark:text-white shadow-2xl backdrop:bg-black/40'
const DIALOG_H = 'm-0 mb-1 font-[family-name:var(--font-heading)] text-[18px] font-semibold'

// The monthly payment, as LoanPayment in internal/db/loans.go.
export function loanPayment(principal, apr, months) {
  if (!(principal > 0) || !(months > 0)) return 0
  if (!apr) return Math.ceil(principal / months)
  const r = apr / 100 / 12
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)))
}
// Total interest over the loan at that payment.
export function totalInterest(principal, apr, months) {
  const pay = loanPayment(principal, apr, months)
  const r = apr / 100 / 12
  let bal = principal
  let total = 0
  for (let k = 1; k <= months && bal > 0; k++) {
    const i = Math.round(bal * r)
    total += i
    bal -= Math.min(pay - i, bal)
  }
  return total
}

// A manual loan as one of Debts' accounts, so it shares the row, groups and totals.
export function asAccount(l, ownerId) {
  return {
    id: `manual-${l.id}`,
    manual: l,
    name: l.name,
    mask: null,
    type: 'loan',
    subtype: 'auto',
    currency: l.currency,
    current_balance_minor: l.balance_minor,
    loan: {
      kind: 'manual',
      rate_percent: l.apr,
      next_payment_minor: l.next_due ? l.payment_minor : null,
      next_payment_due_date: l.next_due,
      payoff_date: l.payoff_date,
      original_minor: l.principal_minor,
      ytd_interest_minor: l.interest_this_year_minor,
      // A payment past its date and not marked paid is overdue, as Plaid's loans say.
      is_overdue: !!l.next_due && l.next_due < new Date().toLocaleDateString('en-CA'),
    },
    bank: { owner_user_id: ownerId, status: 'active' },
  }
}

export function LoanIcon() {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-dashed border-zinc-400 text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
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
        <path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13.5h.01M16.5 13.5h.01" />
      </svg>
    </span>
  )
}

export function LoanDetail({ loan: l, money, onChanged }) {
  const [dialog, setDialog] = useState(null) // 'edit' | 'balance' | 'extra'
  const pct = Math.round((Math.max(0, l.principal_minor - l.balance_minor) / l.principal_minor) * 100)
  const last = l.last
  return (
    <section aria-labelledby="loan-detail-h" className="calm-card calm-glass min-w-0 rounded-2xl p-4 lg:sticky lg:top-4">
      <p id="loan-detail-h" className={`m-0 text-[13px] ${MUTED}`}>
        {l.name} · left to pay
      </p>
      <p className={`m-0 text-[32px] leading-tight ${NUM}`}>{money(l.balance_minor)}</p>
      <p className={`m-0 text-[13px] ${MUTED}`}>
        of {money(l.principal_minor)} borrowed · <b className="text-zinc-900 dark:text-white">{pct}% paid off</b>
        {l.corrected_on && ` · balance set ${monthYear(l.corrected_on)}`}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {[
          [l.payoff_date ? monthYear(l.payoff_date) : l.balance_minor > 0 ? 'Not at this payment' : 'Paid off', 'Paid off by (estimated)'],
          [money(l.payment_minor), `A month, due on the ${ordinal(l.due_day)}`],
          [money(l.interest_paid_minor), 'Interest paid so far'],
        ].map(([v, k]) => (
          <div key={k} className="rounded-xl bg-zinc-100/80 p-2.5 dark:bg-zinc-800/80">
            <dd className={`m-0 text-[15px] ${NUM}`}>{v}</dd>
            <dt className={`text-[12px] ${MUTED}`}>{k}</dt>
          </div>
        ))}
      </dl>
      {last && (
        <>
          <p className={`m-0 mt-3 text-[13px] ${MUTED}`}>
            {last.extra ? 'Last extra payment' : 'Last payment'}, {monthYear(last.on)}
          </p>
          <div className="mt-1.5 flex h-3.5 overflow-hidden rounded-full" aria-hidden="true">
            <i
              className="calm-fill block h-full"
              style={{ width: `${(last.interest_minor / last.paid_minor) * 100}%`, background: 'var(--color-redesign-accent)', '--n': 3 }}
            />
            <i
              className="calm-fill block h-full"
              style={{ width: `${(last.principal_minor / last.paid_minor) * 100}%`, background: 'var(--color-redesign-in)', '--n': 3 }}
            />
          </div>
          <p className={`m-0 mt-1.5 flex flex-wrap gap-x-4 text-[13px] tabular-nums ${MUTED}`}>
            <span>
              Interest <b className="text-zinc-900 dark:text-white">{money(last.interest_minor)}</b>
            </span>
            <span>
              Off the balance <b className="text-zinc-900 dark:text-white">{money(last.principal_minor)}</b>
            </span>
          </p>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill quiet onClick={() => setDialog('balance')}>
          Correct the balance
        </Pill>
        <Pill quiet onClick={() => setDialog('extra')}>
          Pay extra
        </Pill>
        <Pill quiet onClick={() => setDialog('edit')}>
          Edit
        </Pill>
      </div>
      <p className={`m-0 mt-3 text-[12px] ${MUTED}`}>Mark monthly payments paid in Bills. Figures are estimates; your lender&apos;s statement wins.</p>
      {dialog === 'edit' && <LoanDialog loan={l} onClose={() => setDialog(null)} onSaved={done(setDialog, onChanged)} />}
      {dialog === 'balance' && (
        <AmountDialog
          title="Correct the balance"
          note="Enter the balance on your lender's latest statement. Payments after that day start from it."
          label="Balance"
          dateLabel="As of"
          start={l.balance_minor}
          currency={l.currency}
          onClose={() => setDialog(null)}
          onSave={(minor, on) => api(`/api/loans/${l.id}/balance`, { method: 'PUT', body: { balance_minor: minor, on } })}
          onSaved={done(setDialog, onChanged)}
        />
      )}
      {dialog === 'extra' && (
        <AmountDialog
          title="Pay extra"
          note="An extra payment goes straight to the balance, so you pay less interest and finish sooner. Pay it in your lender's app first."
          label="Extra amount"
          dateLabel="Paid on"
          start={null}
          currency={l.currency}
          onClose={() => setDialog(null)}
          onSave={(minor, on) => api(`/api/loans/${l.id}/extra`, { method: 'POST', body: { paid_minor: minor, paid_on: on } })}
          onSaved={done(setDialog, onChanged)}
        />
      )}
    </section>
  )
}
const done = (setDialog, onChanged) => () => {
  setDialog(null)
  onChanged()
}

function AmountDialog({ title, note, label, dateLabel, start, currency, onSave, onClose, onSaved }) {
  const ref = useRef(null)
  useModal(ref)
  const [amount, setAmount] = useState(start != null ? fromMinor(start, currency) : '')
  const [on, setOn] = useState(today())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    const minor = toMinor(amount, currency)
    if (minor == null || minor < 0 || (start == null && minor === 0)) return setError('Enter an amount, like 500.')
    setBusy(true)
    try {
      await onSave(minor, on)
      onSaved()
    } catch {
      setError("We couldn't save it. Try again in a moment.")
      setBusy(false)
    }
  }
  return (
    <dialog ref={ref} className={DIALOG} aria-labelledby="loan-amount-h" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save} className="grid gap-3 text-[14px]">
        <h2 id="loan-amount-h" className={DIALOG_H}>
          {title}
        </h2>
        <p className={`m-0 text-[13px] ${MUTED}`}>{note}</p>
        <label className="grid gap-1">
          <span className="font-semibold">
            {label} ({currency})
          </span>
          <input className={FIELD} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">{dateLabel}</span>
          <input className={FIELD} type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} />
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
            {busy ? 'Saving…' : 'Save'}
          </Pill>
        </div>
      </form>
    </dialog>
  )
}

// Add or edit a loan. Deleting goes through its bill, which removes the loan too.
export function LoanDialog({ loan, household, onClose, onSaved }) {
  const ref = useRef(null)
  useModal(ref)
  const cur = loan?.currency ?? household?.home_currency ?? 'USD'
  const [f, setF] = useState({
    name: loan?.name ?? '',
    lender: loan?.lender ?? '',
    amount: loan ? fromMinor(loan.principal_minor, cur) : '',
    apr: loan?.apr ?? '',
    months: loan ? String(loan.months) : '',
    first: loan?.first_due ?? '',
    balance: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const principal = toMinor(f.amount, cur)
  const apr = Number(f.apr.replace('%', ''))
  const months = Number(f.months)
  const ready =
    principal > 0 && f.apr !== '' && apr >= 0 && apr <= 100 && Number.isInteger(months) && months > 0 && months <= 600 && /^\d{4}-\d{2}-\d{2}$/.test(f.first)
  const pay = ready ? loanPayment(principal, apr, months) : 0
  const lastDue = ready
    ? (() => {
        const d = new Date(`${f.first}T12:00:00`)
        d.setMonth(d.getMonth() + months - 1)
        return d.toLocaleDateString('en-CA')
      })()
    : null
  const fmt = (v) => `$${(v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const save = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) return setError('Give it a name, like Toyota car loan.')
    if (!ready) return setError('Fill in the amount, interest, length and first payment.')
    const balance = f.balance.trim() ? toMinor(f.balance, cur) : null
    if (f.balance.trim() && balance == null) return setError('Enter today’s balance as a number, or leave it empty.')
    setBusy(true)
    const body = { name: f.name, lender: f.lender, principal_minor: principal, apr: String(apr), months, first_due: f.first }
    try {
      if (loan) await api(`/api/loans/${loan.id}`, { method: 'PUT', body })
      else await api('/api/loans', { method: 'POST', body: { household_id: household.id, ...body, balance_minor: balance } })
      onSaved()
    } catch {
      setError("We couldn't save it. Try again in a moment.")
      setBusy(false)
    }
  }
  const [deleting, setDeleting] = useState(false)
  if (deleting) {
    return (
      <ConfirmDialog
        title={`Delete ${loan.name}?`}
        action="Delete"
        onConfirm={async () => {
          try {
            await api(`/api/bills/${loan.id}`, { method: 'DELETE' })
          } catch {
            throw new Error("We couldn't delete it. Try again in a moment.")
          }
          onSaved()
        }}
        onClose={() => setDeleting(false)}
      >
        <p>Its monthly payment goes from Bills too, with the payments you&apos;ve marked. This can&apos;t be undone.</p>
      </ConfirmDialog>
    )
  }
  return (
    <dialog ref={ref} className={DIALOG} aria-labelledby="loan-h" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save} className="grid gap-3 text-[14px]">
        <div>
          <h2 id="loan-h" className={DIALOG_H}>
            {loan ? `Edit ${loan.name}` : 'Add a loan'}
          </h2>
          <p className={`m-0 text-[13px] ${MUTED}`}>For loans your bank doesn&apos;t share, like a car loan. Only household owners see it.</p>
        </div>
        <label className="grid gap-1">
          <span className="font-semibold">Name</span>
          <input className={FIELD} value={f.name} onChange={set('name')} maxLength={60} placeholder="Toyota car loan" autoFocus={!loan} />
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Lender (optional)</span>
          <input className={FIELD} value={f.lender} onChange={set('lender')} maxLength={60} placeholder="Toyota Financial" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="font-semibold">Amount borrowed ({cur})</span>
            <input className={FIELD} inputMode="decimal" autoComplete="off" value={f.amount} onChange={set('amount')} placeholder="25000" />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Interest (APR %)</span>
            <input className={FIELD} inputMode="decimal" autoComplete="off" value={f.apr} onChange={set('apr')} placeholder="4.9" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="font-semibold">Length (months)</span>
            <input className={FIELD} inputMode="numeric" value={f.months} onChange={set('months')} placeholder="60" />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">First payment</span>
            <input className={FIELD} type="date" value={f.first} onChange={set('first')} />
          </label>
        </div>
        {!loan && (
          <label className="grid gap-1">
            <span className="font-semibold">Balance today (optional)</span>
            <input
              className={FIELD}
              inputMode="decimal"
              autoComplete="off"
              value={f.balance}
              onChange={set('balance')}
              placeholder="From your latest statement"
            />
          </label>
        )}
        {ready && (
          <p className="m-0 rounded-xl border border-dashed border-zinc-400 p-3 text-[13px] dark:border-zinc-600" aria-live="polite">
            Your payment: <b className="tabular-nums">{fmt(pay)}</b> a month, due on the {ordinal(Number(f.first.slice(8)))}. Paid off by{' '}
            <b>{monthYear(lastDue)}</b>. Total interest about <b className="tabular-nums">{fmt(totalInterest(principal, apr, months))}</b>.
          </p>
        )}
        {error && (
          <p className="m-0 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {loan && (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              disabled={busy}
              className="mr-auto border-0 bg-transparent text-[13px] font-semibold underline underline-offset-4"
              style={OWE}
            >
              Delete
            </button>
          )}
          <Pill quiet onClick={onClose} disabled={busy}>
            Cancel
          </Pill>
          <Pill type="submit" disabled={busy}>
            {busy ? 'Saving…' : loan ? 'Save' : 'Add loan'}
          </Pill>
        </div>
      </form>
    </dialog>
  )
}
