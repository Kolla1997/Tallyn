import { useCallback, useEffect, useMemo, useState } from 'react'
import AccountIcon, { accountKind } from '../components/AccountIcon.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { api } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { isOwed } from '../lib/summary.js'
import { LinkBank } from './Banks.jsx'
import { PageHead } from './Shell.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import CountUp from '../components/CountUp.jsx'
import { useFadeOnChange } from '../lib/motion.js'

// Accounts (#39 step 3): net worth with a have-vs-owe bar, then every account
// in two columns, You have and You owe, grouped by type, and the connected
// banks with their status and Unlink. Switch between your accounts, each
// person who shares with you, and everyone. The API only returns what this
// person may see (#28); the switcher only narrows it. Bank chips (#84,
// option A) narrow the two columns to one bank; net worth stays whole.

const HAVE_GROUPS = [
  ['everyday', 'Everyday'],
  ['savings', 'Savings'],
  ['investment', 'Investments'],
]
const OWE_GROUPS = [
  ['card', 'Credit cards'],
  ['loan', 'Loans'],
]
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
  const home = household.home_currency
  const canLink = household.role === 'owner' || household.role === 'adult'

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    Promise.all([api(`/api/banks?household_id=${hh}`), api(`/api/households/${hh}/members`)]).then(
      ([b, m]) => {
        setBanks(b.banks)
        setMembers(m.members)
      },
      () => setError("We couldn't load your accounts. Try again in a moment."),
    )
  }, [household.id])

  useEffect(load, [load, refreshKey])

  // Home's You have / You owe tiles link to #have and #owe.
  useEffect(() => {
    if (banks && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [banks])

  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members])
  const owners = [...new Set((banks ?? []).map((b) => b.owner_user_id))].filter((id) => id !== me.user_id)
  const showSwitch = !KID.has(household.role) && owners.length > 0

  const shown = (banks ?? []).filter(
    (b) => who === 'everyone' || b.owner_user_id === (who === 'yours' ? me.user_id : who),
  )
  const accounts = shown.flatMap((b) => b.accounts.map((a) => ({ ...a, bank: b })))
  const counted = accounts.filter((a) => a.currency === home && a.current_balance_minor != null)
  const sum = (list) => list.reduce((t, a) => t + a.current_balance_minor, 0)
  const have = sum(counted.filter((a) => !isOwed(a)))
  const owe = sum(counted.filter((a) => isOwed(a)))
  const uncounted = accounts.length - counted.length

  // The picked bank, if it belongs to the person shown; otherwise all.
  const picked = shown.find((b) => b.id === bank)
  const inBank = picked ? accounts.filter((a) => a.bank.id === picked.id) : accounts
  const inBankCounted = inBank.filter((a) => a.currency === home && a.current_balance_minor != null)
  const bankHave = sum(inBankCounted.filter((a) => !isOwed(a)))
  const bankOwe = sum(inBankCounted.filter((a) => isOwed(a)))

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
    <>
      <PageHead title="Accounts" sub="Your banks and the ones shared with you">
        {canLink && (
          <LinkBank
            householdId={household.id}
            onLinked={() => {
              load()
              onChanged?.()
            }}
            onError={setError}
          />
        )}
      </PageHead>

      {showSwitch && (
        <div className="chips page-chips" role="group" aria-label="Whose accounts">
          {[['yours', 'Yours'], ...owners.map((id) => [id, nameOf(people[id] ?? { user_id: id })]), ['everyone', 'Everyone']].map(
            ([key, label]) => (
              <button key={key} className="chip" aria-pressed={who === key} onClick={() => setWho(key)}>
                {label}
              </button>
            ),
          )}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!banks ? (
        <TallynLoader />
      ) : accounts.length === 0 ? (
        <section className="panel empty-state">
          <p className="muted">
            {who !== 'yours'
              ? 'No accounts to show here.'
              : canLink
                ? 'You haven’t linked a bank yet. Use Link a bank above.'
                : 'You don’t have any banks linked.'}
          </p>
        </section>
      ) : (
        <>
          <NetWorth have={have} owe={owe} home={home} />
          {shown.length > 1 && (
            <div className="chips bank-chips" role="group" aria-label="Which bank">
              {[['', 'All', accounts.length], ...shown.map((b) => [b.id, b.institution_name || 'Bank', b.accounts.length])].map(([id, label, n]) => (
                <button key={id || 'all'} className="chip chip-outline" aria-pressed={(picked?.id ?? '') === id} onClick={() => setBank(id)}>
                  {label} <span className="chip-count">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="accounts-grid">
            <AccountColumn
              id="have"
              title="You have"
              total={bankHave}
              bankName={picked?.institution_name}
              groups={HAVE_GROUPS}
              accounts={inBank.filter((a) => !isOwed(a))}
              home={home}
              people={people}
              showOwner={who === 'everyone'}
              meId={me.user_id}
            />
            <AccountColumn
              id="owe"
              title="You owe"
              total={bankOwe}
              bankName={picked?.institution_name}
              groups={OWE_GROUPS}
              accounts={inBank.filter((a) => isOwed(a))}
              home={home}
              people={people}
              showOwner={who === 'everyone'}
              meId={me.user_id}
              owed
            />
            <ConnectedBanks banks={shown} me={me} people={people} onUnlinked={() => (load(), onChanged?.())} />
          </div>
          {uncounted > 0 && (
            <p className="small muted">
              {uncounted} {uncounted === 1 ? 'account isn’t' : 'accounts aren’t'} in the totals: another currency or no
              balance yet. Totals in one currency come later.
            </p>
          )}
        </>
      )}
    </>
  )
}

// Net worth with a bar showing how what you have compares with what you owe.
// Switching person counts the numbers to their new values (#87).
function NetWorth({ have, owe, home }) {
  const net = have - owe
  const both = have + owe
  const money = (v) => formatMoney(v, home)
  return (
    <section className={useFadeOnChange(`${have}|${owe}`) ? 'panel net-worth is-fading' : 'panel net-worth'} aria-label="Net worth">
      <div className="net-worth-head">
        <span className="small muted">Net worth</span>
        <span className="amount net-worth-total">
          <CountUp value={net} format={(v) => `${v < 0 ? '−' : ''}${money(Math.abs(v))}`} />
        </span>
      </div>
      {both > 0 && (
        <div className="net-worth-bar" aria-hidden="true">
          {have > 0 && <span className="spend-sage" style={{ flexGrow: have }} />}
          {owe > 0 && <span className="spend-clay" style={{ flexGrow: owe }} />}
        </div>
      )}
      <div className="net-worth-key small muted">
        <span>
          <span className="dot dot-sage" aria-hidden="true" /> Have <CountUp value={have} format={money} />
        </span>
        <span>
          <span className="dot dot-clay" aria-hidden="true" /> Owe <CountUp value={owe} format={money} />
        </span>
      </div>
    </section>
  )
}

function AccountColumn({ id, title, total, bankName, groups, accounts, home, people, showOwner, meId, owed = false }) {
  return (
    <section
      id={id}
      className={`panel account-col ${owed ? 'account-col-owe' : 'account-col-have'}${useFadeOnChange(accounts.map((a) => a.id).join()) ? ' is-fading' : ''}`}
      aria-labelledby={`${id}-h`}
    >
      <div className="panel-head">
        <h2 id={`${id}-h`}>{title}</h2>
        <span className={owed ? 'amount money-out' : 'amount'}>
          <CountUp value={total} format={(v) => formatMoney(v, home)} />
        </span>
      </div>
      <p className="small muted account-count">
        {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
        {bankName && ` · ${bankName}`}
      </p>
      {accounts.length === 0 && <p className="small muted">{owed ? 'Nothing owed here.' : 'Nothing here yet.'}</p>}
      {groups.map(([key, label]) => {
        const list = accounts
          .filter((a) => groupOf(a) === key)
          .sort((x, y) => (y.current_balance_minor ?? 0) - (x.current_balance_minor ?? 0))
        if (list.length === 0) return null
        const subtotal = list
          .filter((a) => a.currency === home && a.current_balance_minor != null)
          .reduce((t, a) => t + a.current_balance_minor, 0)
        return (
          <div key={key} className="account-group">
            <h3 className="account-group-head">
              <span>{label}</span>
              <span className={owed ? 'money-out' : undefined}>{formatMoney(subtotal, home)}</span>
            </h3>
            <ul className="rows">
              {list.map((a) => (
                <AccountItem key={a.id} a={a} meId={meId} owner={showOwner ? people[a.bank.owner_user_id] ?? { user_id: a.bank.owner_user_id } : null} />
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function AccountItem({ a, owner, meId }) {
  const owed = isOwed(a)
  // Spendable money, when the bank says it differs from the balance.
  const available =
    !owed && a.type === 'depository' && a.available_balance_minor != null && a.available_balance_minor !== a.current_balance_minor
      ? `${formatMoney(a.available_balance_minor, a.currency)} available`
      : null
  return (
    <li>
      <AccountIcon account={a} />
      <div className="grow">
        <p className="name">{a.name}</p>
        <p className="small muted tx-meta">
          {owner && (
            <span className="tx-owner">
              <Avatar member={owner} small />
              {owner.user_id === meId ? 'You' : nameOf(owner)}
            </span>
          )}
          <span>{[a.bank.institution_name, a.mask && `••${a.mask}`, available].filter(Boolean).join(' · ')}</span>
        </p>
      </div>
      <span className={owed ? 'amount money-out' : 'amount'}>
        {a.current_balance_minor == null ? '—' : formatMoney(a.current_balance_minor, a.currency)}
      </span>
    </li>
  )
}

// Each bank's status and, where this person may, Unlink. Unlinking asks you
// to type the bank's name (#38); it's your own data, so no 2FA code.
function ConnectedBanks({ banks, me, people, onUnlinked }) {
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
    <section className={useFadeOnChange(banks.map((b) => b.id).join()) ? 'panel connected-banks is-fading' : 'panel connected-banks'} aria-labelledby="banks-h">
      <div className="panel-head">
        <h2 id="banks-h">Connected banks</h2>
      </div>
      <ul className="rows">
        {banks.map((b) => {
          const name = b.institution_name || 'Bank'
          const whose = b.owner_user_id === me.user_id ? 'yours' : nameOf(people[b.owner_user_id] ?? { user_id: b.owner_user_id })
          return (
            <li key={b.id} className="bank-item">
              <div className="bank-line">
                <span className="bank-badge" aria-hidden="true">
                  {initials(name)}
                </span>
                <div className="grow">
                  <p className="name">{name}</p>
                  <BankStatus bank={b} />
                </div>
              </div>
              <p className="small muted">
                {b.accounts.length} {b.accounts.length === 1 ? 'account' : 'accounts'} · {whose}
              </p>
              {b.status !== 'active' && (
                <p className="small bank-warning">
                  {b.status === 'needs_reauth'
                    ? 'This bank asked you to sign in again, so its balances aren’t updating.'
                    : 'This bank was disconnected and isn’t updating.'}
                </p>
              )}
              {b.can_unlink && (
                <button className="chip chip-danger" onClick={() => setUnlinking(b)}>
                  Unlink
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="small muted">Tallyn reads balances and transactions. It can&apos;t move money.</p>
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

function BankStatus({ bank }) {
  if (bank.status === 'needs_reauth') return <p className="small bank-status bank-status-warn">Needs you to sign in again</p>
  if (bank.status === 'disconnected') return <p className="small bank-status bank-status-warn">Disconnected</p>
  if (!bank.last_synced_at) return <p className="small muted">Getting your accounts…</p>
  return <p className="small bank-status bank-status-ok">Up to date · {ago(bank.last_synced_at)}</p>
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
