import { useState } from 'react'
import { LEGAL, rememberAgreement } from '../lib/legal.js'
import { Link } from '../lib/router.jsx'
import { supabase } from '../lib/supabase.js'

// Sign in or create an account with email and password. 2FA comes next.
export default function SignIn() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [agreed, setAgreed] = useState(false) // sign-up only (#36)

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
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
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
