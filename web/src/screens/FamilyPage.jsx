import { useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { api } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { Link } from '../lib/router.jsx'
import { isOwed } from '../lib/summary.js'
import { Invite } from './Members.jsx'
import { PageHead } from './Shell.jsx'

// Family (#39 step 4, #37, #38): everyone in the household on the left; pick
// a person to see their money (what you may see of it), what you share with
// them and what they share with you, and, for owners, their role and Remove.
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
const isKid = (role) => role === 'teen' || role === 'child'

const fromAddress = () => new URLSearchParams(window.location.search).get('member') ?? ''

const MESSAGES = {
  last_owner: 'A household needs at least one owner. Make someone else an owner first.',
  reauth_required: 'That took a little long. Enter a new code from your app and try again.',
}
const say = (err, fallback) => MESSAGES[err.message] ?? fallback

export default function FamilyPage({ me, household, refreshKey, onChanged, onLeft }) {
  const [members, setMembers] = useState(null)
  const [sharing, setSharing] = useState(null)
  const [banks, setBanks] = useState([])
  const [invites, setInvites] = useState([])
  const [selected, setSelected] = useState(fromAddress)
  const [error, setError] = useState('')
  const isOwner = household.role === 'owner'

  const load = useCallback(() => {
    const hh = encodeURIComponent(household.id)
    Promise.all([
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
      },
      () => setError("We couldn't load your family. Try again in a moment."),
    )
  }, [household.id, isOwner])

  useEffect(load, [load, refreshKey])

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

  const changed = () => {
    load()
    onChanged?.()
  }

  return (
    <>
      <PageHead title="Family" sub="Nobody sees your money until you share it">
        {isOwner && (
          <button className="btn" onClick={() => setSelected('invite')}>
            Invite someone
          </button>
        )}
      </PageHead>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!members || !sharing ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="family-grid">
          <section className="panel family-list" aria-label="People in your household">
            <ul className="rows">
              {members.map((m) => (
                <li key={m.user_id}>
                  <button
                    className="family-person"
                    aria-current={current?.member?.user_id === m.user_id ? 'true' : undefined}
                    onClick={() => setSelected(m.user_id)}
                  >
                    <Avatar member={m} />
                    <span className="grow">
                      <span className="name block">
                        {nameOf(m)}
                        {m.is_you && <span className="muted"> (you)</span>}
                      </span>
                      <span className="small muted block">{ROLE_LABEL[m.role] ?? m.role}</span>
                    </span>
                  </button>
                </li>
              ))}
              {invites.map((inv) => (
                <li key={inv.id}>
                  <button
                    className="family-person"
                    aria-current={current?.invite?.id === inv.id ? 'true' : undefined}
                    onClick={() => setSelected(`invite-${inv.id}`)}
                  >
                    <span className="avatar avatar-invite" aria-hidden="true">
                      {inv.email.charAt(0).toUpperCase()}
                    </span>
                    <span className="grow">
                      <span className="name block">{inv.email}</span>
                      <span className="small muted block">{ROLE_LABEL[inv.role] ?? inv.role} · invited</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="family-detail">
            {current?.kind === 'member' && (
              <Person
                key={current.member.user_id}
                person={current.member}
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
              <section className="panel" aria-labelledby="invite-h">
                <div className="panel-head">
                  <h2 id="invite-h">Invite someone</h2>
                </div>
                <Invite householdId={household.id} onCreated={load} />
              </section>
            )}
            {current?.kind === 'pending' && <PendingInvite invite={current.invite} onCancelled={load} />}
          </div>
        </div>
      )}
    </>
  )
}

function Person({ person, me, household, sharing, setSharing, banks, meId, onChanged, onLeft }) {
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

  function chooseRole(role) {
    if (role === person.role) return
    // Owner changes are serious: they need a typed name and a fresh code.
    if (role === 'owner' || person.role === 'owner') {
      setDialog({ kind: 'role', role })
      return
    }
    setError('')
    setRole(role).catch((e) => setError(say(e, "We couldn't change that role.")))
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
    <section className="panel person" aria-labelledby="person-h">
      <div className="person-head">
        <Avatar member={person} />
        <div className="grow">
          <h2 id="person-h">
            {name}
            {you && <span className="muted"> (you)</span>}
          </h2>
          <span className="tag">{ROLE_LABEL[person.role] ?? person.role}</span>
        </div>
        {isOwner && !you && person.role !== 'child' && (
          <label className="role-select">
            <span className="sr-only">Role for {name}</span>
            <select value={person.role} onChange={(e) => chooseRole(e.target.value)}>
              {ROLES.map(([r, l]) => (
                <option key={r} value={r}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!you && (
        <div className="person-section">
          {theirs.length > 0 ? (
            <>
              <div className="have-owe">
                <Link to={`/accounts?person=${person.user_id}#have`} className="tone-sage">
                  <span className="small">Has</span>
                  <span className="amount">{formatMoney(have, household.home_currency)}</span>
                </Link>
                <Link to={`/accounts?person=${person.user_id}#owe`} className="tone-clay">
                  <span className="small">Owes</span>
                  <span className="amount">{formatMoney(owe, household.home_currency)}</span>
                </Link>
              </div>
              <p className="small person-links">
                <Link to={`/accounts?person=${person.user_id}`} className="link">
                  See their {theirs.length} {theirs.length === 1 ? 'account' : 'accounts'}
                </Link>
                {seesTransactions && (
                  <Link to={`/transactions?owner=${person.user_id}`} className="link">
                    Their transactions
                  </Link>
                )}
              </p>
            </>
          ) : (
            <p className="small muted">
              {parentView || received.includes('balances')
                ? `${name} hasn't linked a bank yet.`
                : `${name} hasn't shared balances with you.`}
            </p>
          )}
        </div>
      )}

      {!you && (
        <div className="person-section">
          <h3 className="sub-heading">You share with {name}</h3>
          {canShare ? (
            <div className="switches">
              {CATEGORIES.map(([c, label]) => {
                const needsTx = c === 'whereabouts' && !given.includes('transactions')
                return (
                  <label key={c} className={needsTx ? 'switch muted' : 'switch'}>
                    <input type="checkbox" role="switch" checked={given.includes(c)} disabled={needsTx} onChange={(e) => toggle(c, e.target.checked)} />
                    <span className="switch-track" aria-hidden="true" />
                    {label}
                  </label>
                )
              })}
            </div>
          ) : (
            <p className="small muted">
              {isKid(person.role)
                ? 'Teens and children only see their own money, so there’s nothing to share with them.'
                : 'Your parents already see your money, so there’s nothing to choose here.'}
            </p>
          )}
          {canShare && <p className="small muted">Time and location are only shared together with transactions. Changes take effect straight away.</p>}
        </div>
      )}

      {!you && !isKid(me.role) && (
        <div className="person-section">
          <h3 className="sub-heading">{name} shares with you</h3>
          {parentView ? (
            <p className="small muted">You see {name}&apos;s money as a parent.</p>
          ) : received.length > 0 ? (
            <div className="chips">
              {CATEGORIES.filter(([c]) => received.includes(c)).map(([c, label]) => (
                <span key={c} className="chip chip-on">
                  ✓ {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="small muted">Nothing yet. Only {name} can choose to share with you.</p>
          )}
        </div>
      )}

      {you && (
        <div className="person-section">
          <p className="small muted">
            Pick someone on the left to choose what you share with them. You&apos;re {isOwner ? 'an owner' : `a ${ROLE_LABEL[person.role]?.toLowerCase() ?? person.role}`}{' '}
            in {household.name}.
          </p>
        </div>
      )}

      {(you || (isOwner && person.role !== 'child')) && (
        <div className="person-footer">
          <button className="link danger-link" onClick={() => setDialog({ kind: you ? 'leave' : 'remove' })}>
            {you ? `Leave ${household.name}` : 'Remove from household'}
          </button>
        </div>
      )}

      {dialog?.kind === 'remove' && (
        <ConfirmDialog
          title={`Remove ${name}?`}
          action="Remove"
          typeToConfirm={name}
          needsCode
          onConfirm={remove}
          onClose={() => setDialog(null)}
        >
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
          title={dialog.role === 'owner' ? `Make ${name} an owner?` : `Change ${name}'s role to ${ROLE_LABEL[dialog.role]}?`}
          action={dialog.role === 'owner' ? 'Make owner' : 'Change role'}
          typeToConfirm={name}
          needsCode
          onConfirm={() => setRole(dialog.role).catch((e) => Promise.reject(new Error(say(e, "We couldn't change that role."))))}
          onClose={() => setDialog(null)}
        >
          <p>
            {dialog.role === 'owner'
              ? `Owners can invite and remove people and change roles, including yours.`
              : `${name} will no longer be able to invite or remove people or change roles.`}
          </p>
        </ConfirmDialog>
      )}
    </section>
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
    <section className="panel person" aria-labelledby="pending-h">
      <div className="person-head">
        <span className="avatar avatar-invite" aria-hidden="true">
          {invite.email.charAt(0).toUpperCase()}
        </span>
        <div className="grow">
          <h2 id="pending-h">{invite.email}</h2>
          <span className="tag">{ROLE_LABEL[invite.role] ?? invite.role} · invited</span>
        </div>
      </div>
      <p className="small muted">
        Waiting to join. The link works once, only for this email, until{' '}
        {new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="person-footer">
        <button className="btn btn-secondary" onClick={cancel}>
          Cancel invite
        </button>
      </div>
    </section>
  )
}
