import { useCallback, useEffect, useMemo, useState } from 'react'
import AccountIcon, { accountKind } from '../components/AccountIcon.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { api } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { isOwed } from '../lib/summary.js'
import { LinkBank, ReconnectBank } from './Banks.jsx'
import { canAddCardDetails, cardsWithoutDetails } from '../lib/cards.js'
import { Head, Panel, Chips, PILL } from '../components/calm/ui.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import LoadFailed, { StaleBanner } from '../components/LoadFailed.jsx'
import { useRetry } from '../lib/retry.js'
import CountUp from '../components/CountUp.jsx'
import { RingChart } from '@/components/charts/ring-chart'
import { Ring } from '@/components/charts/ring'
import { useFadeOnChange } from '../lib/motion.js'

// Accounts (#39), in the calm redesign (#187, Dinesh picked F, the bank bento, with rings): a
// summary strip with Bklit rings for what you have by kind, net worth, have and owe; then one
// card per bank holding its accounts as tiles, each card as wide as its accounts, with the bank's
// status and actions (Reconnect, Add APR and due dates, Unlink) at its foot. Switch between your
// accounts, each person who shares with you, and everyone. The API only returns what this person
// may see (#28); the switcher only narrows it. Bank chips (#84) narrow the cards to one bank; the
// summary stays whole.

// What you have, by kind, as rings (and their colours).
const HAVE_GROUPS = [
  ['everyday', 'Everyday', 'var(--color-redesign-ink)'],
  ['savings', 'Savings', 'var(--color-redesign-in)'],
  ['investment', 'Investments', 'var(--color-redesign-grey-2)'],
]
const KIND_LABEL = { everyday: 'Everyday', savings: 'Savings', investment: 'Investments', card: 'Credit card', loan: 'Loan' }
const NUM = 'font-[family-name:var(--font-heading)] font-semibold tabular-nums'
const MUTED = 'text-zinc-500 dark:text-zinc-400'
const KID = new Set(['teen', 'child'])

// Mortgages, student, auto and other loans all count as Loans here.
const groupOf = (a) => (['home', 'student', 'auto', 'loan'].includes(accountKind(a)) ? 'loan' : accountKind(a))

export default function AccountsPage({ me, household, refreshKey, onChanged }) {
  const [banks, setBanks] = useState(null)
  const [members, setMembers] = useState([])
  // 'yours', 'everyone' or a user ID; Family links here with ?person=<id>.
  const [who, setWho] = useState(() => new URLSearchParams(window.location.search).get('person') || 'yours')
  // A linked bank's ID, or '' for all (#84). Kept in the address.
  const [bank, setBank] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('bank') ?? ''
    return /^[0-9a-f-]{36}$/i.test(v) ? v : ''
  })
  const [error, setError] = useState('')
  const [failed, setFailed] = useState(false) // the last load failed (#151)
  const home = household.home_currency
  const canLink = household.role === 'owner' || household.role === 'adult'

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    return Promise.all([api(`/api/banks?household_id=${hh}`), api(`/api/households/${hh}/members`)]).then(
      ([b, m]) => {
        setBanks(b.banks)
        setMembers(m.members)
        setFailed(false)
      },
      () => setFailed(true),
    )
  }, [household.id])

  useEffect(() => {
    load()
  }, [load, refreshKey])
  const [retrying, retry] = useRetry(load)

  // Home's You have / You owe tiles link to #have and #owe.
  useEffect(() => {
    if (banks && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [banks])

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const owners = [...new Set((banks ?? []).map((b) => b.owner_user_id))].filter((id) => id !== me.user_id)
  const showSwitch = !KID.has(household.role) && owners.length > 0

  const shown = (banks ?? []).filter((b) => who === 'everyone' || b.owner_user_id === (who === 'yours' ? me.user_id : who))
  const accounts = shown.flatMap((b) => b.accounts.map((a) => ({ ...a, bank: b })))
  const counted = accounts.filter((a) => a.currency === home && a.current_balance_minor != null)
  const sum = (list) => list.reduce((t, a) => t + a.current_balance_minor, 0)
  const have = sum(counted.filter((a) => !isOwed(a)))
  const owe = sum(counted.filter((a) => isOwed(a)))
  const uncounted = accounts.length - counted.length

  // The picked bank, if it belongs to the person shown; otherwise all.
  const picked = shown.find((b) => b.id === bank)

  useEffect(() => {
    if (banks && bank && !picked) setBank('') // switched to someone without this bank
  }, [banks, bank, picked])
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (bank) p.set('bank', bank)
    else p.delete('bank')
    const url = p.size ? `/accounts?${p}` : '/accounts'
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url + window.location.hash)
  }, [bank])

  return (
    <div className="calm">
      <Head title="Accounts" sub="Your banks and the ones shared with you">
        {canLink && (
          <LinkBank
            className={PILL}
            householdId={household.id}
            onLinked={() => {
              load()
              onChanged?.()
            }}
            onError={setError}
          />
        )}
      </Head>

      {showSwitch && (
        <div className="mb-3">
          <Chips
            label="Whose accounts"
            options={[['yours', 'Yours'], ...owners.map((id) => [id, nameOf(people[id] ?? { user_id: id })]), ['everyone', 'Everyone']]}
            value={who}
            onChange={setWho}
          />
        </div>
      )}

      {error && (
        <p className="m-0 mb-3 text-[14px] font-semibold" style={{ color: 'var(--color-redesign-owe-text)' }} role="alert">
          {error}
        </p>
      )}

      {failed && banks && <StaleBanner busy={retrying} onRetry={retry} />}
      {!banks ? (
        failed ? (
          <LoadFailed busy={retrying} onRetry={retry} />
        ) : (
          <TallynLoader />
        )
      ) : accounts.length === 0 ? (
        <Panel label="No accounts">
          <p className={`m-0 text-[14px] ${MUTED}`}>
            {who !== 'yours'
              ? 'No accounts to show here.'
              : canLink
                ? 'You haven’t linked a bank yet. Use Link a bank above.'
                : 'You don’t have any banks linked.'}
          </p>
        </Panel>
      ) : (
        <>
          <NetWorth have={have} owe={owe} home={home} accounts={counted} />
          {shown.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Which bank">
              {[['', 'All', accounts.length], ...shown.map((b) => [b.id, b.institution_name || 'Bank', b.accounts.length])].map(([id, label, n]) => (
                <button
                  key={id || 'all'}
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 transition-[border-color,color] duration-150 aria-pressed:border-zinc-900 dark:aria-pressed:border-white aria-pressed:text-zinc-900 dark:aria-pressed:text-white"
                  aria-pressed={(picked?.id ?? '') === id}
                  onClick={() => setBank(id)}
                >
                  {label} <span className="tabular-nums text-zinc-400">{n}</span>
                </button>
              ))}
            </div>
          )}
          <ConnectedBanks
            banks={picked ? [picked] : shown}
            me={me}
            people={people}
            showOwner={who === 'everyone'}
            onUnlinked={() => (load(), onChanged?.())}
            onReconnected={() => (load(), onChanged?.())}
            onError={setError}
          />
          {uncounted > 0 && (
            <p className={`m-0 mt-3 text-[13px] ${MUTED}`}>
              {uncounted} {uncounted === 1 ? 'account isn’t' : 'accounts aren’t'} in the totals: another currency or no balance yet. Totals in one currency come
              later.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// The summary strip: what you have by kind as rings, then net worth, have and owe. Switching
// person counts the numbers to their new values (#87).
function NetWorth({ have, owe, home, accounts }) {
  const net = have - owe
  const money = (v) => formatMoney(v, home)
  const parts = HAVE_GROUPS.map(([key, label, color]) => ({
    label,
    color,
    value: accounts.filter((a) => !isOwed(a) && groupOf(a) === key).reduce((t, a) => t + a.current_balance_minor, 0),
  })).filter((p) => p.value > 0)
  const pct = (v) => (have > 0 ? Math.round((v / have) * 100) : 0)
  return (
    <section
      className={`calm-glass mb-3 grid gap-5 rounded-2xl p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center${useFadeOnChange(`${have}|${owe}`) ? ' is-fading' : ''}`}
      aria-label="Net worth"
    >
      {parts.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 lg:border-r lg:border-zinc-200 dark:lg:border-zinc-800 lg:pr-6">
          <div aria-hidden="true">
            <RingChart
              data={parts.map((p) => ({ label: p.label, value: p.value, maxValue: have }))}
              size={120}
              strokeWidth={9}
              ringGap={3}
              baseInnerRadius={30}
            >
              {parts.map((p, i) => (
                <Ring key={p.label} index={i} color={p.color} showGlow={false} />
              ))}
            </RingChart>
          </div>
          <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <i className="block size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                <span>{p.label}</span>
                <b className={`ml-auto pl-4 ${NUM}`}>{money(p.value)}</b>
                <span className={`w-10 text-right tabular-nums ${MUTED}`}>{pct(p.value)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <dl className="m-0 grid grid-cols-2 gap-y-3 sm:grid-cols-3 sm:divide-x sm:divide-zinc-200 dark:sm:divide-zinc-800">
        <div className="sm:pr-4">
          <dt className={`text-[13px] ${MUTED}`}>Net worth</dt>
          <dd className={`m-0 text-[22px] whitespace-nowrap ${NUM}`}>
            <CountUp value={net} format={(v) => `${v < 0 ? '−' : ''}${money(Math.abs(v))}`} />
          </dd>
          <dd className={`m-0 text-[13px] ${MUTED}`}>In {home}</dd>
        </div>
        <div className="sm:px-4">
          <dt className={`text-[13px] ${MUTED}`}>You have</dt>
          <dd className={`m-0 text-[22px] whitespace-nowrap ${NUM}`} style={{ color: 'var(--color-redesign-in-text)' }}>
            <CountUp value={have} format={money} />
          </dd>
        </div>
        <div className="sm:px-4">
          <dt className={`text-[13px] ${MUTED}`}>You owe</dt>
          <dd className={`m-0 text-[22px] whitespace-nowrap ${NUM}`} style={{ color: 'var(--color-redesign-owe-text)' }}>
            <CountUp value={owe} format={money} />
          </dd>
        </div>
      </dl>
    </section>
  )
}

// One account as a tile inside its bank's card: name, kind and mask (and whose, when showing
// everyone), the balance, and what's worth knowing (available money, a card's limit used).
function AccountTile({ a, owner, meId }) {
  const owed = isOwed(a)
  const available =
    !owed && a.type === 'depository' && a.available_balance_minor != null && a.available_balance_minor !== a.current_balance_minor
      ? `${formatMoney(a.available_balance_minor, a.currency)} available`
      : null
  const used =
    a.type === 'credit' && a.credit_limit_minor > 0 && a.current_balance_minor != null
      ? Math.round((a.current_balance_minor / a.credit_limit_minor) * 100)
      : null
  return (
    <li className="grid content-start gap-2 p-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <AccountIcon account={a} />
        <span className="min-w-0">
          <span className="name block truncate text-[14px] font-semibold">{a.name}</span>
          <span className={`flex flex-wrap items-center gap-1.5 text-[13px] ${MUTED}`}>
            {KIND_LABEL[groupOf(a)] ?? 'Account'}
            {a.mask && ` ··${a.mask}`}
            {owner && (
              <span className="tx-owner">
                <Avatar member={owner} small />
                {owner.user_id === meId ? 'You' : nameOf(owner)}
              </span>
            )}
          </span>
        </span>
      </span>
      <span className={`text-[18px] ${NUM}`} style={owed ? { color: 'var(--color-redesign-owe-text)' } : undefined}>
        {a.current_balance_minor == null ? '—' : formatMoney(a.current_balance_minor, a.currency)}
      </span>
      {used != null && (
        <span className="block">
          <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--color-redesign-track)' }} aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, used)}%`, background: 'var(--color-redesign-accent)' }} />
          </span>
          <span className={`mt-1 block text-[13px] ${MUTED}`}>
            {used}% of {formatMoney(a.credit_limit_minor, a.currency)} limit used
          </span>
        </span>
      )}
      {available && <span className={`text-[13px] ${MUTED}`}>{available}</span>}
    </li>
  )
}

// Each bank as a card holding its accounts as tiles, as wide as its accounts; its status and,
// where this person may, Reconnect and Unlink at its foot. Unlinking asks you to type the bank's
// name (#38); it's your own data, so no 2FA code.
function ConnectedBanks({ banks, me, people, showOwner, onUnlinked, onReconnected, onError }) {
  const [unlinking, setUnlinking] = useState(null) // the bank being unlinked

  async function unlink(bank) {
    try {
      await api(`/api/banks/${bank.id}`, { method: 'DELETE' })
    } catch {
      throw new Error(`We couldn't unlink ${bank.institution_name || 'this bank'} just now. It's still connected, so try again in a moment.`)
    }
    onUnlinked()
  }

  return (
    <section className={useFadeOnChange(banks.map((b) => b.id).join()) ? 'is-fading' : undefined} aria-labelledby="banks-h">
      <h2 id="banks-h" className="sr-only">
        Connected banks
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        {banks.map((b) => {
          const name = b.institution_name || 'Bank'
          const whose = b.owner_user_id === me.user_id ? 'yours' : nameOf(people[b.owner_user_id] ?? { user_id: b.owner_user_id })
          const n = Math.max(1, b.accounts.length)
          const ok = b.status === 'active'
          return (
            <li
              key={b.id}
              className={`bank-item calm-solid flex min-w-[280px] flex-col overflow-hidden rounded-2xl ${ok ? '' : 'ring-1 ring-[var(--color-redesign-accent)]'}`}
              style={{ flex: `${n} 1 ${n * 320}px` }}
            >
              <div className="flex items-center gap-2.5 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2">
                <span className="bank-badge" aria-hidden="true">
                  {initials(name)}
                </span>
                <p className="name m-0 min-w-0 grow truncate text-[14px] font-semibold">{name}</p>
                <span className={`text-[13px] ${MUTED}`}>
                  {b.accounts.length} {b.accounts.length === 1 ? 'account' : 'accounts'} · {whose}
                </span>
              </div>
              <ul
                className="m-0 grid grow list-none divide-x divide-zinc-100 dark:divide-zinc-800 p-0"
                style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
              >
                {b.accounts.map((a) => (
                  <AccountTile key={a.id} a={a} meId={me.user_id} owner={showOwner ? (people[b.owner_user_id] ?? { user_id: b.owner_user_id }) : null} />
                ))}
              </ul>
              <div className="mt-auto grid gap-1.5 border-t border-zinc-100 dark:border-zinc-800 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <BankStatus bank={b} />
                  {b.can_unlink && (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {/* Reconnect (#51): sign in again, or share card details (#27). */}
                      {b.status === 'needs_reauth' && (
                        <ReconnectBank bankId={b.id} label="Reconnect" className={SMALL_RED} onDone={onReconnected} onError={onError} />
                      )}
                      {canAddCardDetails(b) && cardsWithoutDetails(b) > 0 && (
                        <ReconnectBank bankId={b.id} label="Add APR and due dates" className={SMALL} onDone={onReconnected} onError={onError} />
                      )}
                      <button type="button" className={SMALL} style={{ color: 'var(--color-redesign-owe-text)' }} onClick={() => setUnlinking(b)}>
                        Unlink
                      </button>
                    </div>
                  )}
                </div>
                {!ok && (
                  <p className="m-0 text-[13px] font-semibold" style={{ color: 'var(--color-redesign-owe-text)' }}>
                    {b.status === 'needs_reauth'
                      ? 'This bank asked you to sign in again, so its balances aren’t updating.'
                      : 'This bank was disconnected and isn’t updating.'}
                  </p>
                )}
                {canAddCardDetails(b) && cardsWithoutDetails(b) > 0 && (
                  <p className={`m-0 text-[13px] ${MUTED}`}>
                    {cardsWithoutDetails(b)} {cardsWithoutDetails(b) === 1 ? 'credit card doesn’t' : 'credit cards don’t'} have APR or due dates yet.
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className={`m-0 mt-3 text-[13px] ${MUTED}`}>Tallyn reads balances and transactions. It can&apos;t move money.</p>
      {unlinking && (
        <ConfirmDialog
          title={`Unlink ${unlinking.institution_name || 'this bank'}?`}
          action="Unlink"
          typeToConfirm={unlinking.institution_name || 'Bank'}
          onConfirm={() => unlink(unlinking)}
          onClose={() => setUnlinking(null)}
        >
          <p>Tallyn will disconnect it and remove its accounts and transactions. You can link it again later, but older history may not come back.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

const SMALL =
  'inline-flex h-8 items-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[13px] font-semibold text-zinc-900 dark:text-white'
const SMALL_RED = 'inline-flex h-8 items-center rounded-full border-0 px-3 text-[13px] font-semibold text-white bg-[var(--color-redesign-button)]'

function BankStatus({ bank }) {
  const warn = 'm-0 text-[13px] font-semibold'
  const owe = { color: 'var(--color-redesign-owe-text)' }
  if (bank.status === 'needs_reauth')
    return (
      <p className={warn} style={owe}>
        Needs you to sign in again
      </p>
    )
  if (bank.status === 'disconnected')
    return (
      <p className={warn} style={owe}>
        Disconnected
      </p>
    )
  if (!bank.last_synced_at) return <p className={`m-0 text-[13px] ${MUTED}`}>Getting your accounts…</p>
  return <p className={`m-0 text-[13px] ${MUTED}`}>Up to date, {ago(bank.last_synced_at)}</p>
}

function ago(when) {
  const mins = Math.round((Date.now() - new Date(when).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
  return new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name) {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w))
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}
