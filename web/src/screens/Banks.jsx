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
          e.message === 'already_linked' ? 'That bank is already linked.' : "We couldn't finish linking that bank. Nothing was saved, so you can try again.",
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

// Reconnect a bank (#51): opens Plaid Link in update mode for a bank that
// needs sign-in, or that hasn't shared card details yet (#27). The token is
// fetched on click, so pages with several banks don't ask Plaid up front.
// Afterwards the bank syncs straight away; onDone refreshes the page, again a
// few seconds later once the sync has had time to finish.
export function ReconnectBank({ bankId, label, className = 'btn btn-small', onDone, onError }) {
  const [token, setToken] = useState(null)
  const [busy, setBusy] = useState(false)

  const onSuccess = useCallback(async () => {
    try {
      await api(`/api/banks/${encodeURIComponent(bankId)}/reconnected`, { method: 'POST' })
      onDone?.()
      setTimeout(() => onDone?.(), 5000)
    } catch {
      onError?.("We couldn't finish reconnecting that bank. Try again in a moment.")
    }
    setToken(null)
    setBusy(false)
  }, [bankId, onDone, onError])

  const onExit = useCallback(() => {
    setToken(null)
    setBusy(false)
  }, [])

  const { open, ready } = usePlaidLink({ token, onSuccess, onExit })

  // Open Plaid as soon as the token is ready.
  useEffect(() => {
    if (token && ready) open()
  }, [token, ready, open])

  async function start() {
    setBusy(true)
    onError?.('')
    try {
      const d = await api(`/api/banks/${encodeURIComponent(bankId)}/reconnect-token`, { method: 'POST' })
      setToken(d.link_token)
    } catch {
      setBusy(false)
      onError?.("Reconnecting isn't available right now. Try again in a moment.")
    }
  }

  return (
    <button type="button" className={className} onClick={start} disabled={busy}>
      {busy ? 'Opening…' : label}
    </button>
  )
}
