import { useState } from 'react'
import { api } from '../lib/api.js'
import { inviteLink } from '../lib/invite.js'

const INVITE_ROLES = [
  ['adult', 'Adult'],
  ['teen', 'Teen (13 to 17)'],
  ['viewer', 'Viewer (sees only what people share)'],
]
// The invite form (#12), shown on the Family page. The database enforces who
// may invite; this form only asks.
export function Invite({ householdId, onCreated }) {
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
