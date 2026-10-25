// Draft lab (#183): a page for design drafts built with Tailwind, shadcn,
// Bklit charts, Kokonut UI and anime.js. Dev only: the build ships index.html.
// ?smoke: library check · ?round1, ?round2, ?round3: earlier Home drafts · ?home: calm Home alone · default: calm drafts of every screen (#185)
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '../fonts.css'
import './lab.css'

const q = new URLSearchParams(location.search)
const Page = lazy(() =>
  q.has('smoke')
    ? import('./Smoke.jsx')
    : q.has('round1')
      ? import('./home/HomeDrafts.jsx')
      : q.has('round2')
        ? import('./home/BoldHome.jsx')
        : q.has('round3')
          ? import('./home/RedesignHome.jsx')
          : q.has('home')
            ? import('./home/CalmHome.jsx')
            : import('./calm/App.jsx'),
)

createRoot(document.getElementById('lab')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
)
