import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, CreditCard, Plus, Repeat } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import PaidDialog from '../components/PaidDialog.jsx'
import LoadFailed from '../components/LoadFailed.jsx'
import PageSkeleton from '../components/calm/PageSkeleton.jsx'
import { api } from '../lib/api.js'
import { navigate } from '../lib/router.jsx'
import { CATEGORIES, FREQUENCIES, amountOf, byDay, cardDues, frequencyName, monthGrid, shiftMonth, totals } from '../lib/bills.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { formatMoney } from '../lib/money.js'
import { useRetry } from '../lib/retry.js'
import { useModal } from '../lib/modal.js'
import { Head, Panel, Pill, See, NUM, MUTED, OWE, IN } from '../components/calm/ui.jsx'

// Bills Plaid can't see (#127), Dinesh's pick C of drafts/127-bills-calendar.html: the month as a
// calendar with each bill on its due day, and beside it the day you pick (bills to mark paid) over
// the month's total. On today it brings late bills and "paid from your bank?" hints up first.
// Only household owners see bills; the server enforces it. Bills never change bank balances.
// Linked credit cards' next payments from Plaid sit on the calendar too, read-only: the bank
// says when they're paid, and Left to pay counts their minimum (#127, Dinesh 2026-11-09).

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const NOTE = `m-0 text-[13px] ${MUTED}`
const FIELD = 'h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[14px]'
const DIALOG =
  'm-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-white dark:bg-zinc-900 p-5 text-zinc-900 dark:text-white shadow-2xl backdrop:bg-black/40'
const DIALOG_H = 'm-0 mb-1 font-[family-name:var(--font-heading)] text-[18px] font-semibold'
const STATUS_ICON = { paid: Check, late: AlertCircle, due: Clock }
const CHIP = {
  paid: 'bg-[color-mix(in_srgb,var(--color-redesign-in-text)_14%,transparent)] [&>span]:line-through',
  late: 'bg-[color-mix(in_srgb,var(--color-redesign-owe-text)_14%,transparent)]',
  due: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200',
}
const TONE = { paid: IN, late: OWE, due: undefined }

const monthTitle = (month) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
const dateOf = (month, d) => `${month}-${String(d).padStart(2, '0')}`
const dayTitle = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${DOW_FULL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`
}
const short = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3)} ${Number(date.slice(8))}`

export default function BillsPage({ household, refreshKey }) {
  const now = today()
  const [month, setMonth] = useState(now.slice(0, 7))
  const [picked, setPicked] = useState(now)
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(null) // null | 'load' | 'owners'
  const [dialog, setDialog] = useState(null) // { kind: 'bill', bill? } | { kind: 'paid', bill, due, different }
  const [deleting, setDeleting] = useState(null)
  const cur = household.home_currency
  const money = useCallback((minor, c = cur) => formatMoney(minor, c), [cur])

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    // Cards are a bonus: if the banks can't load, bills still show.
    const banks = api(`/api/banks?household_id=${hh}`).then(
      (b) => b.banks ?? [],
      () => [],
    )
    return Promise.all([api(`/api/bills?household_id=${hh}&month=${month}&today=${now}`), banks]).then(
      ([d, b]) => {
        const dues = [...d.dues, ...cardDues(b, month)].sort((x, y) => x.due.localeCompare(y.due))
        setData({ ...d, dues })
        setFailed(null)
      },
      (e) => setFailed(e?.status === 403 ? 'owners' : 'load'),
    )
  }, [household.id, month, now])
  useEffect(() => {
    load()
  }, [load, refreshKey])
  const [retrying, retry] = useRetry(load)

  const go = (n) => {
    const m = shiftMonth(month, n)
    setData(null)
    setMonth(m)
    setPicked(m === now.slice(0, 7) ? now : `${m}-01`)
  }

  const markPaid = async (due) => {
    await api(`/api/bills/${due.bill_id}/payments/${due.due}`, { method: 'PUT', body: { paid_minor: due.expected_minor, paid_on: now } })
    load()
  }
  const unmark = async (due) => {
    await api(`/api/bills/${due.bill_id}/payments/${due.due}`, { method: 'DELETE' })
    load()
  }

  const add = (
    <Pill icon={Plus} onClick={() => setDialog({ kind: 'bill' })}>
      Add a bill
    </Pill>
  )

  return (
    <div className="calm">
      <Head title="Bills" sub="Rent, utilities and anything your bank feed can't see. They count as paid when you say so.">
        {failed !== 'owners' && add}
      </Head>

      {failed === 'owners' ? (
        <Panel id="bills-owners" title="Bills are for household owners">
          <p className={`m-0 text-[14px] ${MUTED}`}>Ask an owner of {household.name} if you need to know what&apos;s due.</p>
        </Panel>
      ) : !data ? (
        failed ? (
          <LoadFailed what="your bills" busy={retrying} onRetry={retry} />
        ) : (
          <PageSkeleton />
        )
      ) : data.bills.length === 0 && data.dues.length === 0 ? (
        <Panel id="bills-empty" title="No bills yet">
          <p className={`m-0 mb-3 text-[14px] ${MUTED}`}>
            Add rent, utilities or anything you pay that your bank feed doesn&apos;t show. Coinroof shows when each is due and keeps count of what you&apos;ve
            paid. It never changes your balances.
          </p>
          {add}
        </Panel>
      ) : (
        <Calendar
          data={data}
          month={month}
          now={now}
          picked={picked}
          money={money}
          onPick={setPicked}
          onMonth={go}
          onMarkPaid={markPaid}
          onUnmark={unmark}
          onDifferent={(bill, due) => setDialog({ kind: 'paid', bill, due })}
          onEdit={(bill) => (bill.category === 'loan' ? navigate('/debts') : setDialog({ kind: 'bill', bill }))}
        />
      )}

      {dialog?.kind === 'bill' && (
        <BillDialog
          bill={dialog.bill}
          household={household}
          month={month}
          onDelete={() => {
            setDeleting(dialog.bill)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            load()
          }}
        />
      )}
      {dialog?.kind === 'paid' && (
        <PaidDialog
          bill={dialog.bill}
          due={dialog.due}
          now={now}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            load()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          action="Delete"
          onConfirm={async () => {
            try {
              await api(`/api/bills/${deleting.id}`, { method: 'DELETE' })
            } catch {
              throw new Error("We couldn't delete it. Try again in a moment.")
            }
            setDeleting(null)
            load()
          }}
          onClose={() => setDeleting(null)}
        >
          <p>It goes from every month, with the payments you&apos;ve marked for it. To stop it for now and keep its history, pause it instead.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function Calendar({ data, month, now, picked, money, onPick, onMonth, onMarkPaid, onUnmark, onDifferent, onEdit }) {
  const { lead, days } = monthGrid(month)
  const days_ = byDay(data.dues)
  const bills = Object.fromEntries(data.bills.map((b) => [b.id, b]))
  const sum = totals(data.dues)
  const isNow = month === now.slice(0, 7)
  const pickedDay = Number(picked.slice(8))
  const dayDues = picked.slice(0, 7) === month ? (days_.get(pickedDay) ?? []) : []
  const isToday = picked === now
  const late = isToday ? data.dues.filter((d) => d.status === 'late' && d.due !== picked) : []
  const matches = isToday ? data.dues.filter((d) => d.match && d.status !== 'paid') : []
  const card = (d) =>
    d.card ? (
      <CardDue key={d.bill_id} due={d} money={money} />
    ) : (
      <BillCard
        key={d.bill_id}
        bill={bills[d.bill_id]}
        due={d}
        money={money}
        onMarkPaid={() => onMarkPaid(d)}
        onUnmark={() => onUnmark(d)}
        onDifferent={() => onDifferent(bills[d.bill_id], d)}
        onEdit={() => onEdit(bills[d.bill_id])}
      />
    )

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12 [&>*]:min-w-0">
      <section className="calm-card calm-glass rounded-2xl p-4 lg:col-span-8 sm:p-5" aria-labelledby="bills-month-h">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="bills-month-h" className="m-0 font-[family-name:var(--font-heading)] text-[22px] font-semibold">
              {monthTitle(month)}
            </h2>
            <p className={`${NOTE} tabular-nums`}>
              {data.dues.length} {data.dues.length === 1 ? 'bill' : 'bills'} · {money(sum.total)} this month
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onMonth(-1)}
              aria-label="Previous month"
              className="grid size-11 place-items-center rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMonth(1)}
              aria-label="Next month"
              className="grid size-11 place-items-center rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={`mt-4 mb-2 grid grid-cols-7 gap-1 text-center text-[13px] font-semibold sm:gap-2 ${MUTED}`} aria-hidden="true">
          {DOW.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <ol className="m-0 grid list-none grid-cols-7 gap-1 p-0 sm:gap-2" aria-label={`${monthTitle(month)} calendar`}>
          {Array.from({ length: lead }, (_, i) => (
            <li key={`b${i}`} aria-hidden="true" />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const d = i + 1
            const date = dateOf(month, d)
            const list = days_.get(d) ?? []
            const past = isNow && date < now
            const sel = date === picked
            return (
              <li key={d} className="calm-rise min-w-0" style={{ '--d': `${300 + i * 18}ms` }}>
                <button
                  type="button"
                  aria-pressed={sel}
                  aria-label={`${dayTitle(date)}${list.length ? `, ${list.length} ${list.length === 1 ? 'bill' : 'bills'}` : ''}${date === now ? ', today' : ''}`}
                  onClick={() => onPick(date)}
                  className={`flex h-full min-h-14 w-full flex-col items-stretch gap-1 rounded-xl border-2 bg-zinc-100/75 p-1 text-left dark:bg-zinc-800/55 sm:min-h-26 sm:p-2 ${
                    sel ? 'border-zinc-900 dark:border-white' : 'border-transparent hover:border-zinc-200 dark:hover:border-zinc-700'
                  }`}
                >
                  <span
                    className={`grid size-6 place-items-center rounded-lg font-[family-name:var(--font-heading)] text-[14px] font-semibold tabular-nums ${
                      date === now ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : past ? MUTED : ''
                    }`}
                  >
                    {d}
                  </span>
                  {list.slice(0, 2).map((due) => {
                    const I = due.card ? CreditCard : STATUS_ICON[due.status]
                    return (
                      <span
                        key={due.bill_id}
                        className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-semibold sm:justify-start ${CHIP[due.status]}`}
                        style={TONE[due.status]}
                      >
                        <I className="size-3 shrink-0" aria-hidden="true" />
                        <span className="hidden truncate sm:inline">{due.name ?? bills[due.bill_id]?.name}</span>
                      </span>
                    )
                  })}
                  {list.length > 2 && <span className={`hidden pl-1 text-[12px] sm:inline ${MUTED}`}>+{list.length - 2} more</span>}
                  {list.length > 0 && (
                    <span className={`mt-auto hidden text-[12px] tabular-nums sm:inline ${MUTED}`}>{money(list.reduce((s, x) => s + amountOf(x), 0))}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <aside className="calm-card calm-glass rounded-2xl p-4 lg:col-span-4 sm:p-5" aria-labelledby="bills-day-h" aria-live="polite">
        <h2
          id="bills-day-h"
          className="m-0 flex items-center gap-2 border-b border-zinc-200 pb-3 font-[family-name:var(--font-heading)] text-[17px] font-semibold dark:border-zinc-800"
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          {dayTitle(picked)}
        </h2>

        {matches.map((d) => (
          <div key={`m${d.bill_id}`} className="mt-3 rounded-xl border border-dashed border-zinc-400 p-3 text-[13px] dark:border-zinc-600">
            <p className="m-0">
              <b>Paid from your bank?</b> {d.match.name} {money(d.match.amount_minor)} on {short(d.match.date)} looks like {bills[d.bill_id]?.name}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill quiet onClick={() => onDifferent(bills[d.bill_id], { ...d, suggest: d.match })}>
                Yes, mark paid
              </Pill>
            </div>
          </div>
        ))}

        {late.length > 0 && (
          <>
            <p className="m-0 mt-4 mb-2 inline-block rounded-full bg-zinc-100 px-3 py-1 text-[13px] font-semibold dark:bg-zinc-800" style={OWE}>
              Late
            </p>
            {late.map(card)}
          </>
        )}

        <p className="m-0 mt-4 mb-2 inline-block rounded-full bg-zinc-100 px-3 py-1 text-[13px] font-semibold dark:bg-zinc-800">
          {isToday ? 'Today' : picked < now ? 'Earlier' : 'Coming up'}
        </p>
        {dayDues.length ? dayDues.map(card) : <p className={`${NOTE} py-1`}>Nothing due this day.</p>}

        <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className={NOTE}>Left to pay in {MONTHS[Number(month.slice(5)) - 1]}</p>
          <p className={`m-0 text-[32px] leading-tight ${NUM}`}>{money(sum.left)}</p>
          <div className="my-3 h-2 overflow-hidden rounded bg-[var(--color-redesign-track)]">
            <i
              className="calm-fill block h-full"
              style={{ width: `${sum.total ? Math.round((sum.paid / sum.total) * 100) : 0}%`, background: 'var(--color-redesign-in)', '--n': 4 }}
            />
          </div>
          <p className={`${NOTE} tabular-nums`}>
            Paid {money(sum.paid)} of {money(sum.total)}
            {sum.late > 0 && <span style={OWE}> · {sum.late} late</span>}
          </p>
        </div>
      </aside>
    </div>
  )
}

// A credit card's next payment, from the bank. Read-only: the bank says when it's paid.
function CardDue({ due, money }) {
  const dot = { paid: 'var(--color-redesign-in)', late: 'var(--color-redesign-accent)', due: 'var(--color-redesign-grey-3)' }[due.status]
  return (
    <div className="calm-row mb-2 grid grid-cols-1 gap-1.5 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
          <i className="size-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />
          <span className="truncate">{due.name}</span>
        </span>
        <span className={`shrink-0 ${NUM}`} style={due.status === 'late' ? OWE : undefined}>
          {!due.loan && <span className={`text-[12px] font-medium ${MUTED}`}>min </span>}
          {money(due.expected_minor, due.currency)}
        </span>
      </div>
      <div className={`flex flex-wrap gap-3 text-[13px] ${MUTED}`}>
        <span className="inline-flex items-center gap-1">
          <CreditCard className="size-3.5" aria-hidden="true" />
          {due.loan ? 'Loan' : 'Card'} · {short(due.due)}
          {due.status === 'late' && ' · overdue'}
        </span>
        {due.statement_minor != null && <span className="tabular-nums">Statement {money(due.statement_minor, due.currency)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        {due.status === 'paid' ? (
          <span className="inline-flex items-center gap-1 font-semibold" style={IN}>
            <Check className="size-3.5" aria-hidden="true" />
            Paid {short(due.paid_on)}, says your bank
          </span>
        ) : (
          <span className={MUTED}>Pay it in your bank&apos;s app; it ticks when the bank tells us.</span>
        )}
        <See to="/debts">Open in Debts</See>
      </div>
    </div>
  )
}

function BillCard({ bill, due, money, onMarkPaid, onUnmark, onDifferent, onEdit }) {
  const [busy, setBusy] = useState(false)
  if (!bill) return null
  const run = (fn) => async () => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const dot = { paid: 'var(--color-redesign-in)', late: 'var(--color-redesign-accent)', due: 'var(--color-redesign-grey-3)' }[due.status]
  return (
    <div className="calm-row mb-2 grid grid-cols-1 gap-1.5 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-2">
        <button type="button" onClick={onEdit} className="flex min-w-0 items-center gap-2 text-left text-[15px] font-semibold hover:underline">
          <i className="size-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />
          <span className="truncate">{bill.name}</span>
          <span className="sr-only">, edit</span>
        </button>
        <span className={`shrink-0 ${NUM}`} style={TONE[due.status] === IN ? undefined : TONE[due.status]}>
          {bill.varies && due.status !== 'paid' && <span className={`text-[12px] font-medium ${MUTED}`}>about </span>}
          {money(amountOf(due), bill.currency)}
        </span>
      </div>
      <div className={`flex flex-wrap gap-3 text-[13px] ${MUTED}`}>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {short(due.due)}
          {due.status === 'late' && ' · late'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Repeat className="size-3.5" aria-hidden="true" />
          {frequencyName(bill.frequency)}
          {bill.varies && ' · varies'}
        </span>
      </div>
      {due.status === 'paid' ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1 font-semibold" style={IN}>
            <Check className="size-3.5" aria-hidden="true" />
            Paid {short(due.paid_on)}
          </span>
          <button type="button" disabled={busy} onClick={run(onUnmark)} className={`underline underline-offset-4 ${MUTED}`}>
            Undo
          </button>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-2">
          <Pill disabled={busy} onClick={run(onMarkPaid)}>
            {busy ? 'Saving…' : `Mark paid`}
          </Pill>
          <Pill quiet disabled={busy} onClick={onDifferent}>
            Different amount
          </Pill>
        </div>
      )}
    </div>
  )
}

function BillDialog({ bill, household, month, onDelete, onClose, onSaved }) {
  const ref = useRef(null)
  useModal(ref)
  const cur = bill?.currency ?? household.home_currency
  const [f, setF] = useState({
    name: bill?.name ?? '',
    amount: bill ? fromMinor(bill.amount_minor, cur) : '',
    varies: bill?.varies ?? false,
    frequency: bill?.frequency ?? 'monthly',
    due_day: String(bill?.due_day ?? ''),
    starts_on: bill?.starts_on ?? month,
    category: bill?.category ?? '',
    paused: bill?.paused ?? false,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async (e) => {
    e.preventDefault()
    const minor = toMinor(f.amount, cur)
    const day = Number(f.due_day)
    if (!f.name.trim()) return setError('Give it a name, like Rent.')
    if (!minor || minor <= 0) return setError('Enter the amount, like 1500.')
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError('Enter the day of the month it’s due, 1 to 31.')
    setBusy(true)
    const body = {
      name: f.name,
      amount_minor: minor,
      varies: f.varies,
      frequency: f.frequency,
      due_day: day,
      starts_on: f.starts_on,
      category: f.category,
      paused: f.paused,
    }
    try {
      if (bill) await api(`/api/bills/${bill.id}`, { method: 'PUT', body })
      else await api('/api/bills', { method: 'POST', body: { household_id: household.id, ...body } })
      onSaved()
    } catch {
      setError("We couldn't save it. Try again in a moment.")
      setBusy(false)
    }
  }
  return (
    <dialog ref={ref} className={DIALOG} aria-labelledby="bill-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={save} className="grid gap-3 text-[14px]">
        <h2 id="bill-title" className={DIALOG_H}>
          {bill ? `Edit ${bill.name}` : 'Add a bill'}
        </h2>
        <label className="grid gap-1">
          <span className="font-semibold">Name</span>
          <input className={FIELD} value={f.name} onChange={set('name')} maxLength={60} placeholder="Rent" autoFocus={!bill} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="font-semibold">Amount ({cur})</span>
            <input className={`${FIELD} tabular-nums`} inputMode="decimal" autoComplete="off" value={f.amount} onChange={set('amount')} placeholder="1500" />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Due on day</span>
            <input className={`${FIELD} tabular-nums`} inputMode="numeric" value={f.due_day} onChange={set('due_day')} placeholder="1" />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.varies} onChange={set('varies')} className="size-4" />
          The amount changes each time (gas, electric)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="font-semibold">How often</span>
            <select className={FIELD} value={f.frequency} onChange={set('frequency')}>
              {FREQUENCIES.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">{f.frequency === 'once' ? 'In' : 'Starting'}</span>
            <input className={FIELD} type="month" value={f.starts_on} onChange={set('starts_on')} />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="font-semibold">Kind</span>
          <select className={FIELD} value={f.category} onChange={set('category')}>
            <option value="">Not set</option>
            {CATEGORIES.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {bill && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.paused} onChange={set('paused')} className="size-4" />
            Paused (it stops showing as due)
          </label>
        )}
        <p className={NOTE}>Due on the 31st means the last day in shorter months. Only household owners see bills.</p>
        {error && (
          <p className="m-0 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {bill && (
            <button type="button" onClick={onDelete} disabled={busy} className="mr-auto text-[13px] font-semibold underline underline-offset-4" style={OWE}>
              Delete
            </button>
          )}
          <Pill quiet onClick={onClose} disabled={busy}>
            Cancel
          </Pill>
          <Pill type="submit" disabled={busy}>
            {busy ? 'Saving…' : bill ? 'Save' : 'Add bill'}
          </Pill>
        </div>
      </form>
    </dialog>
  )
}
