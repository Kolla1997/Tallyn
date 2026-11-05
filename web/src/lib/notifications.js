import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api.js'
import { categoryLabel, formatMoney } from './money.js'

// In-app notifications (#267, Dinesh picked draft C with the bell top right):
// one shared list for the bell and Home's strip, so marking one read shows in
// both. The database writes the alerts (0020_notifications.sql); each person
// sees only their own.

let state = { list: null, failed: false }
const listeners = new Set()
let timer = null
let users = 0

const REFRESH_MS = 5 * 60 * 1000 // the bank sync runs every few hours; five minutes is plenty

function set(next) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export async function refresh() {
  try {
    const d = await api('/api/notifications')
    set({ list: d?.notifications ?? [], failed: false })
  } catch {
    set({ failed: true }) // keep what we had; the bell just stays as it was
  }
}

// Marks one alert read, or all of them without an id. Shown at once; the
// server catches up.
export async function markRead(id) {
  if (state.list) set({ list: state.list.map((n) => (!id || n.id === id ? { ...n, read: true } : n)) })
  try {
    await api('/api/notifications/read', { method: 'POST', body: id ? { id } : {} })
  } catch {
    refresh()
  }
}

// Closes alerts in the list (#267: the × on one, "Close all" for a day), and marks them read.
// A bank still to reconnect stays on Home's strip until it's done.
export async function dismiss(ids) {
  if (state.list) set({ list: state.list.map((n) => (ids.includes(n.id) ? { ...n, dismissed: true, read: true } : n)) })
  try {
    await api('/api/notifications/dismiss', { method: 'POST', body: { ids } })
  } catch {
    refresh()
  }
}

// What the bell's list shows: everything not closed.
export const shown = (list) => (list ?? []).filter((n) => !n.dismissed)

function onFocus() {
  if (document.visibilityState === 'visible') refresh()
}

// The list, loaded once and refreshed every five minutes and when the tab
// comes back, for as long as something on screen uses it.
export function useNotifications() {
  useEffect(() => {
    if (users++ === 0) {
      refresh()
      timer = setInterval(refresh, REFRESH_MS)
      document.addEventListener('visibilitychange', onFocus)
    }
    return () => {
      if (--users === 0) {
        clearInterval(timer)
        document.removeEventListener('visibilitychange', onFocus)
      }
    }
  }, [])
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

// What each alert says, as parts ({ b } is bold), and where it leads. Never
// an account number: the server sends names only.
export function describe(n) {
  const d = n.data ?? {}
  const m = (minor) => ({ b: formatMoney(minor, d.currency), money: true })
  switch (n.kind) {
    case 'big_purchase':
      // d.person: someone else's purchase, shared with you (a child's, or a partner's, #268).
      return d.person
        ? {
            parts: [{ b: d.person }, ' spent ', m(d.amount_minor), ` at ${d.merchant ?? 'a store'} from ${d.account ?? 'their account'}.`],
            to: '/transactions',
          }
        : { parts: ['You spent ', m(d.amount_minor), ` at ${d.merchant ?? 'a store'} from ${d.account ?? 'your account'}.`], to: '/transactions' }
    case 'low_balance':
      return {
        parts: [
          d.person ? `${d.person}'s ${d.account ?? 'account'} is down to ` : `${d.account ?? 'Your account'} is down to `,
          m(d.balance_minor),
          `, under your ${formatMoney(d.threshold_minor, d.currency)} alert.`,
        ],
        to: '/accounts',
      }
    case 'reconnect':
      return d.person
        ? { parts: [{ b: `${d.person}'s ${d.bank ?? 'bank'} needs signing in again.` }, ` Only ${d.person} can do it.`], to: '/accounts' }
        : { parts: [{ b: `${d.bank ?? 'Your bank'} needs you to sign in again.` }, " We can't update it until then."], to: '/accounts' }
    case 'payment_due': {
      // #269: three days before a card or loan is due, or once it's overdue.
      const whose = d.person ? `${d.person}'s ${d.account ?? 'card'}` : (d.account ?? 'Your card')
      const amount = d.amount_minor != null ? [m(d.amount_minor), ' '] : []
      return d.overdue
        ? { parts: [{ b: `${whose} payment is overdue.` }, ' ', ...amount, 'past due.'], to: '/debts' }
        : { parts: [`${whose}: `, ...amount, `due ${dueDay(d.due_date)}.`], to: '/debts' }
    }
    case 'joined':
      return { parts: [{ b: d.name ?? 'Someone' }, ` joined ${d.household ?? 'your household'}.`], to: '/family' }
    case 'budget_near':
    case 'budget_over': {
      // #55: a heads-up at 80% of a budget, and when it goes over.
      const b = budgetAlert(n)
      return b.over
        ? { parts: [{ b: `${b.name}: ` }, m(b.amountMinor), ` over ${formatMoney(d.limit_minor, d.currency)}.`], to: '/budgets' }
        : { parts: [{ b: `${b.name}: ` }, m(b.amountMinor), ` left of ${formatMoney(d.limit_minor, d.currency)}.`], to: '/budgets' }
    }
    default:
      return { parts: ['Something changed.'], to: '/' }
  }
}

// What a spending-limit alert shows (#55): whose budget, how much is left (or
// over) and the days to go, counted from today so an older alert stays right.
export function budgetAlert(n, today = new Date()) {
  const d = n.data ?? {}
  const over = n.kind === 'budget_over'
  const cat = d.category ? categoryLabel(d.category) : 'Everything'
  const name = d.person ? `${d.person}'s ${cat.charAt(0).toLowerCase()}${cat.slice(1)}` : cat
  const [y, mo, da] = String(d.period_to ?? '')
    .split('-')
    .map(Number)
  const end = y ? new Date(y, mo - 1, da) : null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = end ? Math.max(0, Math.round((end - start) / 86400000)) : null
  return {
    over,
    name,
    category: d.category ?? null,
    amountMinor: Math.abs((d.limit_minor ?? 0) - (d.spent_minor ?? 0)),
    share: d.limit_minor ? Math.min(1, (d.spent_minor ?? 0) / d.limit_minor) : 1,
    days: days == null ? '' : days === 1 ? '1 day to go' : days === 0 ? 'Ends today' : `${days} days to go`,
  }
}

// "Friday, Nov 7" from a date like 2026-11-07 (a calendar day, no time zone).
export function dueDay(iso) {
  const [y, mo, da] = String(iso ?? '')
    .split('-')
    .map(Number)
  if (!y || !mo || !da) return 'soon'
  return new Date(y, mo - 1, da).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// "Today, 8:02", "Yesterday", "Mon", "Oct 12", in the viewer's time zone.
export function when(iso, now = new Date()) {
  const t = new Date(iso)
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(now) - day(t)) / 86400000)
  if (days <= 0) return `Today, ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (days === 1) return 'Yesterday'
  if (days < 7) return t.toLocaleDateString('en-US', { weekday: 'short' })
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Today and Earlier, newest first.
export function groups(list, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const today = list.filter((n) => new Date(n.created_at).getTime() >= start)
  const earlier = list.filter((n) => new Date(n.created_at).getTime() < start)
  return [
    ['Today', today],
    ['Earlier', earlier],
  ].filter(([, l]) => l.length)
}

// Open alerts that need you (a bank to reconnect), for Home's strip.
export const needsYou = (list) => (list ?? []).filter((n) => n.needs_action && !n.resolved)
