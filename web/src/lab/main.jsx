// Draft lab (#183): a page for design drafts built with Tailwind, shadcn,
// Bklit charts, Kokonut UI and anime.js. Dev only: the build ships index.html.
// ?smoke: library check · ?round1: first Home drafts · default: round 2 (#182)
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '../fonts.css'
import './lab.css'

const q = new URLSearchParams(location.search)
const Page = lazy(() => (q.has('smoke') ? import('./Smoke.jsx') : q.has('round1') ? import('./home/HomeDrafts.jsx') : import('./home/BoldHome.jsx')))

createRoot(document.getElementById('lab')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
)
