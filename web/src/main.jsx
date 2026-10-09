import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTokens } from './lib/tokens.js'
import './styles.css'
import App from './App.jsx'

applyTokens()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
