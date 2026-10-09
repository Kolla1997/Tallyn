import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import CodeForm from './CodeForm.jsx'

// Later sign-ins: the password was right, now the authenticator code.
export default function Verify2FA({ onSignOut }) {
  const [factorId, setFactorId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) setError(error.message)
      else if (data.totp[0]) setFactorId(data.totp[0].id)
    })
  }, [])

  return (
    <section className="card">
      <h1>Enter your code</h1>
      <p className="muted">Open your authenticator app and enter the 6-digit code for Tallyn.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {factorId && <CodeForm factorId={factorId} button="Continue" />}
      <button className="link" onClick={onSignOut}>
        Use a different account
      </button>
    </section>
  )
}
