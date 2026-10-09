import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Banks from './Banks.jsx'
import CreateHousehold from './CreateHousehold.jsx'
import Sharing from './Sharing.jsx'
import Spending from './Spending.jsx'
import Transactions from './Transactions.jsx'

// Placeholder home: your household and its banks. Real screens come later (#25).
export default function Home({ email, onSignOut }) {
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0) // bumps when banks change

  const load = useCallback(() => {
    api('/api/me').then(setMe, (e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  // One household for now; choosing between several comes with #12.
  const household = me?.households[0]

  return (
    <section className="card">
      <h1>{household ? household.name : me ? 'Create your household' : "You're signed in"}</h1>
      <p className="muted">Signed in as {email}, with 2FA.</p>
      {error && (
        <p className="error" role="alert">
          Couldn&apos;t load your details ({error}). Try again in a moment.
        </p>
      )}
      {me && !household && <CreateHousehold onCreated={load} />}
      {household && (
        <>
          <Banks household={household} refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
          <Spending householdId={household.id} refreshKey={refreshKey} />
          <Transactions householdId={household.id} refreshKey={refreshKey} />
          <Sharing householdId={household.id} onChanged={() => setRefreshKey((k) => k + 1)} />
        </>
      )}
      <button className="btn btn-secondary" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  )
}
