import { useState } from 'react'
import { clearActive } from '../lib/idle.js'
import { NOTES, takeSignOutNote } from '../lib/session.js'
import { MIN_PASSWORD, resetAskedEmail } from '../lib/recovery.js'
import { PasswordRule, ResetRequest } from './ResetPassword.jsx'
import { LEGAL, rememberAgreement } from '../lib/legal.js'
import { Link } from '../lib/router.jsx'
import { supabase } from '../lib/supabase.js'

// Sign in or create an account with email and password. 2FA comes next.
// `expired`: a password reset link had expired or was used (#22).
export default function SignIn({ expired = false, onExpiredSeen }) {
  const [mode, setMode] = useState(expired ? 'reset' : 'signin') // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [agreed, setAgreed] = useState(false) // sign-up only (#36)
  // Signed out automatically, after 30 minutes idle (#91, Dinesh picked note 1)
  // or 12 hours (#92): say why, once. Being here also ends the old activity
  // clock, so the next sign-in starts fresh.
  const [note] = useState(() => {
    const shown = takeSignOutNote()
    clearActive()
    return shown
  })

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && !agreed) return
    setBusy(true)
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // With email confirmation on, sign-up returns no session until the link is opened.
    // Recorded with the versions at the first sign-in (components/ConsentGate.jsx).
    if (mode === 'signup') rememberAgreement()
    if (mode === 'signup' && !data.session) {
      setSentTo(email)
    }
  }

  // Forgot password (#22, Dinesh picked A).
  if (mode === 'reset') {
    return (
      <ResetRequest
        initialEmail={email || (expired ? (resetAskedEmail() ?? '') : '')}
        expired={expired}
        onBack={() => {
          onExpiredSeen?.()
          setMode('signin')
        }}
      />
    )
  }

  if (sentTo) {
    return (
      <section className="card">
        <h1>Check your email</h1>
        <p>
          We sent a link to <strong>{sentTo}</strong>. Open it to confirm your account, then sign in.
        </p>
        <button
          className="link"
          onClick={() => {
            setSentTo('')
            setMode('signin')
          }}
        >
          Back to sign in
        </button>
      </section>
    )
  }

  const signup = mode === 'signup'
  return (
    <section className="card">
      <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
      {note && !signup && (
        <p className="info-note" role="status">
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
          <span>{NOTES[note]}</span>
        </p>
      )}
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {/* "Forgot password?" sits on the label's line (#22) but outside the
            <label>, which would otherwise name the button, not the field. */}
        <div className="field">
          <span className="label-row">
            <label htmlFor="sign-in-password">Password</label>
            {!signup && (
              <button type="button" className="link label-link" onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            )}
          </span>
          <input
            id="sign-in-password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={signup ? MIN_PASSWORD : undefined}
            aria-describedby={signup ? 'password-rule' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {signup && <PasswordRule ok={password.length >= MIN_PASSWORD} />}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {signup && (
          <label className="agree">
            <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I agree to the{' '}
              <Link to={LEGAL.terms.path} target="_blank" rel="noopener">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to={LEGAL.privacy.path} target="_blank" rel="noopener">
                Privacy Policy
              </Link>
              . Tallyn is for people 18 and over.
            </span>
          </label>
        )}
        <button className="btn" type="submit" disabled={busy || (signup && !agreed)}>
          {signup ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {/* Switch between signing in and signing up (#25, Dinesh picked C). */}
      <p className="or-divider" aria-hidden="true">
        or
      </p>
      <button
        className="switch-link"
        onClick={() => {
          setError('')
          setMode(signup ? 'signin' : 'signup')
        }}
      >
        {signup ? 'Sign in to your account' : 'Create a new account'} <span aria-hidden="true">→</span>
      </button>
    </section>
  )
}
