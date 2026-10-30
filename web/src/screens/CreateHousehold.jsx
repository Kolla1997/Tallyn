import { useState } from 'react'
import { api } from '../lib/api.js'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'MXN', 'JPY']

// First step after sign-up: a household to link banks into (#8).
export default function CreateHousehold({ onCreated }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    // A name of only spaces passes `required` (#154).
    if (!name.trim()) return setError('Give your household a name.')
    setError('')
    setBusy(true)
    try {
      await api('/api/households', { method: 'POST', body: { name: name.trim(), home_currency: currency } })
      onCreated()
    } catch {
      setError("We couldn't create your household. Check the name and try again.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="muted">A household is where your family&apos;s money comes together. You can invite others later.</p>
      <label>
        Household name
        <input
          required
          maxLength={80}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'household-error' : undefined}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Rivera family"
        />
      </label>
      <label>
        Home currency
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" id="household-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create household'}
      </button>
    </form>
  )
}
