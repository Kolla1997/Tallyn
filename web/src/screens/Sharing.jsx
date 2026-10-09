import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// Sharing settings (#28). Each person chooses what each other member sees of
// their money. The database enforces it; this screen only shows and sets it.
const CATEGORIES = [
  ['balances', 'Balances'],
  ['transactions', 'Transactions'],
  ['whereabouts', 'Time and location'],
]
const LABEL = Object.fromEntries(CATEGORIES)
const isKid = (role) => role === 'teen' || role === 'child'

export default function Sharing({ householdId, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')

  const load = useCallback(() => {
    api(`/api/sharing?household_id=${encodeURIComponent(householdId)}`).then(
      (d) => {
        setData(d)
        setName(d.members.find((m) => m.is_you)?.display_name ?? '')
      },
      () => setError("We couldn't load your sharing settings."),
    )
  }, [householdId])

  useEffect(load, [load])

  if (error && !data) return <p className="error">{error}</p>
  if (!data) return null

  const me = data.members.find((m) => m.is_you)
  const nameOf = (m) => m.display_name || `Your ${m.role}`
  // Who sharing makes a difference for: never yourself or teens and children
  // (they see only their own). Teens and children only share with viewers,
  // since parents already see their money.
  const others = data.members.filter(
    (m) => !m.is_you && !isKid(m.role) && (!isKid(me.role) || m.role === 'viewer'),
  )

  async function toggle(viewer, category, on) {
    let next = new Set(data.given[viewer.user_id] ?? [])
    if (on) next.add(category)
    else next.delete(category)
    if (!next.has('transactions')) next.delete('whereabouts') // time and location only with transactions
    next = [...next]
    const before = data
    setError('')
    setData({ ...data, given: { ...data.given, [viewer.user_id]: next } })
    try {
      await api('/api/sharing', {
        method: 'PUT',
        body: { household_id: householdId, viewer_user_id: viewer.user_id, categories: next },
      })
      onChanged?.()
    } catch {
      setData(before)
      setError(`We couldn't change what you share with ${nameOf(viewer)}. Try again.`)
    }
  }

  async function saveName(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/me', { method: 'PUT', body: { display_name: name } })
      load()
    } catch {
      setError("We couldn't save your name.")
    }
  }

  const received = isKid(me.role) ? [] : data.members.filter((m) => data.received[m.user_id]?.length)

  return (
    <>
      <h2>Sharing</h2>
      <form className="name-form" onSubmit={saveName}>
        <label>
          Your name, as your family sees it
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
        </label>
        <button className="btn btn-secondary" type="submit">
          Save
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <p className="muted small">
        Nobody sees your money until you share it. You can change this at any time, and it takes effect straight away.
        {!isKid(me.role) && ' Parents always see their teens’ and children’s money.'}
      </p>

      {others.length === 0 && <p className="muted">There&apos;s nobody to share with yet. Invites are coming soon.</p>}
      {others.map((m) => {
        const given = data.given[m.user_id] ?? []
        return (
          <fieldset className="share" key={m.user_id}>
            <legend>
              {nameOf(m)} <span className="muted small">· {m.role}</span>
            </legend>
            {CATEGORIES.map(([c, label]) => {
              const needsTx = c === 'whereabouts' && !given.includes('transactions')
              return (
                <label key={c} className={needsTx ? 'muted' : ''}>
                  <input
                    type="checkbox"
                    checked={given.includes(c)}
                    disabled={needsTx}
                    onChange={(e) => toggle(m, c, e.target.checked)}
                  />
                  {label}
                </label>
              )
            })}
          </fieldset>
        )
      })}

      {received.length > 0 && (
        <>
          <h3 className="small-heading">Shared with you</h3>
          <ul className="shared-with-you">
            {received.map((m) => (
              <li key={m.user_id}>
                <strong>{nameOf(m)}</strong>{' '}
                <span className="muted">shares {data.received[m.user_id].map((c) => LABEL[c].toLowerCase()).join(', ')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
