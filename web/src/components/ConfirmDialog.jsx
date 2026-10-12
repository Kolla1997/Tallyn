import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// A deliberate confirmation for actions that are hard to undo (#38): the
// person types a name to confirm and, for the most serious ones, enters a
// fresh 6-digit code from their authenticator app. The server checks the code
// was entered in the last few minutes (internal/api/members.go), so this
// dialog is the friendly half of a server-side rule.
//
// onConfirm does the action and throws an Error whose message is shown.
export default function ConfirmDialog({ title, children, action, typeToConfirm, needsCode = false, onConfirm, onClose }) {
  const ref = useRef(null)
  const [typed, setTyped] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d.open) d.showModal()
    return () => d.open && d.close()
  }, [])

  const nameOk = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.trim().toLowerCase()
  const ready = nameOk && (!needsCode || code.length === 6) && !busy

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setError('')
    setBusy(true)
    try {
      if (needsCode) {
        const { data } = await supabase.auth.mfa.listFactors()
        const factor = data?.totp?.find((f) => f.status === 'verified')
        const { error: codeError } = factor ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code }) : { error: true }
        if (codeError) {
          setCode('')
          throw new Error("That code didn't work. Check the code in your app and try again.")
        }
      }
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <form onSubmit={submit}>
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        {typeToConfirm && (
          <label>
            Type <strong>{typeToConfirm}</strong> to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          </label>
        )}
        {needsCode && (
          <label>
            6-digit code from your authenticator app
            <input
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!ready}>
            {busy ? 'Working…' : action}
          </button>
        </div>
      </form>
    </dialog>
  )
}
