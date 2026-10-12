import { useCallback, useEffect, useRef, useState } from 'react'
import { LAST_ACTIVE_KEY, hasLastActive, idleState, lastActive, markActive } from '../lib/idle.js'
import { rememberSignOutNote } from '../lib/session.js'

// Sign out after 30 minutes without activity (#91, Dinesh picked A): for the
// last minute a dialog counts down ("Still there?"), with the page blurred
// behind it so balances aren't readable on an unattended screen.
//
// Activity is a click, tap, key, scroll or wheel in any Tallyn tab (shared
// through localStorage); Tallyn's own background refreshes don't count. The
// check also runs when the tab comes back into view, because timers pause
// while a computer sleeps: back after the 30 minutes means signed out at once.

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
const SAVE_EVERY = 5000 // write activity at most every 5 seconds
const CHECK_EVERY = 1000

export default function IdleGuard({ onSignOut }) {
  const [secondsLeft, setSecondsLeft] = useState(null) // null: no warning
  const dialog = useRef(null)
  const stayButton = useRef(null)
  const saved = useRef(0)
  const signingOut = useRef(false)

  const signOut = useCallback(() => {
    if (signingOut.current) return
    signingOut.current = true
    rememberSignOutNote('idle')
    onSignOut()
  }, [onSignOut])

  const check = useCallback(() => {
    const { state, secondsLeft: left } = idleState(Date.now(), lastActive())
    if (state === 'out') signOut()
    else setSecondsLeft(state === 'warn' ? left : null)
  }, [signOut])

  // A fresh sign-in starts the clock; a reload or a return keeps it, so
  // coming back after 30 minutes still signs out.
  useEffect(() => {
    if (hasLastActive()) check()
    else markActive()
  }, [check])

  useEffect(() => {
    const onActivity = () => {
      // While the warning shows, only its buttons count (a stray scroll
      // shouldn't silently keep someone else's money on screen).
      if (dialog.current?.open) return
      const now = Date.now()
      if (now - saved.current < SAVE_EVERY) return
      saved.current = now
      markActive(now)
    }
    const onStorage = (e) => e.key === LAST_ACTIVE_KEY && check() // another tab was used
    const onVisible = () => document.visibilityState === 'visible' && check()
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }))
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    const timer = setInterval(check, CHECK_EVERY)
    return () => {
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }))
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      clearInterval(timer)
    }
  }, [check])

  // Open or close the dialog with the warning.
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (secondsLeft != null && !d.open) {
      d.showModal()
      stayButton.current?.focus() // Enter or Space keeps you signed in
    }
    if (secondsLeft == null && d.open) d.close()
  }, [secondsLeft])

  const stay = () => {
    saved.current = Date.now()
    markActive()
    setSecondsLeft(null)
  }

  return (
    <dialog
      ref={dialog}
      className="dialog idle-dialog"
      role="alertdialog"
      aria-labelledby="idle-title"
      aria-describedby="idle-text"
      // Esc means "I'm here".
      onCancel={(e) => {
        e.preventDefault()
        stay()
      }}
    >
      <h2 id="idle-title">Still there?</h2>
      <p id="idle-text" className="muted">
        For your privacy, we&apos;ll sign you out in <strong className="idle-count">{secondsLeft ?? 60}</strong> seconds.
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={signOut}>
          Sign out now
        </button>
        <button ref={stayButton} type="button" className="btn" onClick={stay}>
          Stay signed in
        </button>
      </div>
    </dialog>
  )
}
