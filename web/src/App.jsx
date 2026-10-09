import { useEffect, useState } from 'react'
import logo from '../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
import { configured, supabase } from './lib/supabase.js'
import SignIn from './screens/SignIn.jsx'
import SetUp2FA from './screens/SetUp2FA.jsx'
import Verify2FA from './screens/Verify2FA.jsx'
import Home from './screens/Home.jsx'

// Sign-in flow (#7, ADR 0003): email + password, then 2FA with an
// authenticator app. Only a 2FA-completed (aal2) session reaches Home, and the
// Go API checks the same thing on every request.
export default function App() {
  return (
    <main className="page">
      <img className="logo" src={logo} alt="Tallyn" />
      {configured ? <AuthFlow /> : <NotConfigured />}
    </main>
  )
}

function AuthFlow() {
  const [session, setSession] = useState(undefined) // undefined while loading
  const [aal, setAal] = useState(null)

  useEffect(() => {
    // Fires INITIAL_SESSION straight away, then on every sign-in, verified code and refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Re-check the 2FA level whenever the session changes. Keep the last result
  // meanwhile, so a token refresh doesn't unmount the current screen.
  useEffect(() => {
    if (!session) {
      setAal(null)
      return
    }
    let current = true
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (current) setAal(data)
    })
    return () => {
      current = false
    }
  }, [session])

  const signOut = () => supabase.auth.signOut()

  if (session === undefined || (session && !aal)) {
    return <p className="muted">Loading…</p>
  }
  if (!session) return <SignIn />
  if (aal.currentLevel === 'aal2') return <Home email={session.user.email} onSignOut={signOut} />
  if (aal.nextLevel === 'aal2') return <Verify2FA onSignOut={signOut} />
  return <SetUp2FA onSignOut={signOut} />
}

function NotConfigured() {
  return (
    <section className="card">
      <h1>Almost there</h1>
      <p className="muted">
        Sign-in isn&apos;t set up yet. Copy <code>web/.env.example</code> to <code>web/.env.local</code>{' '}
        and add your Supabase project URL and publishable key.
      </p>
    </section>
  )
}
