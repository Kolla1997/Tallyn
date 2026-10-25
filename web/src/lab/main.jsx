// Draft lab (#183): a page for design drafts built with Tailwind, shadcn,
// Bklit charts, Kokonut UI and anime.js. Dev only: the build ships index.html.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../fonts.css'
import './lab.css'
import Smoke from './Smoke.jsx'

createRoot(document.getElementById('lab')).render(
  <StrictMode>
    <Smoke />
  </StrictMode>,
)
