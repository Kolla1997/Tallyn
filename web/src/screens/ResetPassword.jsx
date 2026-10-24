import { useEffect, useState } from 'react'
import { MIN_PASSWORD, rememberPasswordChanged, rememberResetAsked } from '../lib/recovery.js'
import { supabase } from '../lib/supabase.js'
import { authMessage } from '../lib/authErrors.js'
import Heading from '../components/Heading.jsx'

// Password reset (#22, Dinesh picked A): ask for a link, then (after the link
// and the 2FA code) choose a new password.

const WAIT = 60 // seconds between links (Supabase allows one a minute)

// "Reset your password", then "Check your email". `expired`: the link that
// brought you here had expired or was already used.
export function ResetRequest({ initialEmail = '', expired = false, onBack }) {
  const [email, setEmail] = useState(initialEmail)
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (!wait) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function send(e) {
    e?.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setBusy(false)
    // Same answer whether or not the account exists, so nobody can use this
    // form to find out who has a Tallyn account. Only waiting is reported.
    if (error && (error.status === 429 || error.code === 'over_email_send_rate_limit')) {
      setError('Please wait a minute before asking for another link.')
      return
    }
    rememberResetAsked(email)
    setSentTo(email)
    setWait(WAIT)
  }

  if (sentTo) {
    return (
      <section className="card">
        <span className="reset-icon">
          <MailIcon />
        </span>
        <Heading>Check your email</Heading>
        <p className="muted">
          If there&apos;s a Tallyn account for <strong className="text-strong">{sentTo}</strong>, we&apos;ve sent it a link to reset your password. The link
          works for 1 hour.
        </p>
        <p className="info-note" role="status">
          <MailIcon />
          <span>Nothing there? Check your spam folder. You can ask for a new link in a minute.</span>
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-secondary" type="button" onClick={() => send()} disabled={busy || wait > 0}>
          {wait > 0 ? `Send another link in ${wait}s` : 'Send another link'}
        </button>
        <div className="card-links">
          <button className="link-quiet" onClick={onBack}>
            ← Back to sign in
          </button>
          <button className="link-quiet" onClick={() => setSentTo('')}>
            Use a different email
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <Heading>{expired ? 'This link has expired' : 'Reset your password'}</Heading>
      <p className="muted">
        {expired
          ? 'Reset links work once, for 1 hour. Ask for a new one and use the newest email.'
          : "Enter the email you use for Tallyn and we'll send you a link to choose a new password."}
      </p>
      <form onSubmit={send}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy}>
          {expired ? 'Send a new link' : 'Send reset link'}
        </button>
      </form>
      <div className="card-links">
        <button className="link-quiet" onClick={onBack}>
          ← Back to sign in
        </button>
      </div>
    </section>
  )
}

// After the link and the 2FA code: one field with Show, and a live check.
// Saving signs you out on your other devices, then opens Home with a note.
export function ChoosePassword({ email, onDone }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const long = password.length >= MIN_PASSWORD

  async function save(e) {
    e.preventDefault()
    if (!long) return
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setBusy(false)
      if (error.code === 'same_password') setError("That's your current password. Choose a new one.")
      else if (error.code === 'weak_password') setError('Choose a longer or less common password.')
      else setError(authMessage(error))
      return
    }
    // Whoever might have the old password is signed out everywhere else.
    await supabase.auth.signOut({ scope: 'others' })
    rememberPasswordChanged()
    onDone()
  }

  return (
    <section className="card">
      <Heading>Choose a new password</Heading>
      {email && <p className="muted">For {email}.</p>}
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <span className="password-field">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              aria-describedby="password-rule"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="password-show" aria-pressed={show} onClick={() => setShow(!show)}>
              {show ? 'Hide' : 'Show'}
            </button>
          </span>
        </div>
        <PasswordRule ok={long} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || !long}>
          Save and sign in
        </button>
        <p className="muted small">You&apos;ll be signed out on your other devices.</p>
      </form>
    </section>
  )
}

// "At least 8 characters", ticked once it's met (also on sign-up).
export function PasswordRule({ ok }) {
  return (
    <p id="password-rule" className={`password-rule${ok ? ' password-rule-ok' : ''}`}>
      <span aria-hidden="true">{ok ? '✓' : '·'}</span> At least {MIN_PASSWORD} characters
    </p>
  )
}

function MailIcon() {
  return (
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
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}
