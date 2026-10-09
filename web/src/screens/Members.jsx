import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { inviteLink } from '../lib/invite.js'

// Members and invitations (#12). The database enforces every rule (only owners
// invite or change roles, a household keeps an owner); this screen shows and asks.
const INVITE_ROLES = [
  ['adult', 'Adult'],
  ['teen', 'Teen (13 to 17)'],
  ['viewer', 'Viewer (sees only what people share)'],
]
const SET_ROLES = [['owner', 'Owner'], ...INVITE_ROLES.map(([r, l]) => [r, l.split(' (')[0]])]

export default function Members({ household, onChanged, onLeft }) {
  const isOwner = household.role === 'owner'
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // user_id to remove (or yourself to leave)

  const load = useCallback(() => {
    api(`/api/households/${household.id}/members`).then((d) => setMembers(d.members), () => setError("We couldn't load your household's members."))
    if (isOwner) api(`/api/households/${household.id}/invites`).then((d) => setInvites(d.invites), () => {})
  }, [household.id, isOwner])

  useEffect(load, [load])

  async function setRole(m, role) {
    setError('')
    try {
      await api(`/api/households/${household.id}/members/${m.user_id}`, { method: 'PUT', body: { role } })
      load()
      onChanged?.()
    } catch (e) {
      setError(e.message === 'last_owner' ? 'A household needs at least one owner. Make someone else an owner first.' : "We couldn't change that role.")
    }
  }

  async function remove(m) {
    setError('')
    try {
      await api(`/api/households/${household.id}/members/${m.user_id}`, { method: 'DELETE' })
      setConfirm(null)
      if (m.is_you) onLeft?.()
      else {
        load()
        onChanged?.()
      }
    } catch (e) {
      setError(e.message === 'last_owner' ? 'A household needs at least one owner. Make someone else an owner before you leave.' : "We couldn't do that just now.")
    }
  }

  async function cancelInvite(inv) {
    setError('')
    try {
      await api(`/api/invites/${inv.id}`, { method: 'DELETE' })
      load()
    } catch {
      setError("We couldn't cancel that invite.")
    }
  }

  const nameOf = (m) => m.display_name || `Your ${m.role}`

  return (
    <>
      <h2>Members</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="members">
        {members.map((m) => (
          <li key={m.user_id}>
            <div className="member-row">
              <span>
                {nameOf(m)}
                {m.is_you && <span className="muted"> (you)</span>}
              </span>
              {isOwner && !m.is_you && m.role !== 'child' ? (
                <select aria-label={`Role for ${nameOf(m)}`} value={m.role} onChange={(e) => setRole(m, e.target.value)}>
                  {SET_ROLES.map(([r, l]) => (
                    <option key={r} value={r}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted">{m.role}</span>
              )}
            </div>
            {(m.is_you || isOwner) &&
              (confirm === m.user_id ? (
                <div className="confirm" role="group" aria-label={m.is_you ? 'Leave this household?' : `Remove ${nameOf(m)}?`}>
                  <p>
                    {m.is_you
                      ? `Leave ${household.name}? You'll stop seeing anything here, and others will stop seeing your money.`
                      : `Remove ${nameOf(m)}? They'll lose access to ${household.name}, and their banks stay theirs.`}
                  </p>
                  <div className="confirm-actions">
                    <button className="btn" onClick={() => remove(m)}>
                      {m.is_you ? 'Leave' : 'Remove'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setConfirm(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className="link small" onClick={() => setConfirm(m.user_id)}>
                  {m.is_you ? 'Leave household' : 'Remove'}
                </button>
              ))}
          </li>
        ))}
      </ul>

      {isOwner && <Invite householdId={household.id} onCreated={load} />}

      {isOwner && invites.length > 0 && (
        <>
          <h3 className="small-heading">Waiting to join</h3>
          <ul className="members">
            {invites.map((inv) => (
              <li key={inv.id} className="member-row">
                <span>
                  {inv.email} <span className="muted small">· {inv.role} · until {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </span>
                <button className="link small" onClick={() => cancelInvite(inv)}>
                  Cancel invite
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Invite({ householdId, onCreated }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('adult')
  const [link, setLink] = useState(null) // { url, email }
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setCopied(false)
    try {
      const d = await api(`/api/households/${householdId}/invites`, { method: 'POST', body: { email, role } })
      setLink({ url: inviteLink(d.token), email: d.invite.email })
      setEmail('')
      onCreated()
    } catch (err) {
      setError(
        err.message === 'already_member'
          ? "That person is already in your household."
          : err.message === 'bad_request'
            ? 'Check the email address and try again.'
            : "We couldn't create the invite.",
      )
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <form onSubmit={submit} className="invite-form">
      <h3 className="small-heading">Invite someone</h3>
      <label>
        Their email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@example.com" />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {INVITE_ROLES.map(([r, l]) => (
            <option key={r} value={r}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-secondary" type="submit">
        Create invite link
      </button>
      {link && (
        <div className="confirm" role="status">
          <p>
            Send this link to <strong>{link.email}</strong>. It works once, only for that email, for 7 days. You won&apos;t
            see it again, so copy it now.
          </p>
          <p className="secret">{link.url}</p>
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
