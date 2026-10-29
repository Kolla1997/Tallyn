import { useEffect, useRef, useState } from 'react'
import { LockIcon } from '../components/Icons.jsx'
import { markJustSetUp, takeRecovered } from '../lib/backupCodes.js'
import { supabase } from '../lib/supabase.js'
import CodeForm from './CodeForm.jsx'
import { TryAgain } from '../components/LoadFailed.jsx'
import Heading from '../components/Heading.jsx'

// First sign-in: add Tallyn to an authenticator app (TOTP) and confirm a code.
// Also after recovering with a backup code (#23): set up again, then save a
// new set of backup codes.
export default function SetUp2FA({ onSignOut }) {
  const [factor, setFactor] = useState(null) // { id, qr, secret }
  const [recovered] = useState(takeRecovered)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    // Enrol once, even though StrictMode runs effects twice in development.
    if (started.current) return
    started.current = true
    markJustSetUp() // backup codes come next (#23)
    start()
  }, [])

  // Can fail to start (#152): calm words and Try again, never Supabase's text.
  function start() {
    setStarting(true)
    setError('')
    return enrol()
      .then(setFactor, (e) => {
        console.error(e)
        setError("We couldn't start setting up your authenticator. Try again in a moment.")
      })
      .finally(() => setStarting(false))
  }

  return (
    <section className="card">
      {recovered && (
        <p className="info-note">
          <LockIcon />
          <span>You&apos;re in with a backup code. Your old authenticator has been removed.</span>
        </p>
      )}
      <Heading>{recovered ? 'Set up your authenticator' : 'Protect your account'}</Heading>
      <p className="muted">
        Coinroof asks for a code from an authenticator app each time you sign in, so your password alone isn&apos;t enough. Microsoft Authenticator, Google
        Authenticator and 1Password all work.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {error && !factor && <TryAgain busy={starting} onRetry={start} />}
      {factor && (
        <>
          <ol>
            <li>In your authenticator app, add an account and scan this code.</li>
          </ol>
          <img className="qr" src={factor.qr} alt="QR code to add Coinroof to your authenticator app" />
          <p className="muted">Can&apos;t scan it? Enter this key instead:</p>
          <p className="secret">{factor.secret}</p>
          <ol start={2}>
            <li>
              Enter the <span className="nowrap">6-digit</span> code your app shows for Coinroof.
            </li>
          </ol>
          <CodeForm factorIds={[factor.id]} button="Turn on 2FA" />
          <p className="muted small">
            {recovered ? "Then you'll get a new set of backup codes." : "Then you'll save backup codes, for when you can't use your phone."}
          </p>
        </>
      )}
      <div className="card-links card-links-end">
        <button className="link-quiet" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </section>
  )
}

async function enrol() {
  // Clear any half-finished set-up from an earlier visit.
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) throw listError
  for (const f of factors.all) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Coinroof' })
  if (error) throw error
  const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`
  return { id: data.id, qr, secret: data.totp.secret }
}
