import { useEffect, useRef, useState } from 'react'
import { verifiedAuthenticators, verifyCode } from '../lib/mfa.js'
import { Pill, OWE } from './calm/ui.jsx'

const FIELD = 'h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-[14px]'

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
        // A code from any of your authenticators (#23).
        const ids = (await verifiedAuthenticators()).map((f) => f.id)
        if (!(await verifyCode(code, ids))) {
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
    <dialog
      ref={ref}
      className="calm m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-white p-5 text-zinc-900 shadow-2xl backdrop:bg-black/40"
      aria-labelledby="dialog-title"
      onCancel={(e) => (busy ? e.preventDefault() : onClose())}
    >
      <form onSubmit={submit} className="grid gap-3 text-[14px]">
        <h2 id="dialog-title" className="m-0 font-[family-name:var(--font-heading)] text-[18px] font-semibold">
          {title}
        </h2>
        <div className="grid gap-2 text-zinc-600 [&_p]:m-0">{children}</div>
        {typeToConfirm && (
          <label className="grid gap-1">
            <span>
              Type <strong>{typeToConfirm}</strong> to confirm
            </span>
            <input className={FIELD} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          </label>
        )}
        {needsCode && (
          <label className="grid gap-1">
            <span>6-digit code from your authenticator app</span>
            <input
              className={`${FIELD} max-w-40 tracking-[0.3em] tabular-nums`}
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
          <p className="m-0 font-semibold" style={OWE} role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Pill quiet onClick={onClose} disabled={busy}>
            Cancel
          </Pill>
          <Pill type="submit" disabled={!ready}>
            {busy ? 'Working…' : action}
          </Pill>
        </div>
      </form>
    </dialog>
  )
}
