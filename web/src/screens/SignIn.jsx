import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Sign in or create an account with email and password. 2FA comes next.
export default function SignIn() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
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
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
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
        <button className="btn" type="submit" disabled={busy}>
          {signup ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <button
        className="link"
        onClick={() => {
          setError('')
          setMode(signup ? 'signin' : 'signup')
        }}
      >
        {signup ? 'Already have an account? Sign in' : 'New to Tallyn? Create an account'}
      </button>
    </section>
  )
}
