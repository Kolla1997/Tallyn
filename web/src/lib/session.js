// Sign in again after 12 hours, however active (#92, ADR 0012). The time of
// sign-in comes from the access token's amr list (its oldest entry: the
// password sign-in; a 2FA step-up adds a newer one). The Go API refuses older
// sessions too, so this is the friendly half: sign out cleanly, with a note.

export const MAX_SESSION_MS = 12 * 60 * 60 * 1000

// When this session signed in, in ms, or null if the token doesn't say.
export function signedInAt(accessToken) {
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const times = (JSON.parse(atob(part)).amr ?? []).map((a) => a.timestamp).filter((t) => t > 0)
    return times.length ? Math.min(...times) * 1000 : null
  } catch {
    return null
  }
}

export function sessionOver(now, at) {
  return at != null && now - at >= MAX_SESSION_MS
}

// The sign-in page's note after an automatic sign-out, shown once.
const NOTE = 'tallyn.signOutNote'
export const NOTES = {
  idle: 'You were signed out after 30 minutes without activity, to keep your money private.', // #91
  max: 'For your security, Tallyn asks you to sign in again every 12 hours.', // #92
}

export function rememberSignOutNote(reason) {
  try {
    localStorage.setItem(NOTE, reason)
  } catch {
    // the note is a nicety
  }
}

export function takeSignOutNote() {
  try {
    const v = localStorage.getItem(NOTE)
    localStorage.removeItem(NOTE)
    return NOTES[v] ? v : ''
  } catch {
    return ''
  }
}
