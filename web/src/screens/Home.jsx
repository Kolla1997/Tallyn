import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// Placeholder home: proves the chain browser token → Go → AsUser → RLS by
// showing /api/me. Real screens come with later tickets.
export default function Home({ email, onSignOut }) {
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/me').then(setMe, (e) => setError(e.message))
  }, [])

  return (
    <section className="card">
      <h1>{me?.display_name ? `Hi, ${me.display_name}` : "You're signed in"}</h1>
      <p className="muted">Signed in as {email}, with 2FA.</p>
      {error && (
        <p className="error" role="alert">
          Couldn&apos;t load your details ({error}). Try again in a moment.
        </p>
      )}
      {me &&
        (me.households.length === 0 ? (
          <p>You&apos;re not in a household yet.</p>
        ) : (
          <ul className="households">
            {me.households.map((h) => (
              <li key={h.id}>
                <span>{h.name}</span>
                <span className="muted">
                  {h.role} · {h.home_currency}
                </span>
              </li>
            ))}
          </ul>
        ))}
      <button className="btn btn-secondary" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  )
}
