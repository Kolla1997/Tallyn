import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Pill, MUTED, OWE } from '../components/calm/ui.jsx'
import { api } from '../lib/api.js'
import { inviteLink } from '../lib/invite.js'

const FIELD = 'h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[14px]'
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
  const [copied, setCopied] = useState(null) // true, false (failed) or null
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return // a double click makes one invite, not two (#154)
    setError('')
    setCopied(null)
    setBusy(true)
    try {
      const d = await api(`/api/households/${householdId}/invites`, { method: 'POST', body: { email, role } })
      setLink({ url: inviteLink(d.token), email: d.invite.email })
      setEmail('')
      onCreated()
    } catch (err) {
      setError(
        err.message === 'already_member'
          ? 'That person is already in your household.'
          : err.message === 'bad_request'
            ? 'Check the email address and try again.'
            : "We couldn't create the invite.",
      )
    }
    setBusy(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      setCopied(false) // said out loud below, not silent (#153)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 text-[14px]">
      <label className="grid gap-1">
        <span className="font-semibold">Their email</span>
        <input className={FIELD} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@example.com" />
      </label>
      <label className="grid gap-1">
        <span className="font-semibold">Role</span>
        <select className={FIELD} value={role} onChange={(e) => setRole(e.target.value)}>
          {INVITE_ROLES.map(([r, l]) => (
            <option key={r} value={r}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <p className={`m-0 text-[13px] ${MUTED}`}>Nobody sees your money until you share it, whatever their role.</p>
      {error && (
        <p className="m-0 font-semibold" style={OWE} role="alert">
          {error}
        </p>
      )}
      <div>
        <Pill type="submit" icon={Mail} disabled={busy}>
          {busy ? 'Creating…' : 'Create invite link'}
        </Pill>
      </div>
      {link && (
        <div className="grid gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3" role="status">
          <p className="m-0">
            Send this link to <strong>{link.email}</strong>. It works once, only for that email, for 7 days. You won&apos;t see it again, so copy it now.
          </p>
          <p className="m-0 font-mono text-[13px] break-all">{link.url}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Pill quiet onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </Pill>
            {copied === false && <span className={`text-[13px] ${MUTED}`}>We couldn&apos;t copy it. Select the link and copy it yourself.</span>}
          </div>
        </div>
      )}
    </form>
  )
}
