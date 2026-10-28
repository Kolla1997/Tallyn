import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { currentVersions, LEGAL, takeAgreement } from '../lib/legal.js'
import { Link } from '../lib/router.jsx'
import AuthPage from './AuthPage.jsx'
import TallynLoader from './TallynLoader.jsx'
import Heading from './Heading.jsx'

// Before the app, everyone must have agreed to the current Terms of Service
// and Privacy Policy (#36). If they ticked "I agree" at sign-up on this device,
// that's recorded now; otherwise they see "Before you start" (option A). A
// new version of either document asks everyone again.
export default function ConsentGate({ onSignOut, children }) {
  const [state, setState] = useState('checking') // checking | needed | ok | error
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const accept = () => api('/api/consent', { method: 'POST', body: currentVersions() })

  useEffect(() => {
    let live = true
    api('/api/consent').then(
      async (d) => {
        if (!d.needed) return live && setState('ok')
        const pending = takeAgreement()
        const now = currentVersions()
        if (pending?.terms === now.terms && pending?.privacy === now.privacy) {
          try {
            await accept()
            return live && setState('ok')
          } catch {
            // fall through to asking
          }
        }
        if (live) setState('needed')
      },
      () => live && setState('error'),
    )
    return () => {
      live = false
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await accept()
      setState('ok')
    } catch (err) {
      setError(
        err.message === 'version_changed'
          ? 'The documents were just updated. Reload the page to read the new versions.'
          : "We couldn't save that just now. Try again in a moment.",
      )
    }
    setBusy(false)
  }

  if (state === 'ok') return children
  return (
    <AuthPage>
      {state === 'checking' && <TallynLoader />}
      {state === 'error' && (
        <section className="card">
          <Heading>Something went wrong</Heading>
          <p className="muted">We couldn&apos;t check your agreement to our terms. Try again in a moment.</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Try again
          </button>
          <button className="link" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      )}
      {state === 'needed' && (
        <section className="card">
          <Heading>Before you start</Heading>
          <p>Please read and agree to how Tallyn works and how we look after your data.</p>
          <p>
            <Link to={LEGAL.terms.path} target="_blank" rel="noopener">
              Terms of Service
            </Link>
            {' · '}
            <Link to={LEGAL.privacy.path} target="_blank" rel="noopener">
              Privacy Policy
            </Link>{' '}
            <span className="small muted">(open in a new tab)</span>
          </p>
          <form onSubmit={submit}>
            <label className="agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I agree to the Terms of Service and Privacy Policy</span>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn" type="submit" disabled={!agreed || busy}>
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </form>
          <button className="link" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      )}
    </AuthPage>
  )
}
