import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTokens } from './lib/tokens.js'
import { captureInviteFromURL } from './lib/invite.js'
import './fonts.css'
import './styles.css'
import App from './App.jsx'

applyTokens()
captureInviteFromURL() // before anything else reads the URL

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
