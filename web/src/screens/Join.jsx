import { useState } from 'react'
import { api } from '../lib/api.js'
import { clearInvite } from '../lib/invite.js'
import { TryAgain } from '../components/LoadFailed.jsx'
import Heading from '../components/Heading.jsx'

// Shown after sign-in when the person opened an invite link (#12).
export default function Join({ token, onJoined, onDismiss }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [kept, setKept] = useState(false) // not reached: the invite is still here (#151)

  async function join() {
    setBusy(true)
    setError('')
    setKept(false)
    try {
      const d = await api('/api/invites/accept', { method: 'POST', body: { token } })
      clearInvite()
      onJoined(d.household_id)
    } catch (e) {
      // Not reached (#151): keep the invite so they can try again.
      if (!e.status || e.status >= 500) {
        setError("We couldn't reach Tallyn just now. Your invite is still here.")
        setKept(true)
        setBusy(false)
        return
      }
      clearInvite()
      setError("This invite isn't valid for your account. It may have expired or been used already, or it was sent to a different email. Ask for a new one.")
    }
    setBusy(false)
  }

  return (
    <section className="card">
      <Heading>You&apos;ve been invited</Heading>
      <p className="muted">Someone invited you to their household on Tallyn. Joining doesn&apos;t share any of your money: you choose that later in Sharing.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {kept ? (
        <TryAgain busy={busy} onRetry={join} />
      ) : (
        !error && (
          <button className="btn" onClick={join} disabled={busy}>
            {busy ? 'Joining…' : 'Join household'}
          </button>
        )
      )}
      <button
        className="link"
        onClick={() => {
          clearInvite()
          onDismiss()
        }}
      >
        {error && !kept ? 'Continue' : 'Not now'}
      </button>
    </section>
  )
}
