// Transactions, calm draft (#185). Same jobs as web/src/screens/TransactionsPage.jsx: whose,
// search merchants, category, month and bank filters; spending by day (a day filters the list);
// the list grouped by day with day totals and Show more; a side panel with the summary (money in,
// spent, top merchants, by category) or, once a transaction is picked, its details.
// Spending by day: four forms to compare (SpendingForms.jsx). Made-up names and amounts.
import { useState } from 'react'
import { Search, ShoppingBasket, Utensils, Bus, Baby, Zap, PartyPopper, Banknote, ArrowLeftRight, ArrowLeft, MapPin } from 'lucide-react'
import SpendingByDay from './SpendingForms.jsx'
import * as D from '../home/data.js'
import { Panel, Rows, Note, Chips, PageHead, Button, See, usd } from './ui.jsx'

const ICON = {
  Groceries: ShoppingBasket,
  'Eating out': Utensils,
  Transport: Bus,
  Kids: Baby,
  Bills: Zap,
  Fun: PartyPopper,
  Pay: Banknote,
  Transfer: ArrowLeftRight,
}
// Made up. Spending is negative, money in positive. `who` is whose account it hit.
const TXS = [
  { id: 1, day: '2026-10-24', name: 'Whole Foods', cat: 'Groceries', acct: 'Everyday checking', who: 'You', amt: -86.4, pending: true, place: 'Brooklyn, NY' },
  { id: 2, day: '2026-10-24', name: 'Shell', cat: 'Transport', acct: 'Joint checking', who: 'James', amt: -48.1, place: 'Hoboken, NJ' },
  { id: 3, day: '2026-10-23', name: 'Little Sprouts', cat: 'Kids', acct: 'Joint checking', who: 'James', amt: -120.0 },
  { id: 4, day: '2026-10-23', name: 'Spotify', cat: 'Fun', acct: 'Credit card', who: 'You', amt: -16.99 },
  { id: 5, day: '2026-10-22', name: 'Nando’s', cat: 'Eating out', acct: 'Credit card', who: 'You', amt: -38.75, place: 'Brooklyn, NY' },
  { id: 6, day: '2026-10-22', name: 'Trader Joe’s', cat: 'Groceries', acct: 'Everyday checking', who: 'You', amt: -64.3, place: 'Brooklyn, NY' },
  { id: 7, day: '2026-10-22', name: 'Target', cat: 'Kids', acct: 'Joint checking', who: 'James', amt: -42.18 },
  { id: 8, day: '2026-10-21', name: 'Con Edison', cat: 'Bills', acct: 'Joint checking', who: 'James', amt: -145.0 },
  { id: 9, day: '2026-10-21', name: 'Chipotle', cat: 'Eating out', acct: 'Teen savings', who: 'Leo', amt: -12.4, place: 'Brooklyn, NY' },
  { id: 10, day: '2026-10-20', name: 'MTA', cat: 'Transport', acct: 'Everyday checking', who: 'You', amt: -34.0 },
  { id: 11, day: '2026-10-20', name: 'Tesco', cat: 'Groceries', acct: 'UK current account', who: 'You', amt: -41.2, note: '£31.69' },
  { id: 12, day: '2026-10-15', name: 'Harlow & Co', cat: 'Pay', acct: 'Everyday checking', who: 'You', amt: 4210.0 },
  { id: 13, day: '2026-10-15', name: 'James Rivera', cat: 'Pay', acct: 'Joint checking', who: 'James', amt: 1800.0 },
]
const WHO = [
  ['yours', 'Yours'],
  ['James', 'James'],
  ['Leo', 'Leo'],
  ['everyone', 'Everyone'],
]
const CATS = ['Groceries', 'Eating out', 'Transport', 'Kids', 'Bills', 'Fun', 'Pay']
const BANKS = ['Everyday checking', 'Joint checking', 'Credit card', 'UK current account', 'Teen savings']
const dayLabel = (d) => {
  const n = Number(d.slice(8))
  return n === 24
    ? 'Today'
    : n === 23
      ? 'Yesterday'
      : new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
const signed = (v) => `${v > 0 ? '+' : '−'}${usd(Math.abs(v))}`

const Select = ({ label, value, onChange, children }) => (
  <label className="min-w-0">
    <span className="sr-only">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      {children}
    </select>
  </label>
)

// With nothing narrowing it, October's summary is the month's real totals (the same $3,486 as Home);
// the list only shows the latest rows. Filters add up the rows they match.
function Summary({ list, scopeLabel, wholeMonth }) {
  const moneyIn = list.filter((t) => t.amt > 0).reduce((s, t) => s + t.amt, 0)
  const spent = wholeMonth ? D.spent : -list.filter((t) => t.amt < 0).reduce((s, t) => s + t.amt, 0)
  const byMerchant = Object.entries(list.filter((t) => t.amt < 0).reduce((m, t) => ((m[t.name] = (m[t.name] || 0) - t.amt), m), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  const byCat = wholeMonth
    ? D.cats.map((c) => [c.name, c.spent]).sort((a, b) => b[1] - a[1])
    : Object.entries(list.filter((t) => t.amt < 0).reduce((m, t) => ((m[t.cat] = (m[t.cat] || 0) - t.amt), m), {})).sort((a, b) => b[1] - a[1])
  const top = byCat[0]?.[1] || 1
  return (
    <div className="grid gap-3">
      <Panel id="sum-h" title={scopeLabel}>
        {list.length === 0 ? (
          <Note>Nothing to add up for these filters.</Note>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Note>Money in</Note>
              <p className="font-[family-name:'Space_Grotesk'] text-xl font-semibold tabular-nums" style={{ color: 'var(--in-text)' }}>
                +{usd(moneyIn)}
              </p>
            </div>
            <div>
              <Note>Spent</Note>
              <p className="font-[family-name:'Space_Grotesk'] text-xl font-semibold tabular-nums">−{usd(spent)}</p>
            </div>
          </div>
        )}
      </Panel>
      <Panel id="merch-h" title="Top merchants">
        {byMerchant.length === 0 ? (
          <Note>No spending here.</Note>
        ) : (
          <Rows>
            {byMerchant.map(([n, v]) => (
              <li key={n} className="flex justify-between gap-3 py-2 text-sm">
                <span className="truncate font-semibold">{n}</span>
                <span className="font-[family-name:'Space_Grotesk'] font-semibold tabular-nums">{usd(v)}</span>
              </li>
            ))}
          </Rows>
        )}
      </Panel>
      <Panel id="cat-h" title="By category">
        <ul aria-label="Categories" className="grid gap-2.5">
          {byCat.map(([c, v]) => (
            <li key={c}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{c}</span>
                <span className="font-[family-name:'Space_Grotesk'] font-semibold tabular-nums">{usd(v)}</span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <span className="block h-full rounded-full bg-zinc-500" style={{ width: `${(v / top) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

function Details({ tx, onBack, onMerchant }) {
  const I = ICON[tx.cat] || ArrowLeftRight
  return (
    <Panel id="tx-details-h">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to summary
      </button>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          <I className="size-5" aria-hidden="true" />
        </span>
        <h2 id="tx-details-h" className="grow font-[family-name:'Space_Grotesk'] text-lg font-semibold">
          {tx.name}
        </h2>
        <span className="font-[family-name:'Space_Grotesk'] text-lg font-semibold tabular-nums" style={tx.amt > 0 ? { color: 'var(--in-text)' } : undefined}>
          {signed(tx.amt)}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-[96px_1fr] gap-y-2 text-sm">
        <dt className="text-zinc-500 dark:text-zinc-400">When</dt>
        <dd>
          {dayLabel(tx.day)}
          {tx.pending && ' · pending'}
        </dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Who</dt>
        <dd>{tx.who}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Account</dt>
        <dd>
          {tx.acct}
          {tx.note && ` · ${tx.note}`}
        </dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Category</dt>
        <dd>{tx.cat}</dd>
      </dl>
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-[13px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        {tx.place || 'No location for this one.'}
      </p>
      <button
        type="button"
        onClick={() => onMerchant(tx.name)}
        className="mt-3 text-[13px] font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-4 dark:text-white dark:decoration-zinc-600"
      >
        All from {tx.name}
      </button>
    </Panel>
  )
}

export default function Transactions() {
  const [who, setWho] = useState('everyone')
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('')
  const [month, setMonth] = useState('2026-10')
  const [bank, setBank] = useState('')
  const [day, setDay] = useState('')
  const [picked, setPicked] = useState(null)
  const [more, setMore] = useState(false)
  const list = TXS.filter(
    (t) =>
      (who === 'everyone' || (who === 'yours' ? t.who === 'You' : t.who === who)) &&
      (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
      (!cat || t.cat === cat) &&
      (!month || t.day.startsWith(month)) &&
      (!bank || t.acct === bank) &&
      (!day || t.day === day),
  )
  const shown = more ? list : list.slice(0, 10)
  const groups = Object.entries(shown.reduce((g, t) => ((g[t.day] = g[t.day] || []).push(t), g), {}))
  const filtered = who !== 'everyone' || search || cat || bank || day
  const pickedTx = TXS.find((t) => t.id === picked)
  const scopeLabel = day ? dayLabel(day) : month ? 'October' : 'All time'

  return (
    <>
      <PageHead title="Transactions" sub="Everything you can see in your household" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 [&>*]:min-w-0">
        <section
          aria-label="Filter transactions"
          className="rounded-2xl border border-zinc-200 bg-white p-4 lg:col-span-12 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <Chips label="Whose transactions" options={WHO} value={who} onChange={setWho} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <label className="relative sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Search merchants</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search merchants"
                value={search}
                maxLength={100}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-zinc-200 bg-white pr-3 pl-9 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <Select label="Category" value={cat} onChange={setCat}>
              <option value="">All categories</option>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select label="Month" value={month} onChange={setMonth}>
              <option value="">All months</option>
              <option value="2026-10">October 2026</option>
              <option value="2026-09">September 2026</option>
            </Select>
            <Select label="Bank" value={bank} onChange={setBank}>
              <option value="">All banks</option>
              {BANKS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
            <Select label="Day" value={day} onChange={setDay}>
              <option value="">Any day</option>
              {[...new Set(TXS.map((t) => t.day))].map((d) => (
                <option key={d} value={d}>
                  {dayLabel(d)}
                </option>
              ))}
            </Select>
          </div>
          {day && (
            <p className="mt-2 text-[13px]">
              Showing {dayLabel(day)}{' '}
              <button type="button" onClick={() => setDay('')} className="font-semibold underline underline-offset-4">
                Clear
              </button>
            </p>
          )}
        </section>

        <div className="lg:col-span-7">
          <div className="mb-3">
            <SpendingByDay sel={day} onPick={setDay} />
          </div>
          {list.length === 0 ? (
            <Panel id="tx-empty-h">
              <Note>
                {filtered
                  ? 'No transactions match. Try another person, search, category or month.'
                  : 'No transactions yet. A new bank can take a few minutes to show its history.'}
              </Note>
            </Panel>
          ) : (
            <section aria-label="Transactions" className="rounded-2xl border border-zinc-200 bg-white px-4 pb-2 dark:border-zinc-800 dark:bg-zinc-900">
              {groups.map(([d, txs]) => (
                <div key={d}>
                  <h2 className="flex justify-between gap-3 pt-4 pb-1 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
                    <span>{dayLabel(d)}</span>
                    <span className="tabular-nums">{signed(txs.reduce((s, t) => s + t.amt, 0))}</span>
                  </h2>
                  <Rows>
                    {txs.map((t) => {
                      const I = ICON[t.cat] || ArrowLeftRight
                      const sel = picked === t.id
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => setPicked(sel ? null : t.id)}
                            aria-pressed={sel}
                            className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-zinc-50 aria-pressed:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:aria-pressed:bg-zinc-800"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                              <I className="size-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 grow">
                              <span className="block truncate text-sm font-semibold">
                                {t.name}
                                {t.pending && (
                                  <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                    Pending
                                  </span>
                                )}
                              </span>
                              <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                                {t.cat} · {t.acct} · {t.who}
                              </span>
                            </span>
                            <span
                              className="shrink-0 font-[family-name:'Space_Grotesk'] text-sm font-semibold whitespace-nowrap tabular-nums"
                              style={t.amt > 0 ? { color: 'var(--in-text)' } : undefined}
                            >
                              {signed(t.amt)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </Rows>
                </div>
              ))}
            </section>
          )}
          {list.length > 10 && !more && (
            <div className="mt-3 flex justify-center">
              <Button quiet onClick={() => setMore(true)}>
                Show more
              </Button>
            </div>
          )}
          {!pickedTx && list.length > 0 && <Note className="mt-2 text-center">Pick a transaction to see its details</Note>}
        </div>
        <aside aria-label={pickedTx ? 'Transaction details' : 'Summary'} className="lg:sticky lg:top-16 lg:col-span-5 lg:self-start">
          {pickedTx ? (
            <Details
              tx={pickedTx}
              onBack={() => setPicked(null)}
              onMerchant={(n) => {
                setPicked(null)
                setSearch(n)
              }}
            />
          ) : (
            <Summary list={list} scopeLabel={scopeLabel} wholeMonth={!filtered && month === '2026-10'} />
          )}
          <p className="mt-2 px-1">
            <See>Budgets</See>
          </p>
        </aside>
      </div>
    </>
  )
}
