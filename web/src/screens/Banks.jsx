import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { api } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'

// Linked banks and accounts for one household, plus Link and Unlink (#8).
// Bank logins happen inside Plaid's own window; Tallyn never sees them.
export default function Banks({ household, onChanged, refreshKey }) {
  const [banks, setBanks] = useState(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(null) // bank id awaiting "Unlink?"
  const [unlinking, setUnlinking] = useState(false)
  const canLink = household.role === 'owner' || household.role === 'adult'

  const load = useCallback(() => {
    api(`/api/banks?household_id=${encodeURIComponent(household.id)}`).then(
      (d) => setBanks(d.banks),
      () => setError("We couldn't load your banks. Try again in a moment."),
    )
  }, [household.id])

  useEffect(load, [load, refreshKey])

  // Confirmation is shown in the page, not with window.confirm, which some
  // embedded browsers block (it then silently answers "no").
  async function unlink(bank) {
    const name = bank.institution_name || 'this bank'
    setError('')
    setUnlinking(true)
    try {
      await api(`/api/banks/${bank.id}`, { method: 'DELETE' })
      setConfirming(null)
      load()
      onChanged?.()
    } catch {
      setError(`We couldn't unlink ${name} just now. It's still connected, so try again in a moment.`)
    }
    setUnlinking(false)
  }

  return (
    <>
      <h2>Banks and cards</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {banks && banks.length === 0 && <p className="muted">No banks linked yet.</p>}
      {banks?.map((b) => (
        <div className="bank" key={b.id}>
          <div className="bank-head">
            <strong>{b.institution_name || 'Bank'}</strong>
            {b.can_unlink && confirming !== b.id && (
              <button className="link" onClick={() => setConfirming(b.id)}>
                Unlink
              </button>
            )}
          </div>
          {confirming === b.id && (
            <div className="confirm" role="group" aria-label={`Unlink ${b.institution_name || 'this bank'}?`}>
              <p>
                Unlink {b.institution_name || 'this bank'}? Tallyn will disconnect it and remove its accounts and
                transactions.
              </p>
              <div className="confirm-actions">
                <button className="btn" onClick={() => unlink(b)} disabled={unlinking}>
                  {unlinking ? 'Unlinking…' : 'Unlink'}
                </button>
                <button className="btn btn-secondary" onClick={() => setConfirming(null)} disabled={unlinking}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {b.status === 'needs_reauth' && (
            <p className="error">Reconnect needed: this bank asked you to sign in again, so it isn&apos;t updating.</p>
          )}
          {b.status === 'disconnected' && <p className="error">This bank was disconnected and isn&apos;t updating.</p>}
          {b.status === 'active' && (
            <p className="muted small">
              {b.last_synced_at
                ? `Updated ${new Date(b.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : 'Getting your transactions…'}
            </p>
          )}
          <ul className="accounts">
            {b.accounts.map((a) => (
              <li key={a.id}>
                <span>
                  {a.name}
                  {a.mask && <span className="muted"> ••{a.mask}</span>}
                </span>
                <span className="amount">{formatMoney(a.current_balance_minor, a.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {canLink ? (
        <LinkBank
          householdId={household.id}
          onLinked={() => {
            load()
            onChanged?.()
          }}
          onError={setError}
        />
      ) : (
        <p className="muted">Owners and adults in your household can link banks.</p>
      )}
    </>
  )
}

function LinkBank({ householdId, onLinked, onError }) {
  const [token, setToken] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/api/plaid/link-token', { method: 'POST', body: { household_id: householdId } }).then(
      (d) => setToken(d.link_token),
      () => onError("Bank linking isn't available right now."),
    )
  }, [householdId, onError])

  const onSuccess = useCallback(
    async (publicToken) => {
      setBusy(true)
      onError('')
      try {
        await api('/api/plaid/exchange', {
          method: 'POST',
          body: { household_id: householdId, public_token: publicToken },
        })
        onLinked()
      } catch (e) {
        onError(
          e.message === 'already_linked'
            ? 'That bank is already linked.'
            : "We couldn't finish linking that bank. Nothing was saved, so you can try again.",
        )
      }
      setBusy(false)
    },
    [householdId, onLinked, onError],
  )

  const { open, ready } = usePlaidLink({ token, onSuccess })

  return (
    <button className="btn" onClick={() => open()} disabled={!ready || busy}>
      {busy ? 'Linking…' : 'Link a bank'}
    </button>
  )
}
