// Sign out after 30 minutes without activity (#91). The time of the last
// activity is kept in localStorage, so every Tallyn tab shares it: active in
// one tab keeps all of them signed in. Kept apart from the component so the
// rules can be tested without a browser session.

export const IDLE_MS = 30 * 60 * 1000
export const WARN_MS = 60 * 1000 // the warning shows for the last minute

const LAST = 'tallyn.lastActive'
const NOTE = 'tallyn.signedOutIdle'

// 'active', 'warn' (with seconds left) or 'out', from how long it's been.
export function idleState(now, last) {
  const idle = now - last
  if (idle >= IDLE_MS) return { state: 'out', secondsLeft: 0 }
  if (idle >= IDLE_MS - WARN_MS) return { state: 'warn', secondsLeft: Math.ceil((IDLE_MS - idle) / 1000) }
  return { state: 'active', secondsLeft: null }
}

// Storage can be blocked (private windows): fall back to this tab's memory.
let memoryLast = Date.now()

export function lastActive() {
  try {
    const v = Number(localStorage.getItem(LAST))
    return Number.isFinite(v) && v > 0 ? v : memoryLast
  } catch {
    return memoryLast
  }
}

export function markActive(now = Date.now()) {
  memoryLast = now
  try {
    localStorage.setItem(LAST, String(now))
  } catch {
    // only this tab then
  }
}

export const LAST_ACTIVE_KEY = LAST

// True if a previous visit left a time behind. The sign-in page clears it,
// so a fresh sign-in starts a new clock, while a reload or a return after
// sleep keeps the old one (and signs out if it's been 30 minutes).
export function hasLastActive() {
  try {
    return localStorage.getItem(LAST) != null
  } catch {
    return false
  }
}

export function clearActive() {
  try {
    localStorage.removeItem(LAST)
  } catch {
    // nothing kept
  }
}

// The sign-in page's note ("You were signed out after 30 minutes…").
export function rememberIdleSignOut() {
  try {
    localStorage.setItem(NOTE, '1')
  } catch {
    // the note is a nicety
  }
}

export function takeIdleSignOut() {
  try {
    const v = localStorage.getItem(NOTE) === '1'
    localStorage.removeItem(NOTE)
    return v
  } catch {
    return false
  }
}
