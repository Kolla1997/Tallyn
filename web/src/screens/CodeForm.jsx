import { useEffect, useId, useRef, useState } from 'react'
import { verifyCode } from '../lib/mfa.js'

// Asks for the 6-digit code from the authenticator app and verifies it
// against `factorIds` (any of your authenticators, #23). A correct code
// upgrades the session to aal2, which the app picks up from
// onAuthStateChange; onVerified runs after it (adding an authenticator).
//
// Six boxes, 3 + 3 (#108, Dinesh picked A): focus moves along as you type,
// Backspace steps back, and pasting or phone autofill fills all six. The
// code is checked as soon as the 6th digit is in; the button stays as a
// fallback and waits (sand) until then.
const EMPTY = ['', '', '', '', '', '']

export default function CodeForm({ factorIds, button, onVerified, autoFocus = true }) {
  const [digits, setDigits] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const boxes = useRef([])
  const labelId = useId()
  const code = digits.join('')

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus()
  }, [autoFocus])

  async function verify(value) {
    if (busy) return
    setError('')
    setBusy(true)
    let ok
    try {
      ok = await verifyCode(value, factorIds)
    } catch {
      // Couldn't reach Supabase (#151): keep the digits so they can send them again.
      setBusy(false)
      setError("We couldn't check the code. Try again.")
      return
    }
    setBusy(false)
    if (ok) onVerified?.()
    else {
      setError("That code didn't work. Check the code in your app and try again.")
      setDigits(EMPTY)
      boxes.current[0]?.focus()
    }
  }

  // Put digits in from box `from` onward (typing, paste or autofill), then
  // move focus on, and check the code once all six are in.
  function fill(from, text) {
    if (busy) return
    const typed = text.replace(/\D/g, '')
    if (!typed) return
    const next = [...digits]
    typed
      .slice(0, 6 - from)
      .split('')
      .forEach((d, i) => (next[from + i] = d))
    setDigits(next)
    setError('')
    boxes.current[Math.min(5, from + typed.length)]?.focus()
    if (next.every(Boolean)) verify(next.join(''))
  }

  function keyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      boxes.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault()
      boxes.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < 5) {
      e.preventDefault()
      boxes.current[i + 1]?.focus()
    }
  }

  function change(i, value) {
    if (busy) return
    let typed = value.replace(/\D/g, '')
    // Typing after a digit already in the box replaces it; more than one
    // new digit is a paste or autofill, which fills the boxes from here.
    if (digits[i] && typed.length === 2 && typed.startsWith(digits[i])) typed = typed.slice(1)
    if (typed) return fill(i, typed)
    const next = [...digits]
    next[i] = ''
    setDigits(next)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length === 6) verify(code)
      }}
    >
      <div className="code-field">
        <span id={labelId} className="code-label">
          <span className="nowrap">6-digit</span> code
        </span>
        <div className={`code-boxes${error ? ' code-boxes-error' : ''}`} role="group" aria-labelledby={labelId}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (boxes.current[i] = el)}
              className="code-box"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${i + 1} of 6`}
              aria-invalid={error ? true : undefined}
              value={d}
              onChange={(e) => change(i, e.target.value)}
              onKeyDown={(e) => keyDown(i, e)}
              onPaste={(e) => {
                e.preventDefault()
                fill(i, e.clipboardData.getData('text'))
              }}
              onFocus={(e) => e.target.select()}
            />
          ))}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="muted small" role="status">
          Checking…
        </p>
      )}
      <button className={`btn${code.length === 6 ? '' : ' btn-waiting'}`} type="submit" disabled={busy || code.length !== 6}>
        {button}
      </button>
    </form>
  )
}
