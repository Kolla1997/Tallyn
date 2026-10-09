import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Asks for the 6-digit code from the authenticator app and verifies it for
// factorId. A correct code upgrades the session to aal2, which the app picks
// up from onAuthStateChange.
export default function CodeForm({ factorId, button }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (error) {
      setError("That code didn't work. Check the code in your app and try again.")
      setCode('')
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        6-digit code
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" type="submit" disabled={busy || code.length !== 6}>
        {button}
      </button>
    </form>
  )
}
