import { useEffect, useId, useState } from 'react'
import { LockIcon } from '../components/Icons.jsx'
import { verifiedAuthenticators } from '../lib/mfa.js'
import { UseBackupCode } from './BackupCodes.jsx'
import CodeForm from './CodeForm.jsx'
import { TryAgain } from '../components/LoadFailed.jsx'
import Heading from '../components/Heading.jsx'

// Later sign-ins: the password was right, now the authenticator code (any of
// your authenticators, #23).
// `recovering`: on the way to a new password (#22); the code comes first.
// Lost your phone (#23, Dinesh picked A): "Can't get a code?" offers a
// backup code instead.
export default function Verify2FA({ onSignOut, recovering = false, onCancelReset }) {
  const [factorIds, setFactorIds] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [help, setHelp] = useState(false)
  const [backup, setBackup] = useState(false)
  const helpId = useId()

  // Can fail to load (#152): calm words and Try again, never Supabase's text.
  const load = () =>
    verifiedAuthenticators().then(
      (list) => setFactorIds(list.map((f) => f.id)),
      (e) => {
        console.error(e)
        setError("We couldn't load your sign-in step. Try again in a moment.")
      },
    )
  function retry() {
    setLoading(true)
    setError('')
    load().finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  if (backup) return <UseBackupCode onBack={() => setBackup(false)} />

  return (
    <section className="card">
      <Heading>Enter your code</Heading>
      {recovering && (
        <p className="info-note">
          <LockIcon />
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
      {error && !factorIds && <TryAgain busy={loading} onRetry={retry} />}
      {factorIds?.length > 0 && <CodeForm factorIds={factorIds} button="Continue" />}
      {help && (
        <div id={helpId} className="code-help">
          <p className="info-note">
            <LockIcon />
            <span>Lost your phone or deleted the app? Use one of the backup codes you saved.</span>
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setBackup(true)}>
            Use a backup code
          </button>
        </div>
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
