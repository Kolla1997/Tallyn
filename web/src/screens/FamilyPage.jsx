import { useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { UserPlus, Mail, Check } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { Link } from '../lib/router.jsx'
import { isOwed } from '../lib/summary.js'
import { Invite } from './Members.jsx'
import { Head, Panel, Rows, Row, Money, Pill, MUTED, OWE, IN } from '../components/calm/ui.jsx'
import PageSkeleton from '../components/calm/PageSkeleton.jsx'
import LoadFailed, { StaleBanner } from '../components/LoadFailed.jsx'
import { useRetry } from '../lib/retry.js'

// Family (#39 step 4, #37, #38), in the calm redesign (#187, the #185 draft): everyone in the
// household on the left; pick a person to see their money (what you may see of it), what you
// share with them and what they share with you, and, for owners, their role and Remove. Their
// cards and debts and how sharing works sit beside it.
// Removing, leaving and owner changes need a typed name and a fresh 2FA code,
// which the server checks. The database enforces every rule (#12, #28); this
// screen shows and asks.

const CATEGORIES = [
  ['balances', 'Balances'],
  ['transactions', 'Transactions'],
  ['whereabouts', 'Time and location'],
]
const ROLES = [
  ['owner', 'Owner'],
  ['adult', 'Adult'],
  ['teen', 'Teen'],
  ['viewer', 'Viewer'],
]
const ROLE_LABEL = { owner: 'Owner', adult: 'Adult', teen: 'Teen', child: 'Child', viewer: 'Viewer' }
const ROLE_INFO = {
  owner: 'manages people and roles, links banks and chooses what to share',
  adult: 'links banks and chooses what to share',
  teen: 'sees only their own money; owners and adults see theirs too',
  child: 'sees only their own money; owners and adults see theirs too',
  viewer: 'sees only what people share with them',
}
const YOUR_ROLE = {
  owner: 'You manage people and roles, link banks and choose what to share',
  adult: 'You link banks and choose what to share',
  teen: 'You see only your own money; owners and adults see it too',
  child: 'You see only your own money; owners and adults see it too',
  viewer: 'You see only what people share with you',
}
const isKid = (role) => role === 'teen' || role === 'child'

const fromAddress = () => new URLSearchParams(window.location.search).get('member') ?? ''

const MESSAGES = {
  last_owner: 'A household needs at least one owner. Make someone else an owner first.',
  reauth_required: 'That took a little long. Enter a new code from your app and try again.',
}
const say = (err, fallback) => MESSAGES[err.message] ?? fallback

const NOTE = `m-0 text-[13px] ${MUTED}`
const SUB = 'm-0 mb-1.5 font-[family-name:var(--font-heading)] text-[15px] font-semibold'
const CARD = 'calm-solid min-w-0 rounded-2xl p-4'
const LINK =
  'text-[13px] font-semibold text-zinc-900 dark:text-white underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4 hover:decoration-zinc-900 dark:hover:decoration-white'
const CHANGE =
  'shrink-0 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4 hover:text-zinc-900 dark:hover:text-white'

const Tag = ({ children }) => (
  <span className="inline-block rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">
    {children}
  </span>
)

// A shared category, ticked.
const Given = ({ children }) => (
  <li className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-[13px] font-semibold">
    <Check className="size-3.5" style={IN} aria-hidden="true" />
    {children}
  </li>
)

function Switch({ label, checked, disabled, onChange }) {
  return (
    <label className={`flex flex-row items-center justify-between gap-3 py-2 text-[14px] ${disabled ? 'text-zinc-400' : 'cursor-pointer'}`}>
      <span className="font-semibold">{label}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600 transition-colors duration-150 peer-checked:bg-[var(--color-redesign-in)] dark:peer-checked:bg-[var(--color-redesign-in)] peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900 dark:peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-150 peer-checked:after:translate-x-4 motion-reduce:after:transition-none"
      />
    </label>
  )
}

// Has and owes, each a link to the accounts behind it.
function HaveOwe({ have, owe, cur, haveTo, oweTo, you }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link to={haveTo} className="block rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 no-underline hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <span className={`block ${NOTE}`}>{you ? 'You have' : 'Has'}</span>
        <Money className="text-[20px]">{formatMoney(have, cur)}</Money>
      </Link>
      <Link to={oweTo} className="block rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 no-underline hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <span className={`block ${NOTE}`}>{you ? 'You owe' : 'Owes'}</span>
        <Money className="text-[20px]" tone={owe > 0 ? OWE : undefined}>
          {formatMoney(owe, cur)}
        </Money>
      </Link>
    </div>
  )
}

// Their cards and loans as rows (what you may see of them), biggest first.
function CardsAndDebts({ title, accounts, home }) {
  const list = [...accounts].sort((a, b) => (b.current_balance_minor ?? 0) - (a.current_balance_minor ?? 0))
  const total = list.filter((a) => a.currency === home).reduce((t, a) => t + (a.current_balance_minor ?? 0), 0)
  return (
    <Panel id="debts-h" title={title} meta={list.length > 0 ? `${formatMoney(total, home)} owed` : undefined}>
      {list.length === 0 ? (
        <p className={NOTE}>No credit cards or loans.</p>
      ) : (
        <Rows>
          {list.map((a) => (
            <Row key={a.id} name={a.name} sub={`${a.bankName}${a.mask ? ` ••${a.mask}` : ''}`}>
              <Money tone={OWE} className="text-[14px]">
                {a.current_balance_minor == null ? '—' : formatMoney(a.current_balance_minor, a.currency)}
              </Money>
            </Row>
          ))}
        </Rows>
      )}
    </Panel>
  )
}

function HowSharingWorks() {
  return (
    <Panel id="how-h" title="How sharing works" glass>
      <ul className={`m-0 grid list-disc gap-1 pl-4 text-[13px] text-zinc-600 dark:text-zinc-300`}>
        <li>Nobody sees your money until you share it.</li>
        <li>Owners and adults see their teens&apos; and children&apos;s money.</li>
        <li>Time and location are only shared together with transactions.</li>
        <li>Viewers see only what people share with them.</li>
        <li>Changes take effect straight away, and you can undo them any time.</li>
      </ul>
    </Panel>
  )
}

const PERSON_BTN =
  'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 aria-[current=true]:bg-zinc-100 dark:aria-[current=true]:bg-zinc-800'

export default function FamilyPage({ me, household, refreshKey, onChanged, onLeft }) {
  const [members, setMembers] = useState(null)
  const [sharing, setSharing] = useState(null)
  const [banks, setBanks] = useState([])
  const [invites, setInvites] = useState([])
  const [selected, setSelected] = useState(fromAddress)
  const [failed, setFailed] = useState(false) // the last load failed (#151)
  const isOwner = household.role === 'owner'

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    return Promise.all([
      api(`/api/households/${hh}/members`),
      api(`/api/sharing?household_id=${hh}`),
      api(`/api/banks?household_id=${hh}`),
      isOwner ? api(`/api/households/${hh}/invites`) : Promise.resolve({ invites: [] }),
    ]).then(
      ([m, s, b, i]) => {
        setMembers(m.members)
        setSharing(s)
        setBanks(b.banks)
        setInvites(i.invites)
        setFailed(false)
      },
      () => setFailed(true),
    )
  }, [household.id, isOwner])

  useEffect(() => {
    load()
  }, [load, refreshKey])
  const [retrying, retry] = useRetry(load)

  // Pick someone sensible when nothing (or someone who left) is selected.
  const current = useMemo(() => {
    if (!members) return null
    if (selected === 'invite' && isOwner) return { kind: 'invite' }
    const inv = invites.find((i) => `invite-${i.id}` === selected)
    if (inv) return { kind: 'pending', invite: inv }
    const m = members.find((x) => x.user_id === selected) ?? members.find((x) => !x.is_you) ?? members.find((x) => x.is_you)
    return m ? { kind: 'member', member: m } : null
  }, [members, invites, selected, isOwner])

  // Keep the choice in the address, so Home can link to a person and Back works.
  useEffect(() => {
    const key = current?.kind === 'member' ? current.member.user_id : current?.kind === 'pending' ? `invite-${current.invite.id}` : current?.kind
    if (!key) return
    const url = `/family?member=${encodeURIComponent(key)}`
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url)
  }, [current])

  // Their banks reach this page only if you may see their balances (the API
  // filters), so "has any bank here" is the test; yourself always.
  const sharedBalances = (m) => m.is_you || banks.some((b) => b.owner_user_id === m.user_id)

  const changed = () => {
    load()
    onChanged?.()
  }

  return (
    <div className="calm">
      <Head title="Family" sub="Nobody sees your money until you share it">
        {isOwner && (
          <Pill icon={UserPlus} onClick={() => setSelected('invite')}>
            Invite someone
          </Pill>
        )}
      </Head>
      {failed && members && sharing && <StaleBanner what="your family" busy={retrying} onRetry={retry} />}
      {!members || !sharing ? (
        failed ? (
          <LoadFailed what="your family" busy={retrying} onRetry={retry} />
        ) : (
          <PageSkeleton />
        )
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12 [&>*]:min-w-0">
          <section className="calm-glass rounded-2xl p-2 lg:col-span-4 xl:col-span-3" aria-label="People in your household">
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {members.map((m) => (
                <li key={m.user_id}>
                  <button
                    className={PERSON_BTN}
                    aria-current={current?.member?.user_id === m.user_id ? 'true' : undefined}
                    onClick={() => setSelected(m.user_id)}
                  >
                    <Avatar member={m} />
                    <span className="min-w-0 grow">
                      <span className="name block truncate text-[14px] font-semibold">
                        {nameOf(m)}
                        {m.is_you && <span className={`font-normal ${MUTED}`}> (you)</span>}
                      </span>
                      <span className={`block ${NOTE}`}>{ROLE_LABEL[m.role] ?? m.role}</span>
                    </span>
                  </button>
                </li>
              ))}
              {invites.map((inv) => (
                <li key={inv.id}>
                  <button
                    className={PERSON_BTN}
                    aria-current={current?.invite?.id === inv.id ? 'true' : undefined}
                    onClick={() => setSelected(`invite-${inv.id}`)}
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-400 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400"
                      aria-hidden="true"
                    >
                      <Mail className="size-4" />
                    </span>
                    <span className="min-w-0 grow">
                      <span className="name block truncate text-[14px] font-semibold">{inv.email}</span>
                      <span className={`block ${NOTE}`}>{ROLE_LABEL[inv.role] ?? inv.role}, invited</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid items-start gap-3 lg:col-span-8 xl:col-span-9 xl:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
            {current?.kind === 'member' && (
              <Person
                key={current.member.user_id}
                person={current.member}
                members={members}
                onSelect={setSelected}
                me={members.find((m) => m.is_you)}
                household={household}
                sharing={sharing}
                setSharing={setSharing}
                banks={banks}
                meId={me.user_id}
                onChanged={changed}
                onLeft={onLeft}
              />
            )}
            {current?.kind === 'invite' && (
              <Panel id="invite-h" title="Invite someone">
                <Invite householdId={household.id} onCreated={load} />
              </Panel>
            )}
            {current?.kind === 'pending' && <PendingInvite invite={current.invite} onCancelled={load} />}

            {current?.kind === 'member' && (
              <aside className="grid gap-3" aria-label="Cards, debts and how sharing works">
                {sharedBalances(current.member) && (
                  <CardsAndDebts
                    key={current.member.user_id}
                    title={current.member.is_you ? 'Your cards and debts' : `${nameOf(current.member)}'s cards and debts`}
                    accounts={banks
                      .filter((b) => b.owner_user_id === current.member.user_id)
                      .flatMap((b) => b.accounts.map((a) => ({ ...a, bankName: b.institution_name })))
                      .filter(isOwed)}
                    home={household.home_currency}
                  />
                )}
                <HowSharingWorks />
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Person({ person, members, onSelect, me, household, sharing, setSharing, banks, meId, onChanged, onLeft }) {
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null) // { kind: 'remove' | 'leave' | 'role', role? }
  const isOwner = household.role === 'owner'
  const name = nameOf(person)
  const you = person.is_you

  // Their money, as far as this person may see it (the API already filtered).
  const theirs = banks.filter((b) => b.owner_user_id === person.user_id).flatMap((b) => b.accounts)
  const counted = theirs.filter((a) => a.currency === household.home_currency && a.current_balance_minor != null)
  const have = counted.filter((a) => !isOwed(a)).reduce((t, a) => t + a.current_balance_minor, 0)
  const owe = counted.filter((a) => isOwed(a)).reduce((t, a) => t + a.current_balance_minor, 0)

  const parentView = !you && isKid(person.role) && !isKid(me.role) && me.role !== 'viewer'
  const received = sharing.received[person.user_id] ?? []
  const given = sharing.given[person.user_id] ?? []
  // Same rules as before (#28): nobody shares with teens or children, and
  // teens and children only share with viewers (parents already see theirs).
  const canShare = !you && !isKid(person.role) && (!isKid(me.role) || person.role === 'viewer')
  const seesTransactions = parentView || received.includes('transactions')

  async function toggle(category, on) {
    let next = new Set(given)
    if (on) next.add(category)
    else next.delete(category)
    if (!next.has('transactions')) next.delete('whereabouts') // time and location only with transactions
    next = [...next]
    const before = sharing
    setError('')
    setSharing({ ...sharing, given: { ...sharing.given, [person.user_id]: next } })
    try {
      await api('/api/sharing', {
        method: 'PUT',
        body: { household_id: household.id, viewer_user_id: person.user_id, categories: next },
      })
      onChanged()
    } catch {
      setSharing(before)
      setError(`We couldn't change what you share with ${name}. Try again.`)
    }
  }

  async function setRole(role) {
    await api(`/api/households/${household.id}/members/${person.user_id}`, { method: 'PUT', body: { role } })
    onChanged()
  }

  // Every role change asks first. Owner changes are serious, so they also
  // need a typed name and a fresh code (#38, ADR 0009).
  function chooseRole(role) {
    if (role !== person.role) setDialog({ kind: 'role', role })
  }

  async function remove() {
    try {
      await api(`/api/households/${household.id}/members/${person.user_id}`, { method: 'DELETE' })
    } catch (e) {
      throw new Error(say(e, "We couldn't do that just now."))
    }
    if (you) onLeft?.()
    else onChanged()
  }

  return (
    <section className="grid gap-3" aria-labelledby="person-h">
      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar member={person} />
          <div className="min-w-0 grow">
            <h2 id="person-h" className="m-0 font-[family-name:var(--font-heading)] text-[18px] font-semibold">
              {name}
              {you && <span className={`font-normal ${MUTED}`}> (you)</span>}
            </h2>
            <p className={`${NOTE} flex flex-wrap items-center gap-2`}>
              <Tag>{ROLE_LABEL[person.role] ?? person.role}</Tag>
              {you ? `${YOUR_ROLE[person.role] ?? 'You'} in ${household.name}.` : `${name} ${ROLE_INFO[person.role] ?? ''}`}
            </p>
          </div>
        </div>
        {isOwner && !you && person.role !== 'child' && (
          <div className="mt-3">
            <div role="group" aria-label={`Role for ${name}`} className="inline-flex flex-wrap rounded-full bg-zinc-100 dark:bg-zinc-800 p-0.5">
              {ROLES.map(([r, l]) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={person.role === r}
                  onClick={() => chooseRole(r)}
                  className="rounded-full px-3 py-1 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 transition-colors duration-150 aria-pressed:bg-white dark:aria-pressed:bg-zinc-900 aria-pressed:text-zinc-900 dark:aria-pressed:text-white aria-pressed:shadow-sm"
                >
                  {l}
                </button>
              ))}
            </div>
            <p className={`mt-1 ${NOTE}`}>Every change asks first. Owners can also remove people and change roles, including yours.</p>
          </div>
        )}
        {error && (
          <p className="m-0 mt-2 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
      </div>

      {!you && (
        <div className={CARD}>
          <h3 className={SUB}>What you see of {name}&apos;s money</h3>
          {theirs.length > 0 ? (
            <>
              {parentView && <p className={`mb-2 ${NOTE}`}>You see {name}&apos;s money as a parent.</p>}
              <HaveOwe
                have={have}
                owe={owe}
                cur={household.home_currency}
                haveTo={`/accounts?person=${person.user_id}#have`}
                oweTo={`/accounts?person=${person.user_id}#owe`}
              />
              <p className="m-0 mt-2 flex flex-wrap gap-4">
                <Link to={`/accounts?person=${person.user_id}`} className={LINK}>
                  See their {theirs.length} {theirs.length === 1 ? 'account' : 'accounts'}
                </Link>
                {seesTransactions && (
                  <Link to={`/transactions?owner=${person.user_id}`} className={LINK}>
                    Their transactions
                  </Link>
                )}
              </p>
            </>
          ) : (
            <p className={NOTE}>
              {parentView || received.includes('balances') ? `${name} hasn't linked a bank yet.` : `${name} hasn't shared balances with you.`}
            </p>
          )}
        </div>
      )}

      {!you && (
        <div className={CARD}>
          <h3 className={SUB}>You share with {name}</h3>
          {canShare ? (
            <>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {CATEGORIES.map(([c, label]) => (
                  <Switch
                    key={c}
                    label={label}
                    checked={given.includes(c)}
                    disabled={c === 'whereabouts' && !given.includes('transactions')}
                    onChange={(on) => toggle(c, on)}
                  />
                ))}
              </div>
              <p className={`mt-1 ${NOTE}`}>Time and location are only shared together with transactions. Changes take effect straight away.</p>
            </>
          ) : (
            <p className={NOTE}>
              {isKid(person.role)
                ? 'Teens and children only see their own money, so there’s nothing to share with them.'
                : 'Your parents already see your money, so there’s nothing to choose here.'}
            </p>
          )}
        </div>
      )}

      {!you && !isKid(me.role) && (
        <div className={CARD}>
          <h3 className={SUB}>{name} shares with you</h3>
          {parentView ? (
            <p className={NOTE}>You see {name}&apos;s money as a parent.</p>
          ) : received.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`${name} shares with you`}>
              {CATEGORIES.filter(([c]) => received.includes(c)).map(([c, label]) => (
                <Given key={c}>{label}</Given>
              ))}
            </ul>
          ) : (
            <p className={NOTE}>Nothing yet. Only {name} can choose to share with you.</p>
          )}
        </div>
      )}

      {you && (
        <YourSummary members={members} me={me} household={household} sharing={sharing} theirs={theirs} have={have} owe={owe} meId={meId} onSelect={onSelect} />
      )}

      {(you || (isOwner && person.role !== 'child')) && (
        <div className="px-1">
          <button
            type="button"
            className="text-[13px] font-semibold underline underline-offset-4"
            style={OWE}
            onClick={() => setDialog({ kind: you ? 'leave' : 'remove' })}
          >
            {you ? `Leave ${household.name}` : 'Remove from household'}
          </button>
        </div>
      )}

      {dialog?.kind === 'remove' && (
        <ConfirmDialog title={`Remove ${name}?`} action="Remove" typeToConfirm={name} needsCode onConfirm={remove} onClose={() => setDialog(null)}>
          <p>
            {name} will lose access to {household.name}. Their banks stay theirs.
          </p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'leave' && (
        <ConfirmDialog
          title={`Leave ${household.name}?`}
          action="Leave"
          typeToConfirm={household.name}
          needsCode
          onConfirm={remove}
          onClose={() => setDialog(null)}
        >
          <p>You&apos;ll stop seeing anything in {household.name}, and others will stop seeing your money.</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'role' && (
        <ConfirmDialog
          title={dialog.role === 'owner' ? `Make ${name} an owner?` : `Change ${name} to ${ROLE_LABEL[dialog.role]}?`}
          action={dialog.role === 'owner' ? 'Make owner' : 'Change role'}
          typeToConfirm={dialog.role === 'owner' || person.role === 'owner' ? name : undefined}
          needsCode={dialog.role === 'owner' || person.role === 'owner'}
          onConfirm={() => setRole(dialog.role).catch((e) => Promise.reject(new Error(say(e, "We couldn't change that role."))))}
          onClose={() => setDialog(null)}
        >
          <p>
            As {ROLE_LABEL[dialog.role].toLowerCase()}, {name} {ROLE_INFO[dialog.role]}.
          </p>
          {dialog.role === 'owner' && <p>Owners can also remove people and change roles, including yours.</p>}
          {person.role === 'owner' && <p>{name} will no longer be able to invite or remove people or change roles.</p>}
        </ConfirmDialog>
      )}
    </section>
  )
}

// Your own entry: your money, what you share and with whom, what others
// share with you, and your role. "Change" opens that person, where the
// switches are.
function YourSummary({ members, me, household, sharing, theirs, have, owe, meId, onSelect }) {
  const others = members.filter((m) => !m.is_you)
  const shareable = others.filter((m) => !isKid(m.role) && (!isKid(me.role) || m.role === 'viewer'))
  const fromOthers = isKid(me.role) ? [] : others.filter((m) => (sharing.received[m.user_id] ?? []).length > 0)
  const kids = isKid(me.role) || me.role === 'viewer' ? [] : others.filter((m) => isKid(m.role))
  const words = (list) =>
    CATEGORIES.filter(([c]) => list.includes(c))
      .map(([, l]) => l)
      .join(', ')

  return (
    <>
      <div className={CARD}>
        <h3 className={SUB}>Your money</h3>
        {theirs.length > 0 ? (
          <>
            <HaveOwe have={have} owe={owe} cur={household.home_currency} haveTo="/accounts#have" oweTo="/accounts#owe" you />
            <p className="m-0 mt-2 flex flex-wrap gap-4">
              <Link to="/accounts" className={LINK}>
                Your {theirs.length} {theirs.length === 1 ? 'account' : 'accounts'}
              </Link>
              <Link to={`/transactions?owner=${meId}`} className={LINK}>
                Your transactions
              </Link>
            </p>
          </>
        ) : (
          <p className={NOTE}>You haven&apos;t linked a bank yet.</p>
        )}
      </div>

      <div className={CARD}>
        <h3 className={SUB}>You share with</h3>
        {shareable.length === 0 ? (
          <p className={NOTE}>{isKid(me.role) ? 'Your parents already see your money.' : 'There’s nobody to share with yet.'}</p>
        ) : (
          <Rows>
            {shareable.map((m) => (
              <Row key={m.user_id} lead={<Avatar member={m} small />} name={nameOf(m)} sub={words(sharing.given[m.user_id] ?? []) || 'Nothing'}>
                <button type="button" className={CHANGE} onClick={() => onSelect(m.user_id)} aria-label={`Change what you share with ${nameOf(m)}`}>
                  Change
                </button>
              </Row>
            ))}
          </Rows>
        )}
      </div>

      {!isKid(me.role) && (
        <div className={CARD}>
          <h3 className={SUB}>Shared with you</h3>
          {fromOthers.length === 0 && kids.length === 0 ? (
            <p className={NOTE}>Nobody has shared with you yet.</p>
          ) : (
            <Rows>
              {fromOthers.map((m) => (
                <Row key={m.user_id} lead={<Avatar member={m} small />} name={nameOf(m)} sub={words(sharing.received[m.user_id])} />
              ))}
              {kids.map((m) => (
                <Row key={m.user_id} lead={<Avatar member={m} small />} name={nameOf(m)} sub="You see their money as a parent" />
              ))}
            </Rows>
          )}
        </div>
      )}
    </>
  )
}

function PendingInvite({ invite, onCancelled }) {
  const [error, setError] = useState('')
  async function cancel() {
    setError('')
    try {
      await api(`/api/invites/${invite.id}`, { method: 'DELETE' })
      onCancelled()
    } catch {
      setError("We couldn't cancel that invite.")
    }
  }
  return (
    <section className={CARD} aria-labelledby="pending-h">
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-400 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400"
          aria-hidden="true"
        >
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 grow">
          <h2 id="pending-h" className="m-0 truncate font-[family-name:var(--font-heading)] text-[18px] font-semibold">
            {invite.email}
          </h2>
          <Tag>{ROLE_LABEL[invite.role] ?? invite.role}, invited</Tag>
        </div>
      </div>
      <p className={`mt-3 ${NOTE}`}>
        Waiting to join. The link works once, only for this email, until{' '}
        {new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
      </p>
      {error && (
        <p className="m-0 mt-2 font-semibold" style={OWE} role="alert">
          {error}
        </p>
      )}
      <div className="mt-3">
        <Pill quiet onClick={cancel}>
          Cancel invite
        </Pill>
      </div>
    </section>
  )
}
