import { useEffect, useState } from 'react'
import AuthPage from './components/AuthPage.jsx'
import { configured, supabase } from './lib/supabase.js'
import SignIn from './screens/SignIn.jsx'
import IdleGuard from './components/IdleGuard.jsx'
import SetUp2FA from './screens/SetUp2FA.jsx'
import Verify2FA from './screens/Verify2FA.jsx'
import Home from './screens/Home.jsx'
import TallynLoader from './components/TallynLoader.jsx'
import ConsentGate from './components/ConsentGate.jsx'
import { usePath } from './lib/router.jsx'
import LegalPage from './screens/LegalPage.jsx'

// Sign-in flow (#7, ADR 0003): email + password, then 2FA with an
// authenticator app. Only a 2FA-completed (aal2) session reaches Home, and the
// Go API checks the same thing on every request.
export default function App() {
  const path = usePath()
  // The legal pages are public: no sign-in needed (#36).
  if (path === '/terms' || path === '/privacy') {
    return (
      <AuthPage wide>
        <LegalPage doc={path.slice(1)} />
      </AuthPage>
    )
  }
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

  // Signed out: start again from Home, so signing in always lands on Home and
  // not on the last page you were on (#72). The legal pages are public and
  // render before this, so they keep their address.
  useEffect(() => {
    if (session === null && window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [session])

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
  if (session && aal?.currentLevel === 'aal2') {
    return (
      <>
        {/* Sign out after 30 minutes without activity (#91). */}
        <IdleGuard onSignOut={signOut} />
        <ConsentGate onSignOut={signOut}>
          <Home email={session.user.email} onSignOut={signOut} />
        </ConsentGate>
      </>
    )
  }
  let screen
  if (session === undefined || (session && !aal)) screen = <TallynLoader />
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
        Sign-in isn&apos;t set up yet. Copy <code>web/.env.example</code> to <code>web/.env.local</code> and add your Supabase project URL and publishable key.
      </p>
    </section>
  )
}
