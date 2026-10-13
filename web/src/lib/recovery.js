// Password reset (#22, Dinesh picked A). The reset email's link opens Tallyn
// with "type=recovery" in the address; Supabase signs the person in from it.
// Before the new password, the 2FA code (Supabase won't change the password
// of an account with 2FA without it), so a reset never skips 2FA.
//
// The reset being under way is kept in sessionStorage: the link opens its own
// tab, and closing that tab ends it.

const FLAG = 'tallyn.recovery' // 'pending' | 'expired'
const ASKED = 'tallyn.resetAsked' // { email, at }: to recognise an expired reset link
const CHANGED = 'tallyn.passwordChanged' // the note on Home, shown once
export const MIN_PASSWORD = 8 // Dinesh, 2026-10-12; set the same in Supabase (Dev Setup)
const ASKED_FOR = 24 * 60 * 60 * 1000

let memory = ''

function read(store, key) {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}
function write(store, key, value) {
  try {
    if (value == null) store.removeItem(key)
    else store.setItem(key, value)
  } catch {
    // storage blocked: this page only
  }
}

// Runs before the Supabase client reads the address (main.jsx imports it first).
export function captureRecoveryFromURL() {
  const params = new URLSearchParams(`${window.location.hash.slice(1)}&${window.location.search.slice(1)}`)
  if (params.get('type') === 'recovery') {
    startRecovery()
  } else if (params.get('error_code') === 'otp_expired' && resetAskedEmail() != null) {
    // An expired or already-used reset link: say so, and offer a new one.
    memory = 'expired'
    write(sessionStorage, FLAG, 'expired')
    window.history.replaceState(null, '', window.location.pathname)
  }
}

export function recoveryState() {
  return read(sessionStorage, FLAG) || memory
}

export function startRecovery() {
  memory = 'pending'
  write(sessionStorage, FLAG, 'pending')
}

export function endRecovery() {
  memory = ''
  write(sessionStorage, FLAG, null)
}

export function rememberResetAsked(email) {
  write(localStorage, ASKED, JSON.stringify({ email, at: Date.now() }))
}

// The email a reset was asked for in the last day, or null.
export function resetAskedEmail() {
  try {
    const { email, at } = JSON.parse(read(localStorage, ASKED))
    return Date.now() - at < ASKED_FOR ? email : null
  } catch {
    return null
  }
}

export function rememberPasswordChanged() {
  write(localStorage, ASKED, null)
  write(localStorage, CHANGED, '1')
}

export function takePasswordChanged() {
  const v = read(localStorage, CHANGED) === '1'
  write(localStorage, CHANGED, null)
  return v
}
