import './lib/recovery-capture.js' // first: a password reset link (#22)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { startTheme } from './lib/theme.js'
import { captureInviteFromURL } from './lib/invite.js'
import './fonts.css'
import montserrat from '../../brand/fonts/web/montserrat-latin.woff2?url'
import spaceGrotesk from '../../brand/fonts/web/space-grotesk-latin.woff2?url'
import './app.css' // styles.css inside, in a lower layer (#187)
import App from './App.jsx'

startTheme()

// The two main fonts start downloading now, not when the first text needs them (#155).
for (const href of [montserrat, spaceGrotesk]) {
  const link = Object.assign(document.createElement('link'), { rel: 'preload', as: 'font', type: 'font/woff2', href, crossOrigin: 'anonymous' })
  document.head.appendChild(link)
}
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
    {/* With reduced motion on, chart and card pieces fade in place instead of sliding or growing (#155). */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
