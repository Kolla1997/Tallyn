// Calm drafts of every screen (#185): one page switcher, Light/Dark, shared shell.
// Pages land here one by one; Home is the calm Home from #182.
import { Suspense, lazy, useEffect, useState } from 'react'
import { Shell } from './ui.jsx'

const PAGES = [
  ['home', 'Home', lazy(() => import('./HomeBody.jsx'))],
  ['accounts', 'Accounts', lazy(() => import('./Accounts.jsx'))],
  ['transactions', 'Transactions', lazy(() => import('./Transactions.jsx'))],
]

export default function App() {
  const q = new URLSearchParams(location.search)
  const [page, setPage] = useState(PAGES.some(([k]) => k === q.get('p')) ? q.get('p') : 'home')
  const [dark, setDark] = useState(q.get('t') === 'dark')
  const go = (k) => {
    setPage(k)
    const u = new URL(location.href)
    u.searchParams.set('p', k)
    history.replaceState(null, '', u)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    document.title = `Tallyn draft · ${PAGES.find(([k]) => k === page)[1]}`
  }, [page])
  const Page = PAGES.find(([k]) => k === page)[2]
  return (
    <Shell page={page} pages={PAGES} go={go} dark={dark} setDark={setDark}>
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    </Shell>
  )
}
