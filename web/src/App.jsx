import { useEffect, useState } from 'react'
import AuthPage from './components/AuthPage.jsx'
import { configured, supabase } from './lib/supabase.js'
import SignIn from './screens/SignIn.jsx'
import SetUp2FA from './screens/SetUp2FA.jsx'
import Verify2FA from './screens/Verify2FA.jsx'
import Home from './screens/Home.jsx'

// Sign-in flow (#7, ADR 0003): email + password, then 2FA with an
// authenticator app. Only a 2FA-completed (aal2) session reaches Home, and the
// Go API checks the same thing on every request.
export default function App() {
  return configured ? (
    <AuthFlow />
  ) : (
    <AuthPage>
      <NotConfigured />
    </AuthPage>
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

  // The signed-in app has its own layout (#39); everything before it uses
  // the centered sign-in layout.
  if (session && aal?.currentLevel === 'aal2') return <Home email={session.user.email} onSignOut={signOut} />
  let screen
  if (session === undefined || (session && !aal)) screen = <p className="muted">Loading…</p>
  else if (!session) screen = <SignIn />
  else if (aal.nextLevel === 'aal2') screen = <Verify2FA onSignOut={signOut} />
  else screen = <SetUp2FA onSignOut={signOut} />
  return <AuthPage>{screen}</AuthPage>
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
