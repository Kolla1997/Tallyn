import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { api } from '../lib/api.js'

// Link a bank (#8). Bank logins happen inside Plaid's own window; Tallyn
// never sees them. The list of banks is on the Accounts page.
export function LinkBank({ householdId, onLinked, onError, label = 'Link a bank', className = 'btn' }) {
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
    <button className={className} onClick={() => open()} disabled={!ready || busy}>
      {busy ? 'Linking…' : label}
    </button>
  )
}
