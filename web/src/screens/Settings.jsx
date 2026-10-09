import { useState } from 'react'
import { api } from '../lib/api.js'
import { PageHead } from './Shell.jsx'

// Settings (#39, step 1): your name, your household, sign out. Security,
// data and notifications follow the draft in later steps.
export default function Settings({ me, household, email, onSaved, onSignOut }) {
  const [name, setName] = useState(me?.display_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaved(false)
    try {
      await api('/api/me', { method: 'PUT', body: { display_name: name } })
      setSaved(true)
      onSaved()
    } catch {
      setError("We couldn't save your name.")
    }
  }

  return (
    <>
      <PageHead title="Settings" sub="Your profile and household" />
      <div className="cols">
        <div className="col">
          <section className="panel" aria-labelledby="profile">
            <h2 id="profile">Your profile</h2>
            <form onSubmit={save}>
              <label>
                Your name, as your family sees it
                <input
                  value={name}
                  maxLength={80}
                  placeholder="Alex"
                  onChange={(e) => {
                    setName(e.target.value)
                    setSaved(false)
                  }}
                />
              </label>
              {saved && (
                <p className="saved small" role="status">
                  Saved. Your family now sees you as {name.trim() || 'your role'}.
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-secondary" type="submit">
                Save
              </button>
            </form>
            <dl className="kv">
              <dt>Email</dt>
              <dd className="muted">{email}</dd>
              <dt>Two-step sign-in</dt>
              <dd className="status-on">On</dd>
            </dl>
          </section>
        </div>
        <div className="col">
          {household && (
            <section className="panel" aria-labelledby="hh">
              <h2 id="hh">Household</h2>
              <dl className="kv">
                <dt>Name</dt>
                <dd>{household.name}</dd>
                <dt>Home currency</dt>
                <dd>{household.home_currency}</dd>
                <dt>Your role</dt>
                <dd>{household.role}</dd>
              </dl>
            </section>
          )}
          <button className="btn btn-secondary" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
