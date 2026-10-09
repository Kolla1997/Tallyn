import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { pendingInvite } from '../lib/invite.js'
import Banks from './Banks.jsx'
import CreateHousehold from './CreateHousehold.jsx'
import Join from './Join.jsx'
import Members from './Members.jsx'
import Sharing from './Sharing.jsx'
import Spending from './Spending.jsx'
import Transactions from './Transactions.jsx'

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

// Placeholder home: your household, its banks, spending, sharing and members.
// Real screens come later (#25).
export default function Home({ email, onSignOut }) {
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
      <Join
        token={invite}
        onJoined={(id) => {
          setInvite(null)
          choose(id)
          load()
        }}
        onDismiss={() => setInvite(null)}
      />
    )
  }

  const households = me?.households ?? []
  const household = households.find((h) => h.id === selected) ?? households[0]

  return (
    <section className="card">
      <h1>{household ? household.name : me ? 'Create your household' : "You're signed in"}</h1>
      <p className="muted">Signed in as {email}, with 2FA.</p>
      {households.length > 1 && (
        <label>
          Household
          <select value={household.id} onChange={(e) => choose(e.target.value)}>
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.role})
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          Couldn&apos;t load your details ({error}). Try again in a moment.
        </p>
      )}
      {me && !household && <CreateHousehold onCreated={load} />}
      {household && (
        <div key={household.id} className="home-sections">
          <Banks household={household} refreshKey={refreshKey} onChanged={refresh} />
          <Spending householdId={household.id} refreshKey={refreshKey} />
          <Transactions householdId={household.id} refreshKey={refreshKey} />
          <Sharing householdId={household.id} onChanged={refresh} key={`s${refreshKey}`} />
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
        </div>
      )}
      <button className="btn btn-secondary" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  )
}
