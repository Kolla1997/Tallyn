import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import AuthPage from '../components/AuthPage.jsx'
import { pendingInvite } from '../lib/invite.js'
import { takePasswordChanged } from '../lib/recovery.js'
import { Link, usePath } from '../lib/router.jsx'
import CreateHousehold from './CreateHousehold.jsx'
import HomePage from './HomePage.jsx'
import Join from './Join.jsx'
import Shell, { PageHead } from './Shell.jsx'
import TallynLoader from '../components/TallynLoader.jsx'
import Heading from '../components/Heading.jsx'
import { loadMe } from '../lib/me.js'

// Faster first load (#99): Home comes with the app; the other pages load the
// first time they're opened, with the Tallyn loader meanwhile.
const AccountsPage = lazy(() => import('./AccountsPage.jsx'))
const BudgetsPage = lazy(() => import('./BudgetsPage.jsx'))
const DebtsPage = lazy(() => import('./DebtsPage.jsx'))
const TransactionsPage = lazy(() => import('./TransactionsPage.jsx'))
const FamilyPage = lazy(() => import('./FamilyPage.jsx'))
const Settings = lazy(() => import('./Settings.jsx'))
const GoalsPage = lazy(() => import('./GoalsPage.jsx'))

const HOUSEHOLD_KEY = 'tallyn.household'

function savedHousehold() {
  try {
    return localStorage.getItem(HOUSEHOLD_KEY)
  } catch {
    return null
  }
}

function saveHousehold(id) {
  try {
    localStorage.setItem(HOUSEHOLD_KEY, id)
  } catch {
    // only a convenience
  }
}

// The signed-in app (#39): loads who you are and your households, then shows
// the page for the current URL inside the app layout.
// Step 1 moves the existing sections onto their pages; later steps restyle
// each page to match the drafts in docs/03 Design/Comps/.
export default function Home({ email, onSignOut }) {
  const path = usePath()
  const [me, setMe] = useState(null)
  // Just reset the password (#22): say so on the first page, once.
  const [passwordChanged] = useState(takePasswordChanged)
  const [firstPath] = useState(() => window.location.pathname)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0) // bumps when banks, sharing or members change
  const [selected, setSelected] = useState(savedHousehold)
  const [invite, setInvite] = useState(pendingInvite)

  const load = useCallback(() => {
    loadMe().then(setMe, (e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const refresh = () => setRefreshKey((k) => k + 1)
  const choose = (id) => {
    setSelected(id)
    saveHousehold(id)
  }

  if (invite) {
    return (
      <AuthPage>
        <Join
          token={invite}
          onJoined={(id) => {
            setInvite(null)
            choose(id)
            load()
          }}
          onDismiss={() => setInvite(null)}
        />
      </AuthPage>
    )
  }

  if (error && !me) {
    return (
      <AuthPage>
        <section className="card">
          <Heading>Something went wrong</Heading>
          <p className="error" role="alert">
            We couldn&apos;t load your details. Try again in a moment.
          </p>
          <button className="btn btn-secondary" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      </AuthPage>
    )
  }
  if (!me) return <TallynLoader />

  const households = me.households ?? []
  const household = households.find((h) => h.id === selected) ?? households[0]

  if (!household) {
    return (
      <AuthPage>
        <section className="card">
          <Heading>Create your household</Heading>
          <p className="muted">Signed in as {email}, with 2FA.</p>
          <CreateHousehold onCreated={load} />
          <button className="btn btn-secondary" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      </AuthPage>
    )
  }

  let page
  switch (path) {
    case '/':
      page = <HomePage me={me} household={household} refreshKey={refreshKey} onChanged={refresh} />
      break
    case '/transactions':
      page = <TransactionsPage me={me} household={household} refreshKey={refreshKey} />
      break
    case '/accounts':
      page = <AccountsPage me={me} household={household} refreshKey={refreshKey} onChanged={refresh} />
      break
    case '/budgets':
      page = <BudgetsPage me={me} household={household} refreshKey={refreshKey} />
      break
    case '/debts':
      page = <DebtsPage me={me} household={household} refreshKey={refreshKey} onChanged={refresh} />
      break
    case '/family':
      page = (
        <FamilyPage
          me={me}
          household={household}
          refreshKey={refreshKey}
          onChanged={refresh}
          onLeft={() => {
            choose('')
            load()
          }}
        />
      )
      break
    case '/goals':
      page = <GoalsPage me={me} household={household} refreshKey={refreshKey} />
      break
    case '/settings':
      page = <Settings me={me} household={household} email={email} onSaved={load} onSignOut={onSignOut} />
      break
    default:
      page = (
        <>
          <PageHead title="Page not found" />
          <section className="panel empty-state">
            <p className="muted">There&apos;s nothing at this address.</p>
            <Link to="/" className="link">
              Go to Home
            </Link>
          </section>
        </>
      )
  }

  return (
    <Shell me={me} household={household} households={households} onChooseHousehold={choose} onSignOut={onSignOut}>
      <div key={household.id}>
        {passwordChanged && path === firstPath && (
          <p className="info-note password-changed" role="status">
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
            <span>
              <strong>Your password is changed.</strong> You&apos;ve been signed out on your other devices.
            </span>
          </p>
        )}
        <Suspense fallback={<TallynLoader />}>{page}</Suspense>
      </div>
    </Shell>
  )
}
