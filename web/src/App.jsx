import { Suspense, lazy, useEffect, useState } from 'react'
import AuthPage from './components/AuthPage.jsx'
import { configured, supabase } from './lib/supabase.js'
import SignIn from './screens/SignIn.jsx'
import IdleGuard from './components/IdleGuard.jsx'
import SessionLimit from './components/SessionLimit.jsx'
import { signOutEverywhere, signOutHere } from './lib/session.js'
import { endRecovery, recoveryState, startRecovery } from './lib/recovery.js'
import { ChoosePassword } from './screens/ResetPassword.jsx'
import { BackupCodesGate } from './screens/BackupCodes.jsx'
import Verify2FA from './screens/Verify2FA.jsx'
import Home from './screens/Home.jsx'
import TallynLoader from './components/TallynLoader.jsx'
import ConsentGate from './components/ConsentGate.jsx'
import { usePath } from './lib/router.jsx'

// Loaded only when needed (#99): the legal pages and first-time 2FA setup.
const LegalPage = lazy(() => import('./screens/LegalPage.jsx'))
const SetUp2FA = lazy(() => import('./screens/SetUp2FA.jsx'))

// Sign-in flow (#7, ADR 0003): email + password, then 2FA with an
// authenticator app. Only a 2FA-completed (aal2) session reaches Home, and the
// Go API checks the same thing on every request.
export default function App() {
  const path = usePath()
  // The legal pages are public: no sign-in needed (#36).
  if (path === '/terms' || path === '/privacy') {
    return (
      <AuthPage wide>
        <Suspense fallback={<TallynLoader />}>
          <LegalPage doc={path.slice(1)} />
        </Suspense>
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

// The Sign out button ends the session everywhere; automatic sign-outs
// (#91, #92) end only this device's (lib/session.js, tested in #116).
const signOut = signOutEverywhere

function AuthFlow() {
  const [session, setSession] = useState(undefined) // undefined while loading
  const [aal, setAal] = useState(null)
  const [recovery, setRecovery] = useState(recoveryState) // password reset (#22)

  useEffect(() => {
    // Fires INITIAL_SESSION straight away, then on every sign-in, verified code and refresh.
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        startRecovery()
        setRecovery('pending')
      }
      // A reset needs the link's own sign-in; without one, it's over (#22).
      if (!s && recoveryState() === 'pending') {
        endRecovery()
        setRecovery('')
      }
      setSession(s)
    })
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

  // The signed-in app has its own layout (#39); everything before it uses
  // the centered sign-in layout.
  const finishReset = () => {
    endRecovery()
    setRecovery('')
  }

  // Password reset (#22): with the 2FA code done, choose the new password.
  if (session && aal?.currentLevel === 'aal2' && recovery === 'pending') {
    return (
      <AuthPage>
        <ChoosePassword email={session.user.email} onDone={finishReset} />
      </AuthPage>
    )
  }
  if (session && aal?.currentLevel === 'aal2') {
    return (
      <>
        {/* Sign out after 30 minutes without activity (#91), or 12 hours after signing in (#92). */}
        <IdleGuard onSignOut={signOutHere} />
        <SessionLimit accessToken={session.access_token} onSignOut={signOutHere} />
        <ConsentGate onSignOut={signOut}>
          {/* Backup codes after setting up 2FA, or once for existing accounts (#23). */}
          <BackupCodesGate accessToken={session.access_token} email={session.user.email} page={AuthPage}>
            <Home email={session.user.email} onSignOut={signOut} />
          </BackupCodesGate>
        </ConsentGate>
      </>
    )
  }
  let screen
  if (session === undefined || (session && !aal)) screen = <TallynLoader />
  else if (!session) screen = <SignIn expired={recovery === 'expired'} onExpiredSeen={finishReset} />
  else if (aal.nextLevel === 'aal2')
    screen = (
      <Verify2FA
        onSignOut={signOut}
        recovering={recovery === 'pending'}
        onCancelReset={() => {
          finishReset()
          signOutHere()
        }}
      />
    )
  else screen = <SetUp2FA onSignOut={signOut} />
  // The 2FA screens sit in the middle of the page (#108, Dinesh picked A).
  return (
    <AuthPage centred={Boolean(session && aal)}>
      <Suspense fallback={<TallynLoader />}>{screen}</Suspense>
    </AuthPage>
  )
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
