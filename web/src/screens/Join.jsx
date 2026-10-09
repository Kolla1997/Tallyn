import { useState } from 'react'
import { api } from '../lib/api.js'
import { clearInvite } from '../lib/invite.js'

// Shown after sign-in when the person opened an invite link (#12).
export default function Join({ token, onJoined, onDismiss }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function join() {
    setBusy(true)
    setError('')
    try {
      const d = await api('/api/invites/accept', { method: 'POST', body: { token } })
      clearInvite()
      onJoined(d.household_id)
    } catch {
      clearInvite()
      setError(
        "This invite isn't valid for your account. It may have expired or been used already, or it was sent to a different email. Ask for a new one.",
      )
    }
    setBusy(false)
  }

  return (
    <section className="card">
      <h1>You&apos;ve been invited</h1>
      <p className="muted">
        Someone invited you to their household on Tallyn. Joining doesn&apos;t share any of your money: you choose that later
        in Sharing.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!error && (
        <button className="btn" onClick={join} disabled={busy}>
          {busy ? 'Joining…' : 'Join household'}
        </button>
      )}
      <button
        className="link"
        onClick={() => {
          clearInvite()
          onDismiss()
        }}
      >
        {error ? 'Continue' : 'Not now'}
      </button>
    </section>
  )
}
