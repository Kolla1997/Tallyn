import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import CodeForm from './CodeForm.jsx'

// Later sign-ins: the password was right, now the authenticator code.
// `recovering`: on the way to a new password (#22); the code comes first.
export default function Verify2FA({ onSignOut, recovering = false, onCancelReset }) {
  const [factorId, setFactorId] = useState(null)
  const [error, setError] = useState('')
  const [help, setHelp] = useState(false)
  const helpId = useId()

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) setError(error.message)
      else if (data.totp[0]) setFactorId(data.totp[0].id)
    })
  }, [])

  return (
    <section className="card">
      <h1>Enter your code</h1>
      {recovering && (
        <p className="info-note">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
          </svg>
          <span>To keep your account safe, enter your authenticator code before choosing a new password.</span>
        </p>
      )}
      <p className="muted">
        Open your authenticator app and enter the <span className="nowrap">6-digit</span> code for Tallyn.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {factorId && <CodeForm factorId={factorId} button="Continue" />}
      {/* Lost authenticator (#108): recovery itself is #23. */}
      {help && (
        <p id={helpId} className="info-note code-help">
          {/* TODO(#23): add how to get help until recovery codes exist (contact to confirm with Dinesh). */}
          Lost your phone or deleted the app? Soon you&apos;ll be able to get back in with a recovery code here.
        </p>
      )}
      <div className="card-links">
        <button className="link-quiet" aria-expanded={help} aria-controls={helpId} onClick={() => setHelp(!help)}>
          Can&apos;t get a code?
        </button>
        <button className="link-quiet" onClick={recovering ? onCancelReset : onSignOut}>
          {recovering ? 'Cancel reset' : 'Use a different account'}
        </button>
      </div>
    </section>
  )
}
