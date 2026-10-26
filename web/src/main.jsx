import './lib/recovery-capture.js' // first: a password reset link (#22)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTokens } from './lib/tokens.js'
import { captureInviteFromURL } from './lib/invite.js'
import './fonts.css'
import './app.css' // styles.css inside, in a lower layer (#187)
import App from './App.jsx'

applyTokens()
captureInviteFromURL() // before anything else reads the URL

// After an update, an open tab may ask for a page file that no longer exists
// (#99). Reload once to get the new version, instead of a broken page; if that
// was already tried in the last minute, let the error show.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'tallyn.reloadedForUpdate'
  let last = 0
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0
    if (Date.now() - last < 60000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return // storage blocked: can't guard against a reload loop
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
