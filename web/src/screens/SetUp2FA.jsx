import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import CodeForm from './CodeForm.jsx'

// First sign-in: add Tallyn to an authenticator app (TOTP) and confirm a code.
export default function SetUp2FA({ onSignOut }) {
  const [factor, setFactor] = useState(null) // { id, qr, secret }
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    // Enrol once, even though StrictMode runs effects twice in development.
    if (started.current) return
    started.current = true
    enrol().then(setFactor, (e) => setError(e.message))
  }, [])

  return (
    <section className="card">
      <h1>Protect your account</h1>
      <p className="muted">
        Tallyn asks for a code from an authenticator app each time you sign in, so your password alone isn&apos;t enough. Microsoft Authenticator, Google
        Authenticator and 1Password all work.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {factor && (
        <>
          <ol>
            <li>In your authenticator app, add an account and scan this code.</li>
          </ol>
          <img className="qr" src={factor.qr} alt="QR code to add Tallyn to your authenticator app" />
          <p className="muted">Can&apos;t scan it? Enter this key instead:</p>
          <p className="secret">{factor.secret}</p>
          <ol start={2}>
            <li>
              Enter the <span className="nowrap">6-digit</span> code your app shows for Tallyn.
            </li>
          </ol>
          <CodeForm factorId={factor.id} button="Turn on 2FA" />
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

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Tallyn' })
  if (error) throw error
  const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`
  return { id: data.id, qr, secret: data.totp.secret }
}
