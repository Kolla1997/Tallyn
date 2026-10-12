import { useEffect, useState } from 'react'

// A minimal router for Tallyn's few pages (#39): real URLs (/accounts,
// /family...) using the browser's history, no dependency. The Go server and
// Vite both fall back to index.html for these paths.

export function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  return path
}

export function navigate(to) {
  if (to === window.location.pathname) return
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

// Link behaves like a normal link (open in new tab, copy address) but moves
// within the app without a page load.
export function Link({ to, children, ...rest }) {
  const path = usePath()
  return (
    <a
      href={to}
      aria-current={path === to ? 'page' : undefined}
      onClick={(e) => {
        // Let the browser handle new tabs (Cmd-click, or target="_blank").
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
