import { useEffect, useRef, useState } from 'react'
import { LockIcon } from '../components/Icons.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import { TryAgain } from '../components/LoadFailed.jsx'
import { verifiedAuthenticators } from '../lib/mfa.js'
import CodeForm from './CodeForm.jsx'
import { api } from '../lib/api.js'
import { clearJustSetUp, codesFile, justSetUp, markRecovered, remindLater, remindedLater } from '../lib/backupCodes.js'
import { totpAt } from '../lib/session.js'
import { supabase } from '../lib/supabase.js'
import Heading from '../components/Heading.jsx'

// Backup codes (#23, Dinesh picked A): ten one-time codes for when you can't
// use your authenticator. Shown once, as a 2×5 grid with Copy, Download and
// Print; you tick that you've saved them to continue.

const FRESH = 4 * 60 * 1000 // the API wants a 2FA code from the last 5 minutes

// Makes a new set and shows it. `canDefer`: existing accounts may say
// "Remind me next time" once per sign-in. `onDone` after the tick.
export function SaveBackupCodes({ email, canDefer = false, newFeature = false, onDone, onDefer, done = 'Continue to Tallyn' }) {
  const [codes, setCodes] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [making, setMaking] = useState(false)
  const [reauth, setReauth] = useState(null) // authenticator ids when a fresh code is needed (#151)
  const asked = useRef(false)

  // Making them can fail (#151): Try again, or one more code first when the
  // last one was too long ago.
  function make() {
    setMaking(true)
    setError('')
    return api('/api/backup-codes', { method: 'POST' })
      .then(
        (d) => {
          setReauth(null)
          setCodes(d.codes)
        },
        (e) =>
          e.message === 'reauth_required'
            ? verifiedAuthenticators().then(
                (f) => setReauth(f.map((x) => x.id)),
                () => setError("We couldn't make your codes. Try again in a moment."),
              )
            : setError("We couldn't make your codes. Try again in a moment."),
      )
      .finally(() => setMaking(false))
  }

  useEffect(() => {
    // Once, even though StrictMode runs effects twice in development: a
    // second set would replace the one on screen.
    if (asked.current) return
    asked.current = true
    make()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
    } catch {
      setError("Copying didn't work here. Use Download or Print instead.")
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([codesFile(codes, email)], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'tallyn-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="card backup-codes">
      {newFeature && (
        <p className="info-note">
          <LockIcon />
          <span>
            <strong>New:</strong> backup codes, so losing your phone doesn&apos;t lock you out.
          </span>
        </p>
      )}
      <Heading>Save your backup codes</Heading>
      {reauth ? (
        <p className="muted">That took a little long, so we need one more code from your authenticator app before we make them.</p>
      ) : (
        <p className="muted">
          If you lose your phone, each of these codes gets you in once. Keep them somewhere safe, like a password manager or a printed copy at home.
        </p>
      )}
      {error && (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <TryAgain busy={making} onRetry={make} />
        </>
      )}
      {reauth && !codes && <CodeForm factorIds={reauth} button="Make my codes" onVerified={make} />}
      {!codes && !error && !reauth && <TallynLoader small text="Making your codes" />}
      {codes && (
        <>
          <ol className="codes-grid" aria-label="Your backup codes">
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ol>
          <div className="codes-actions">
            <button type="button" className="btn btn-secondary btn-small" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={download}>
              Download
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <p className="warn-note">You won&apos;t see these codes again. You can get new ones in Settings.</p>
          <label className="agree">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I&apos;ve saved these codes somewhere safe</span>
          </label>
          <button type="button" className="btn" disabled={!saved} onClick={onDone}>
            {done}
          </button>
        </>
      )}
      {canDefer && (
        <div className="card-links">
          <button type="button" className="link-quiet" onClick={onDefer}>
            Remind me next time
          </button>
        </div>
      )}
    </section>
  )
}

// After signing in or setting up 2FA: ask for backup codes when there are
// none yet, or right after a new authenticator (a recovery makes a new set).
// Only within a few minutes of a 2FA code, like the API's step-up check.
export function BackupCodesGate({ accessToken, email, page: Page, children }) {
  const [fresh] = useState(() => {
    const at = totpAt(accessToken)
    return at != null && Date.now() - at < FRESH && (justSetUp() || !remindedLater())
  })
  const [state, setState] = useState(fresh ? 'checking' : 'done') // 'checking' | 'ask' | 'done'
  const [isNew] = useState(justSetUp)

  useEffect(() => {
    if (!fresh) return
    api('/api/backup-codes').then(
      (s) => setState(isNew || s.total === 0 ? 'ask' : 'done'),
      () => setState('done'), // never block Tallyn on this
    )
  }, [fresh, isNew])

  const finish = () => {
    clearJustSetUp()
    setState('done')
  }

  if (state === 'done') return children
  return (
    <Page centred={state !== 'ask'}>
      {state === 'checking' ? (
        <TallynLoader />
      ) : (
        <>
          <SaveBackupCodes
            email={email}
            canDefer={!isNew}
            newFeature={!isNew}
            onDone={finish}
            onDefer={() => {
              remindLater()
              finish()
            }}
          />
        </>
      )}
    </Page>
  )
}

const RECOVERY_ERRORS = {
  wrong_code: "That code didn't work. Check it and try again. Each code works once.",
  too_many_requests: 'Too many tries. Wait 15 minutes, then try again.',
  recovery_failed: "We couldn't finish. That code is used now, but your other codes still work. Try another one in a minute.",
  recovery_unavailable: "Recovery with a backup code isn't available right now.",
}

// "Use a backup code" (#23): after the password, instead of the 6-digit
// code. The server checks it and removes the lost authenticator; then you set
// up a new one straight away.
export function UseBackupCode({ onBack }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/api/recovery/backup-code', { method: 'POST', body: { code } })
      markRecovered()
      // The session now has no authenticator: Tallyn asks to set one up.
      await supabase.auth.refreshSession()
    } catch (err) {
      setError(RECOVERY_ERRORS[err.message] ?? 'Something went wrong. Try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <Heading>Use a backup code</Heading>
      <p className="muted">Enter one of the codes you saved when you set up two-step sign-in. Each code works once.</p>
      <form onSubmit={submit}>
        <label>
          Backup code
          <input
            className="backup-code-input"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={11}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoFocus
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || code.replace(/[\s-]/g, '').length !== 8}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <p className="muted small">After this, you&apos;ll set up your authenticator again, and the lost one stops working.</p>
      </form>
      <div className="card-links">
        <button type="button" className="link-quiet" onClick={onBack}>
          ← Back to the <span className="nowrap">6-digit</span> code
        </button>
      </div>
    </section>
  )
}
