import { useEffect, useMemo, useState } from 'react'
import AccountIcon from '../components/AccountIcon.jsx'
import { categoryPath } from '../components/TxIcon.jsx'
import TransactionRow from '../components/TransactionRow.jsx'
import { api } from '../lib/api.js'
import { categoryLabel, formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { Link } from '../lib/router.jsx'
import { currencies, isOwed, ownerGroup, summarize } from '../lib/summary.js'
import CreditCards from '../components/CreditCards.jsx'
import CountUp from '../components/CountUp.jsx'
import { useFadeOnChange } from '../lib/motion.js'
import { LinkBank } from './Banks.jsx'
import { PageHead } from './Shell.jsx'
import TallynLoader from '../components/TallynLoader.jsx'

// Home (#39 step 2), matching docs/03 Design/Comps/web-app-draft.html:
// total balance and net worth, your accounts apart from money shared with you
// (#37), recent transactions by person, spending this month, family, goals.
// Everything shown is what the API returns for this person, so the sharing
// rules (#28) already apply.

// Loan payments count as transfers, not spending (#77).
const NOT_SPENDING = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])
const now = new Date()
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const monthName = (d) => d.toLocaleDateString('en-US', { month: 'long' })

export default function HomePage({ me, household, refreshKey, onChanged }) {
  const [banks, setBanks] = useState(null)
  const [members, setMembers] = useState([])
  const [txs, setTxs] = useState(null)
  const [mine, setMine] = useState(null)
  const [spending, setSpending] = useState(null) // { yours, everyone } summaries for this month
  const [scope, setScope] = useState('yours') // Home opens on your own money (#68)
  const [error, setError] = useState('')

  useEffect(() => {
    const hh = encodeURIComponent(household.id)
    setError('')
    Promise.all([
      api(`/api/banks?household_id=${hh}`),
      api(`/api/households/${hh}/members`),
      api(`/api/transactions?household_id=${hh}&limit=200`),
      api(`/api/transactions?household_id=${hh}&owner=${encodeURIComponent(me.user_id)}&limit=100`),
      api(`/api/transactions/summary?household_id=${hh}&month=${MONTH}&owner=${encodeURIComponent(me.user_id)}`),
      api(`/api/transactions/summary?household_id=${hh}&month=${MONTH}`),
    ]).then(
      ([b, m, t, y, sy, se]) => {
        setBanks(b.banks)
        setMembers(m.members)
        setTxs(t.transactions)
        setMine(y.transactions)
        const cats = (d) => d.summary.flatMap((x) => x.categories)
        setSpending({ yours: cats(sy), everyone: cats(se) })
      },
      () => setError("We couldn't load your household's money. Try again in a moment."),
    )
  }, [household.id, me.user_id, refreshKey])

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const roles = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.role])), [members])
  const canLink = household.role === 'owner' || household.role === 'adult'
  const wide = useMinWidth(1440)
  const greeting = me.display_name ? `Hello, ${me.display_name}` : 'Hello'

  return (
    <>
      <PageHead title={household.name} sub={greeting}>
        {canLink && <LinkBank householdId={household.id} onLinked={onChanged} onError={setError} />}
        {/* One button for the Family page, where inviting and sharing both
            live (#97, A: Share with family and Invite went to the same page). */}
        <Link to="/family" className="btn btn-secondary">
          Family and sharing
        </Link>
      </PageHead>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!banks ? (
        <TallynLoader />
      ) : (
        <HomeColumns
          wide={wide}
          total={<TotalCard banks={banks} txs={txs ?? []} mine={mine ?? []} me={me} roles={roles} home={household.home_currency} scope={scope} onScope={setScope} />}
          accounts={<YourAccounts banks={banks} me={me} canLink={canLink} home={household.home_currency} everyone={scope === 'everyone'} />}
          cards={<CreditCards banks={banks} me={me} home={household.home_currency} everyone={scope === 'everyone'} onChanged={onChanged} onError={setError} />}
          recent={<RecentTransactions txs={(scope === 'yours' ? mine : txs) ?? []} me={me} people={people} everyone={scope === 'everyone'} />}
          spending={<SpendingCard spending={spending?.[scope] ?? []} month={MONTH} home={household.home_currency} everyone={scope === 'everyone'} />}
          shared={<SharedWithYou banks={banks} me={me} people={people} roles={roles} home={household.home_currency} />}
          family={<FamilyCard members={members} isOwner={household.role === 'owner'} />}
          goals={
            <section className="panel panel-dashed" aria-labelledby="goals-h">
              <div className="panel-head">
                <h2 id="goals-h">Goals</h2>
                <span className="tag">Coming soon</span>
              </div>
              <p className="small muted">Save for a trip or a school fund, and let a savings account keep track for you.</p>
            </section>
          }
        />
      )}
    </>
  )
}

// Three columns on wide screens (1440px and up), two from 1280px, one below
// (the one- and two-column cases share markup; CSS stacks them under 1280px).
function HomeColumns({ wide, total, accounts, cards, recent, spending, shared, family, goals }) {
  if (wide) {
    return (
      <div className="cols cols-3">
        <div className="col">
          {total}
          {accounts}
          {cards}
        </div>
        <div className="col">
          {spending}
          {recent}
        </div>
        <div className="col">
          {shared}
          {family}
          {goals}
        </div>
      </div>
    )
  }
  return (
    <div className="cols">
      <div className="col">
        {total}
        {accounts}
        {cards}
        {recent}
      </div>
      <div className="col">
        {spending}
        {shared}
        {family}
        {goals}
      </div>
    </div>
  )
}

function useMinWidth(px) {
  const query = `(min-width: ${px}px)`
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatch(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return match
}

// The balance card (#68): your own money first, or everyone's you can see.
// The switch here changes the whole Home page.
function TotalCard({ banks, txs, mine, me, roles, home, scope, onScope }) {
  const fading = useFadeOnChange(scope) // #87: Yours / Everyone fades and counts
  const totals = summarize(banks, me.user_id, roles)
  const yoursOnly = summarize(banks.filter((b) => b.owner_user_id === me.user_id), me.user_id, roles)
  const list = currencies(totals, home)
  if (list.length === 0) {
    return (
      <section className="panel total-card" aria-label="Total balance">
        <p className="total-label">Total balance</p>
        <p className="amount total-big">—</p>
        <p className="small total-note">Link a bank to see your total.</p>
      </section>
    )
  }
  const cur = list[0]
  const t = totals[cur]
  const y = yoursOnly[cur] ?? { have: 0, owe: 0, net: 0 }
  const yours = scope === 'yours'

  // Money in minus money out this month, from recent transactions in this currency.
  const start = new Date()
  const monthStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  let flow = 0
  let any = false
  for (const tx of yours ? mine : txs) {
    if (tx.currency !== cur || tx.date < monthStart || NOT_SPENDING.has(tx.category_primary ?? '')) continue
    flow -= tx.amount_minor // Plaid: positive = money out
    any = true
  }

  const parts = (
    yours
      ? [
          ['Everyone you can see', t.have],
          ['Shared with you', t.shared],
          ['Your kids', t.kids],
        ]
      : [
          ['Yours', t.yours],
          ['Shared with you', t.shared],
          ['Your kids', t.kids],
        ]
  ).filter(([, v], i) => i === 0 || v !== 0)
  const big = yours ? y : t

  return (
    <section className={fading ? 'panel total-card is-fading' : 'panel total-card'} aria-label={yours ? 'Your balance' : 'Total balance'}>
      <div className="total-head">
        <p className="total-label">{yours ? `Your balance · ${cur}` : `Total balance · ${cur} · everything you can see`}</p>
        <div className="scope-switch" role="group" aria-label="Show on Home">
          {[
            ['yours', 'Yours'],
            ['everyone', 'Everyone'],
          ].map(([key, label]) => (
            <button key={key} aria-pressed={scope === key} onClick={() => onScope(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="total-row">
        <p className="amount total-big">
          <CountUp value={big.have} format={(v) => formatMoney(v, cur)} />
        </p>
        {any && (
          <p className="small total-note">
            {flow >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(flow), cur)} this month
          </p>
        )}
      </div>
      <div className="total-split">
        {parts.map(([label, v]) => (
          <div key={label}>
            <span>{label}</span>
            <span className="amount">{formatMoney(v, cur)}</span>
          </div>
        ))}
      </div>
      <div className="total-networth">
        <div>
          <span>{yours ? 'Your net worth' : 'Net worth'}</span>
          <span className="amount">
            <CountUp value={big.net} format={(v) => formatMoney(v, cur)} />
          </span>
        </div>
        <p className="small">
          What {yours ? 'you have' : 'everyone has'}, {formatMoney(big.have, cur)}, minus what {yours ? 'you owe' : 'they owe'},{' '}
          {formatMoney(big.owe, cur)} on cards and loans
        </p>
      </div>
      {list.length > 1 && (
        <p className="small total-note">
          Also{' '}
          {list
            .slice(1)
            .map((c) => `${formatMoney(totals[c].have, c)} in ${c}`)
            .join(', ')}
          . Totals in one currency come later.
        </p>
      )}
    </section>
  )
}

// Your accounts (#39, option B): what you have and what you owe, then your
// biggest balances (two of each). The full list is on the Accounts page.
function YourAccounts({ banks, me, canLink, home, everyone = false }) {
  const shown = everyone ? banks : banks.filter((b) => b.owner_user_id === me.user_id)
  const mine = shown.flatMap((b) => b.accounts.map((a) => ({ ...a, bankName: b.institution_name })))
  const cur = currencies(summarize(shown, me.user_id, {}), home)[0]
  const inCur = mine.filter((a) => a.currency === cur && a.current_balance_minor != null)
  const have = inCur.filter((a) => !isOwed(a))
  const owe = inCur.filter((a) => isOwed(a))
  const sum = (list) => list.reduce((t, a) => t + a.current_balance_minor, 0)
  const biggest = (list) => [...list].sort((x, y) => y.current_balance_minor - x.current_balance_minor).slice(0, 2)
  const top = [...biggest(have), ...biggest(owe)]
  const others = mine.length - inCur.length
  const fading = useFadeOnChange(everyone)

  return (
    <section className={fading ? 'panel is-fading' : 'panel'} aria-labelledby="yours-h">
      <div className="panel-head">
        <h2 id="yours-h">{everyone ? 'Everyone’s accounts' : 'Your accounts'}</h2>
        {mine.length > 0 && (
          <Link to={everyone ? '/accounts?person=everyone' : '/accounts'} className="link small">
            All {mine.length} {mine.length === 1 ? 'account' : 'accounts'}
          </Link>
        )}
      </div>
      {mine.length === 0 ? (
        <p className="small muted">
          {canLink ? 'You haven’t linked a bank yet. Use Link a bank above.' : 'You don’t have any banks linked.'}
        </p>
      ) : (
        <>
          <div className="have-owe">
            <Link to="/accounts#have" className="tone-sage">
              <span className="small">{everyone ? 'Everyone has' : 'You have'}</span>
              <span className="amount">
                <CountUp value={sum(have)} format={(v) => formatMoney(v, cur)} />
              </span>
              <span className="small muted">
                {have.length} {have.length === 1 ? 'account' : 'accounts'}
              </span>
            </Link>
            <Link to="/accounts#owe" className="tone-clay">
              <span className="small">{everyone ? 'Everyone owes' : 'You owe'}</span>
              <span className="amount">
                <CountUp value={sum(owe)} format={(v) => formatMoney(v, cur)} />
              </span>
              <span className="small muted">
                {owe.length} {owe.length === 1 ? 'account' : 'accounts'}
              </span>
            </Link>
          </div>
          {top.length > 0 && (
            <>
              <h3 className="sub-heading">Biggest balances</h3>
              <ul className="rows">
                {top.map((a) => (
                  <li key={a.id}>
                    <AccountIcon account={a} />
                    <div className="grow">
                      <p className="name">{a.name}</p>
                      <p className="small muted">{[a.bankName, a.mask && `••${a.mask}`].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className={isOwed(a) ? 'amount money-out' : 'amount'}>{formatMoney(a.current_balance_minor, a.currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {others > 0 && (
            <p className="small muted">
              {others} {others === 1 ? 'account is' : 'accounts are'} in another currency or {others === 1 ? 'has' : 'have'} no balance yet. See All accounts.
            </p>
          )}
        </>
      )}
    </section>
  )
}

// Shared with you (#37, #39 option A): one row per person whose money you can
// see, and why: they share balances with you, or you're their parent. Their
// accounts open on the Family page. Kept apart from your own money.
function SharedWithYou({ banks, me, people, roles, home }) {
  const byOwner = new Map()
  for (const b of banks) {
    if (b.owner_user_id === me.user_id) continue
    const p = byOwner.get(b.owner_user_id) ?? { id: b.owner_user_id, have: 0, owe: 0, owes: false, count: 0 }
    for (const a of b.accounts) {
      p.count++
      if (a.currency !== home || a.current_balance_minor == null) continue
      if (isOwed(a)) {
        p.owe += a.current_balance_minor
        p.owes = true
      } else {
        p.have += a.current_balance_minor
      }
    }
    byOwner.set(b.owner_user_id, p)
  }
  if (byOwner.size === 0) return null

  return (
    <section className="panel panel-shared" aria-labelledby="shared-h">
      <div className="panel-head">
        <h2 id="shared-h">Shared with you</h2>
        <Link to="/family" className="link small">
          Sharing
        </Link>
      </div>
      <ul className="rows">
        {[...byOwner.values()].map((p) => {
          const member = people[p.id] ?? { user_id: p.id }
          const kid = ownerGroup(p.id, me.user_id, roles) === 'kids'
          return (
            <li key={p.id}>
              <Link to={`/family?member=${p.id}`} className="person-row">
                <Avatar member={member} />
                <span className="grow">
                  <span className="name block">
                    {nameOf(member)}
                    {kid && <span className="tag role-tag">{roles[p.id] === 'child' ? 'Child' : 'Teen'}</span>}
                  </span>
                  <span className="small muted block">
                    {kid ? 'You see this as a parent' : 'Shares balances'} · {p.count} {p.count === 1 ? 'account' : 'accounts'}
                  </span>
                  <span className="person-money small">
                    <span>
                      Has <span className="amount">{formatMoney(p.have, home)}</span>
                    </span>
                    {p.owes ? (
                      <span>
                        owes <span className="amount money-out">{formatMoney(p.owe, home)}</span>
                      </span>
                    ) : (
                      <span className="muted">owes nothing</span>
                    )}
                  </span>
                </span>
                <svg className="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Your recent transactions (#39, option C): only yours, since everyone's are
// on the Transactions page. Spending, transfers and income are kept apart, so
// loan payments and moves between accounts don't look like spending (#77). Same
// rules as the spending card.
const TRANSFER = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])
const RECENT_TABS = [
  ['spending', 'Spending', 'No spending yet.'],
  ['transfers', 'Transfers', 'No transfers yet.'],
  ['income', 'Income', 'No income yet.'],
]

export function txKind(t) {
  if (TRANSFER.has(t.category_primary)) return 'transfers'
  if (t.category_primary === 'INCOME') return 'income'
  return 'spending'
}

function RecentTransactions({ txs, me, people, everyone = false }) {
  const [tab, setTab] = useState('spending')
  const shown = txs.filter((t) => txKind(t) === tab).slice(0, 5)
  const empty = RECENT_TABS.find(([key]) => key === tab)[2]
  const fading = useFadeOnChange(`${tab}|${everyone}`)

  return (
    <section className={fading ? 'panel is-fading' : 'panel'} aria-labelledby="tx-h">
      <div className="panel-head">
        <h2 id="tx-h">{everyone ? 'Recent transactions' : 'Your recent transactions'}</h2>
        <Link to={everyone ? '/transactions?owner=all' : '/transactions'} className="link small">
          See all
        </Link>
      </div>
      <div className="chips" role="group" aria-label="Kind of transaction">
        {RECENT_TABS.map(([key, label]) => (
          <button key={key} className="chip" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {txs.length === 0 ? (
        <p className="small muted">No transactions yet. A new bank can take a few minutes to show its history.</p>
      ) : shown.length === 0 ? (
        <p className="small muted">{empty}</p>
      ) : (
        <ul className="rows">
          {shown.map((t) => (
            <TransactionRow key={t.id} tx={t} meId={me.user_id} people={people} />
          ))}
        </ul>
      )}
      {tab === 'transfers' && (
        <p className="small muted">Loan and card payments and moves between your own accounts sit here, so they don&apos;t look like spending.</p>
      )}
    </section>
  )
}

// Spending this month (#39): one bar split by category, then a row per
// category with its icon, share, number of purchases and amount. The top four
// get their own colour; the rest are grouped as Other. Each row opens the
// Transactions page filtered to that category and month.
const SPEND_COLORS = ['clay', 'sage', 'cocoa', 'sage-light']

function SpendingCard({ spending, month, home, everyone = false }) {
  const rows = spending.filter((s) => s.currency === home).sort((a, b) => b.amount_minor - a.amount_minor)
  const total = rows.reduce((sum, r) => sum + r.amount_minor, 0)
  const top = rows.slice(0, SPEND_COLORS.length).map((r, i) => ({ ...r, color: SPEND_COLORS[i] }))
  const rest = rows.slice(SPEND_COLORS.length)
  if (rest.length > 0) {
    top.push({
      category: 'OTHER',
      color: 'sand',
      amount_minor: rest.reduce((sum, r) => sum + r.amount_minor, 0),
      count: rest.reduce((sum, r) => sum + r.count, 0),
      label: `Other (${rest.length} categories)`,
    })
  }
  const share = (v) => {
    const p = (v / total) * 100
    return p < 1 ? '<1%' : `${Math.round(p)}%`
  }
  const fading = useFadeOnChange(everyone)

  return (
    <section className={fading ? 'panel is-fading' : 'panel'} aria-labelledby="sp-h">
      <div className="panel-head">
        <h2 id="sp-h">
          {everyone ? 'Spending' : 'Your spending'} in {monthName(new Date())}
        </h2>
        {rows.length > 0 && (
          <span className="amount">
            <CountUp value={total} format={(v) => formatMoney(v, home)} />
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="small muted">No spending yet this month.</p>
      ) : (
        <>
          <div className="spend-bar" aria-hidden="true">
            {top.map((r) => (
              <span key={r.category} className={`spend-${r.color}`} style={{ flexGrow: r.amount_minor }} />
            ))}
          </div>
          <ul className="rows spend-rows">
            {top.map((r) => {
              const label = r.label ?? categoryLabel(r.category)
              // Same month as these totals, so the counts match what opens.
              // The same person as these totals: Transactions opens on yours
              // by default, so Everyone needs owner=all.
              const p = new URLSearchParams(everyone ? { owner: 'all' } : {})
              if (r.category !== 'OTHER') p.set('category', r.category)
              if (month) p.set('month', month)
              const to = `/transactions?${p}`
              return (
                <li key={r.category}>
                  <Link to={to} className="spend-row">
                    <span className={`spend-icon spend-${r.color}`} aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                        <path d={categoryPath(r.category)} />
                      </svg>
                    </span>
                    <span className="grow">
                      <span className="name block">{label}</span>
                      <span className="small muted block">
                        {share(r.amount_minor)} · {r.count} {r.count === 1 ? 'purchase' : 'purchases'}
                      </span>
                    </span>
                    <span className="amount">{formatMoney(r.amount_minor, home)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <p className="small muted">Transfers and loan payments aren&apos;t counted as spending.</p>
    </section>
  )
}

function FamilyCard({ members, isOwner }) {
  return (
    <section className="panel panel-dashed" aria-labelledby="fam-h">
      <div className="panel-head">
        <h2 id="fam-h">Family</h2>
        <Link to="/family" className="link small">
          {isOwner ? 'Manage' : 'Sharing'}
        </Link>
      </div>
      <ul className="rows">
        {members.map((m) => (
          <li key={m.user_id}>
            <Avatar member={m} />
            <div className="grow">
              <p className="name">
                {nameOf(m)}
                {m.is_you && ' (you)'}
              </p>
              <p className="small muted">{m.role}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
