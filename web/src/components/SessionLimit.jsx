import { useEffect, useRef } from 'react'
import { rememberSignOutNote, sessionOver, signedInAt } from '../lib/session.js'

// Sign in again after 12 hours (#92): checked every minute and whenever the
// tab comes back into view (timers pause while a computer sleeps).
export default function SessionLimit({ accessToken, onSignOut }) {
  const done = useRef(false)

  useEffect(() => {
    const at = signedInAt(accessToken)
    if (at == null) return // the API still checks
    const check = () => {
      if (done.current || !sessionOver(Date.now(), at)) return
      done.current = true
      rememberSignOutNote('max')
      onSignOut()
    }
    const onVisible = () => document.visibilityState === 'visible' && check()
    check()
    const timer = setInterval(check, 60 * 1000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [accessToken, onSignOut])

  return null
}
