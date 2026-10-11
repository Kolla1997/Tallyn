import { useCallback, useEffect, useState } from 'react'
import AuthPage from '../components/AuthPage.jsx'
import { api } from '../lib/api.js'
import { pendingInvite } from '../lib/invite.js'
import { Link, usePath } from '../lib/router.jsx'
import Banks from './Banks.jsx'
import CreateHousehold from './CreateHousehold.jsx'
import HomePage from './HomePage.jsx'
import Join from './Join.jsx'
import Members from './Members.jsx'
import Settings from './Settings.jsx'
import Sharing from './Sharing.jsx'
import Shell, { PageHead } from './Shell.jsx'

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
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0) // bumps when banks, sharing or members change
  const [selected, setSelected] = useState(savedHousehold)
  const [invite, setInvite] = useState(pendingInvite)

  const load = useCallback(() => {
    api('/api/me').then(setMe, (e) => setError(e.message))
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
          <h1>Something went wrong</h1>
          <p className="error" role="alert">
            We couldn&apos;t load your details ({error}). Try again in a moment.
          </p>
          <button className="btn btn-secondary" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      </AuthPage>
    )
  }
  if (!me) return <p className="muted center-note">Loading…</p>

  const households = me.households ?? []
  const household = households.find((h) => h.id === selected) ?? households[0]

  if (!household) {
    return (
      <AuthPage>
        <section className="card">
          <h1>Create your household</h1>
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
    case '/accounts':
      page = (
        <>
          <PageHead title="Accounts" sub="Your banks and the ones shared with you" />
          <section className="panel">
            <Banks household={household} refreshKey={refreshKey} onChanged={refresh} />
          </section>
        </>
      )
      break
    case '/family':
      page = (
        <>
          <PageHead title="Family" sub="Nobody sees your money until you share it" />
          <div className="cols">
            <div className="col">
              <section className="panel">
                <Sharing householdId={household.id} onChanged={refresh} key={`s${refreshKey}`} />
              </section>
            </div>
            <div className="col">
              <section className="panel">
                <Members
                  household={household}
                  onChanged={() => {
                    refresh()
                    load()
                  }}
                  onLeft={() => {
                    choose('')
                    load()
                  }}
                />
              </section>
            </div>
          </div>
        </>
      )
      break
    case '/goals':
      page = (
        <>
          <PageHead title="Goals" />
          <section className="panel empty-state">
            <h2>Savings goals are on the way</h2>
            <p className="muted">
              Soon you&apos;ll set goals like a family trip or a school fund, and follow a savings account so progress
              updates on its own.
            </p>
          </section>
        </>
      )
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
    <Shell me={me} household={household} households={households} onChooseHousehold={choose}>
      <div key={household.id}>{page}</div>
    </Shell>
  )
}

