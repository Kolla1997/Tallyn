import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { cleanName } from '../components/TransactionRow.jsx'
import { categoryPath } from '../components/TxIcon.jsx'
import { Head, Panel, See, Rows, IconTile, Money, Pill, Chips, MUTED, IN } from '../components/calm/ui.jsx'
import SpendingBars from '../components/SpendingBars.jsx'
import { TxDetails, TxSummary } from '../components/TxSummary.jsx'
import { api } from '../lib/api.js'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { nameOf } from '../lib/people.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import LoadFailed, { StaleBanner } from '../components/LoadFailed.jsx'
import { useBusy, useFadeOnChange } from '../lib/motion.js'

const FIELD = 'h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px]'
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
const thisMonth = () => new Date().toISOString().slice(0, 7)
const monthLabel = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

// Filters from the address (Home's spending card links here with
// ?category=…&month=…, Family with ?owner=…), if they're ones we know.
export function fromAddress(key) {
  const v = new URLSearchParams(window.location.search).get(key) ?? ''
  if (key === 'category') return CATEGORIES.includes(v) ? v : ''
  if (key === 'owner') return v === 'all' || /^[0-9a-f-]{36}$/i.test(v) ? v : ''
  if (key === 'bank') return /^[0-9a-f-]{36}$/i.test(v) ? v : ''
  if (key === 'day') return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) ? v : ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : ''
}

export default function TransactionsPage({ me, household, refreshKey }) {
  const [members, setMembers] = useState([])
  // Whose: your own by default (Dinesh), 'all' for everyone, else a member's ID.
  const [who, setWho] = useState(() => fromAddress('owner') || me.user_id)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('') // search, applied after a short pause
  const [category, setCategory] = useState(() => fromAddress('category'))
  const [month, setMonth] = useState(() => fromAddress('month'))
  const [day, setDay] = useState(() => fromAddress('day')) // a dot clicked in the year of dots (#75)
  const [bank, setBank] = useState(() => fromAddress('bank')) // a linked bank's ID (#83)
  const [banks, setBanks] = useState([])
  const [daily, setDaily] = useState(null)
  const [list, setList] = useState(null)
  const [summary, setSummary] = useState(null)
  const [picked, setPicked] = useState(() => new URLSearchParams(window.location.search).get('tx') ?? '')
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // A filter change is loading (#87): the list and summary dim until both
  // arrive, then fade in; the dots card does the same for its own data.
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(0)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState(false) // the last load failed (#151)
  const [attempt, setAttempt] = useState(0) // Try again
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
    if (who !== me.user_id) p.set('owner', who)
    if (category) p.set('category', category)
    if (bank) p.set('bank', bank)
    if (day) p.set('day', day)
    else if (month) p.set('month', month)
    if (picked) p.set('tx', picked)
    const url = p.size ? `/transactions?${p}` : '/transactions'
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url)
  }, [who, category, bank, month, day, picked, me.user_id])

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const filters = () => {
    const p = new URLSearchParams({ household_id: household.id })
    if (who !== 'all') p.set('owner', who)
    if (query) p.set('q', query)
    if (category) p.set('category', category)
    if (bank) p.set('bank', bank)
    if (day) p.set('day', day)
    else if (month) p.set('month', month)
    return p
  }
  const url = (offset) => {
    const p = filters()
    p.set('limit', String(PAGE))
    p.set('offset', String(offset))
    return `/api/transactions?${p}`
  }

  // First page whenever the filters change. Only the newest request may
  // update the list, so fast typing can't show stale results.
  useEffect(() => {
    const id = ++request.current
    setError('')
    setLoading(true)
    let left = 2
    const done = () => {
      if (id !== request.current || --left > 0) return
      setLoading(false)
      setLoaded((n) => n + 1)
    }
    api(url(0))
      .then(
        (d) => {
          if (id !== request.current) return
          setList(d.transactions)
          setMore(d.more)
          setFailed(false)
        },
        () => id === request.current && setFailed(true),
      )
      .finally(done)
    // Totals over every matching transaction, not just this page (#58).
    api(`/api/transactions/summary?${filters()}`)
      .then(
        (d) => id === request.current && setSummary(d.summary),
        () => id === request.current && setSummary([]),
      )
      .finally(done)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household.id, who, query, category, bank, month, day, refreshKey, attempt])

  // The year of dots: this year's spending per day, for the same person,
  // search and category (not the month or day, which it's for choosing).
  const year = String(new Date().getFullYear())
  useEffect(() => {
    const p = new URLSearchParams({ household_id: household.id, year })
    if (who !== 'all') p.set('owner', who)
    if (query) p.set('q', query)
    if (category) p.set('category', category)
    if (bank) p.set('bank', bank)
    let live = true
    setDailyLoading(true)
    api(`/api/transactions/daily?${p}`)
      .then(
        (d) => live && setDaily(d.days),
        () => live && setDaily([]),
      )
      .finally(() => live && setDailyLoading(false))
    return () => {
      live = false
    }
  }, [household.id, who, query, category, bank, year, refreshKey])

  // Banks for the filter (#83): the ones whose balances you may see, for
  // the person picked above. Banks shared without balances stay hidden.
  useEffect(() => {
    api(`/api/banks?household_id=${encodeURIComponent(household.id)}`).then(
      (d) => setBanks(d.banks ?? []),
      () => setBanks([]),
    )
  }, [household.id, refreshKey])
  const bankChoices = useMemo(() => {
    const seen = new Map()
    for (const b of banks) {
      if (who !== 'all' && b.owner_user_id !== who) continue
      seen.set(b.id, b.institution_name || 'Bank')
    }
    return [...seen].sort((x, y) => x[1].localeCompare(y[1]))
  }, [banks, who])
  // Switching person drops a bank that isn't theirs.
  useEffect(() => {
    if (bank && banks.length > 0 && !bankChoices.some(([id]) => id === bank)) setBank('')
  }, [bank, banks, bankChoices])

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
  const filtered = who !== me.user_id || query || category || bank || month || day
  const busy = useBusy(loading)
  const fading = useFadeOnChange(loaded)
  const dotsBusy = useBusy(dailyLoading)
  const zone = (b, f) => ['busy-zone', b && 'is-busy', f && 'is-fading'].filter(Boolean).join(' ')
  const months = recentMonths()
  const pickedTx = list?.find((t) => t.id === picked) ?? null
  const home = household.home_currency
  const totals = summary?.find((s) => s.currency === home) ?? summary?.[0] ?? null
  const dayLabelLong = day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const scope = [
    day ? dayLabelLong : month ? monthLabel(month) : 'All time',
    who === 'all' ? 'everyone' : who === me.user_id ? 'yours' : nameOf(people[who] ?? { user_id: who }),
    bankChoices.find(([id]) => id === bank)?.[1],
  ]
    .filter(Boolean)
    .join(' · ')

  // Esc closes the details.
  useEffect(() => {
    if (!picked) return
    const onKey = (e) => e.key === 'Escape' && setPicked('')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked])

  return (
    <div className="calm">
      <Head title="Transactions" sub={iAmKid ? 'Your transactions' : 'Everything you can see in your household'} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 [&>*]:min-w-0">
        <section aria-label="Filter transactions" className="calm-solid rounded-2xl p-4 lg:col-span-12">
          {others.length > 0 && (
            <Chips
              label="Whose transactions"
              options={[[me.user_id, 'Yours'], ...others.map((m) => [m.user_id, nameOf(m)]), ['all', 'Everyone']]}
              value={who}
              onChange={setWho}
            />
          )}
          <div className={`grid gap-2 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr] ${others.length > 0 ? 'mt-3' : ''}`}>
            <label className="relative sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Search merchants</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search merchants"
                value={search}
                maxLength={100}
                onChange={(e) => setSearch(e.target.value)}
                className={`${FIELD} pr-3 pl-9`}
              />
            </label>
            <label>
              <span className="sr-only">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
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
              <select
                value={day ? '' : month}
                onChange={(e) => {
                  setDay('')
                  setMonth(e.target.value)
                }}
                className={FIELD}
              >
                <option value="">All months</option>
                {month && !months.includes(month) && <option value={month}>{monthLabel(month)}</option>}
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Bank</span>
              <select value={bank} onChange={(e) => setBank(e.target.value)} className={FIELD}>
                <option value="">All banks</option>
                {bankChoices.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {day && (
            <p className="mt-2 text-[13px]">
              Showing {dayLabelLong}{' '}
              <button type="button" onClick={() => setDay('')} className="font-semibold underline underline-offset-4">
                Clear
              </button>
            </p>
          )}
        </section>

        {error && (
          <p className="error lg:col-span-12" role="alert">
            {error}
          </p>
        )}

        <div className={`lg:col-span-7 ${zone(busy, fading)}`} aria-busy={busy}>
          <section aria-label="Spending by day" aria-busy={dotsBusy} className={`calm-glass mb-3 rounded-2xl p-4 ${zone(dotsBusy, false)}`}>
            <SpendingBars
              month={month || (day ? day.slice(0, 7) : thisMonth())}
              days={daily}
              home={home}
              selected={day}
              onPick={(d) => {
                setPicked('')
                setDay(d)
              }}
            />
          </section>
          {failed && list && <StaleBanner what="your transactions" busy={loading} onRetry={() => setAttempt((n) => n + 1)} />}
          {!list ? (
            failed ? (
              <LoadFailed what="your transactions" busy={loading} onRetry={() => setAttempt((n) => n + 1)} />
            ) : (
              <TallynLoader />
            )
          ) : list.length === 0 ? (
            <Panel label="No transactions">
              <p className={`text-[13px] ${MUTED}`}>
                {filtered
                  ? 'No transactions match. Try another person, search, category or month.'
                  : 'No transactions yet. A new bank can take a few minutes to show its history.'}
              </p>
            </Panel>
          ) : (
            <>
              <section aria-label="Transactions" className="calm-solid rounded-2xl px-4 pb-2">
                {groups.map(([d, txs]) => (
                  <div key={d}>
                    <h2 className={`flex justify-between gap-3 pt-4 pb-1 text-[13px] font-semibold ${MUTED}`}>
                      <span>{dayLabel(d)}</span>
                      <span className="tabular-nums">{dayTotal(txs)}</span>
                    </h2>
                    <Rows>
                      {txs.map((tx) => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          who={tx.owner_user_id === me.user_id ? 'You' : nameOf(people[tx.owner_user_id] ?? { user_id: tx.owner_user_id })}
                          selected={tx.id === picked}
                          onSelect={() => setPicked(tx.id === picked ? '' : tx.id)}
                        />
                      ))}
                    </Rows>
                  </div>
                ))}
              </section>
              {more && (
                <div className="mt-3 flex justify-center">
                  <Pill quiet onClick={showMore}>
                    {loadingMore ? 'Loading…' : 'Show more'}
                  </Pill>
                </div>
              )}
              {!pickedTx && <p className={`mt-2 text-center text-[13px] ${MUTED}`}>Pick a transaction to see its details</p>}
            </>
          )}
        </div>

        <aside aria-label={pickedTx ? 'Transaction details' : 'Summary'} className={`lg:sticky lg:top-3 lg:col-span-5 lg:self-start ${zone(busy, fading)}`}>
          {pickedTx ? (
            <TxDetails
              tx={pickedTx}
              meId={me.user_id}
              people={people}
              onBack={() => setPicked('')}
              onMerchant={(name) => {
                setPicked('')
                setSearch(name)
              }}
            />
          ) : (
            <TxSummary totals={totals} scope={scope} month={day ? '' : month} day={day} />
          )}
          <p className="mt-2 px-1">
            <See to="/budgets">Budgets</See>
          </p>
        </aside>
      </div>
    </div>
  )
}

// One transaction as a row you can pick for its details.
function TxRow({ tx, who, selected, onSelect }) {
  const out = tx.amount_minor > 0
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-zinc-50 aria-pressed:bg-zinc-100"
      >
        <IconTile>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d={categoryPath(tx.category_primary)} />
          </svg>
        </IconTile>
        <span className="min-w-0 grow">
          <span className="block truncate text-[14px] font-semibold">
            {cleanName(tx.merchant || tx.name || 'Transaction')}
            {tx.pending && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">Pending</span>}
          </span>
          <span className={`block truncate text-[13px] ${MUTED}`}>
            {[categoryLabel(tx.category_primary), tx.bank_name && `${tx.bank_name}${tx.account_mask ? ` ··${tx.account_mask}` : ''}`, who]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <Money className="text-[14px]" tone={out ? undefined : IN}>
          {out ? '−' : '+'}
          {formatMoney(Math.abs(tx.amount_minor), tx.currency)}
        </Money>
      </button>
    </li>
  )
}

// A day's net: money in minus money out, as shown on the rows.
function dayTotal(txs) {
  const net = -txs.reduce((t, tx) => t + tx.amount_minor, 0)
  const cur = txs[0]?.currency
  if (txs.some((tx) => tx.currency !== cur)) return ''
  return `${net > 0 ? '+' : net < 0 ? '−' : ''}${formatMoney(Math.abs(net), cur)}`
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
