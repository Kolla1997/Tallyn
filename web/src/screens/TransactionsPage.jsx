import { useEffect, useMemo, useRef, useState } from 'react'
import TransactionRow from '../components/TransactionRow.jsx'
import { api } from '../lib/api.js'
import { categoryLabel } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import { PageHead } from './Shell.jsx'

// All transactions (#42): switch between household members, search by
// merchant, filter by category, grouped by day, 50 at a time. The API only
// returns what this person may see (#28); the filters only narrow it.

const PAGE = 50
const CATEGORIES = [
  'FOOD_AND_DRINK',
  'GENERAL_MERCHANDISE',
  'TRANSPORTATION',
  'TRAVEL',
  'RENT_AND_UTILITIES',
  'HOME_IMPROVEMENT',
  'ENTERTAINMENT',
  'PERSONAL_CARE',
  'MEDICAL',
  'GENERAL_SERVICES',
  'GOVERNMENT_AND_NON_PROFIT',
  'BANK_FEES',
  'LOAN_PAYMENTS',
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
]
const KID = new Set(['teen', 'child'])

// The last 12 months, newest first, as "2026-10".
function recentMonths() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}
const monthLabel = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

// Filters from the address (Home's spending card links here with
// ?category=…&month=…, Family with ?owner=…), if they're ones we know.
function fromAddress(key) {
  const v = new URLSearchParams(window.location.search).get(key) ?? ''
  if (key === 'category') return CATEGORIES.includes(v) ? v : ''
  if (key === 'owner') return /^[0-9a-f-]{36}$/i.test(v) ? v : ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : ''
}

export default function TransactionsPage({ me, household, refreshKey }) {
  const [members, setMembers] = useState([])
  const [who, setWho] = useState(() => fromAddress('owner')) // '' everyone, else a user ID
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('') // search, applied after a short pause
  const [category, setCategory] = useState(() => fromAddress('category'))
  const [month, setMonth] = useState(() => fromAddress('month'))
  const [list, setList] = useState(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)

  useEffect(() => {
    api(`/api/households/${encodeURIComponent(household.id)}/members`).then(
      (d) => setMembers(d.members),
      () => {},
    )
  }, [household.id])

  // Keep the category and month in the address, so links and Back work.
  useEffect(() => {
    const p = new URLSearchParams()
    if (who) p.set('owner', who)
    if (category) p.set('category', category)
    if (month) p.set('month', month)
    const url = p.size ? `/transactions?${p}` : '/transactions'
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url)
  }, [who, category, month])

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const url = (offset) => {
    const p = new URLSearchParams({ household_id: household.id, limit: String(PAGE), offset: String(offset) })
    if (who) p.set('owner', who)
    if (query) p.set('q', query)
    if (category) p.set('category', category)
    if (month) p.set('month', month)
    return `/api/transactions?${p}`
  }

  // First page whenever the filters change. Only the newest request may
  // update the list, so fast typing can't show stale results.
  useEffect(() => {
    const id = ++request.current
    setError('')
    api(url(0)).then(
      (d) => {
        if (id !== request.current) return
        setList(d.transactions)
        setMore(d.more)
      },
      () => id === request.current && setError("We couldn't load transactions. Try again in a moment."),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household.id, who, query, category, month, refreshKey])

  async function showMore() {
    setLoadingMore(true)
    const id = request.current
    try {
      const d = await api(url(list.length))
      if (id === request.current) {
        setList([...list, ...d.transactions])
        setMore(d.more)
      }
    } catch {
      setError("We couldn't load more transactions.")
    }
    setLoadingMore(false)
  }

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const iAmKid = KID.has(household.role)
  // Teens and children only ever see their own, so they get no switcher.
  const others = iAmKid ? [] : members.filter((m) => !m.is_you)
  const groups = useMemo(() => groupByDay(list ?? []), [list])
  const filtered = who || query || category || month
  const months = recentMonths()

  return (
    <>
      <PageHead title="Transactions" sub={iAmKid ? 'Your transactions' : 'Everything you can see in your household'} />

      <section className="panel tx-filters" aria-label="Filter transactions">
        {others.length > 0 && (
          <div className="chips" role="group" aria-label="Whose transactions">
            {[['', 'Everyone'], [me.user_id, 'Yours'], ...others.map((m) => [m.user_id, nameOf(m)])].map(([id, label]) => (
              <button key={id || 'all'} className="chip" aria-pressed={who === id} onClick={() => setWho(id)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="filter-row">
          <label className="grow">
            <span className="sr-only">Search merchants</span>
            <input type="search" placeholder="Search merchants" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Month</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {month && !months.includes(month) && <option value={month}>{monthLabel(month)}</option>}
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!list ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <section className="panel empty-state">
          <p className="muted">
            {filtered
              ? 'No transactions match. Try another person, search, category or month.'
              : 'No transactions yet. A new bank can take a few minutes to show its history.'}
          </p>
        </section>
      ) : (
        <div className="tx-days">
          {groups.map(([day, txs]) => (
            <section key={day} className="panel" aria-label={dayLabel(day)}>
              <h2 className="day-heading">{dayLabel(day)}</h2>
              <ul className="rows">
                {txs.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} meId={me.user_id} people={people} showDate={false} />
                ))}
              </ul>
            </section>
          ))}
          {more && (
            <button className="btn btn-secondary show-more" onClick={showMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </>
  )
}

// Groups by posted date, which is the order the server returns.
function groupByDay(list) {
  const out = []
  for (const tx of list) {
    const last = out[out.length - 1]
    if (last && last[0] === tx.date) last[1].push(tx)
    else out.push([tx.date, [tx]])
  }
  return out
}

function dayLabel(day) {
  const d = new Date(`${day}T12:00:00`)
  const today = new Date()
  const yesterday = new Date(Date.now() - 864e5)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  })
}
