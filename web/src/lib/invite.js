// Invite links look like https://<site>/join#<token> (#12). The token is in
// the fragment, which browsers never send to the server, so it can't end up in
// server or proxy logs. It's kept in localStorage until the person has signed
// in (sign-up and email confirmation can take a few page loads), then cleared.
const KEY = 'tallyn.invite'

export function captureInviteFromURL() {
  if (window.location.pathname !== '/join') return
  const token = window.location.hash.slice(1)
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    try {
      localStorage.setItem(KEY, token)
    } catch {
      // storage blocked: the person can open the link again after signing in
    }
  }
  window.history.replaceState(null, '', '/') // the token leaves the address bar
}

export function pendingInvite() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

export function inviteLink(token) {
  return `${window.location.origin}/join#${token}`
}
