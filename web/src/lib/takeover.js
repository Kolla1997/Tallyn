import { useEffect } from 'react'

// A panel that covers the whole screen on phones (#153): while it's open,
// keyboard focus and screen readers stay in it (the rest of the page is
// inert), its heading takes focus, and focus goes back to whatever opened it
// when it closes. Does nothing where the panel sits beside the page.
export function useTakeover(panel, heading, { query = '(max-width: 1023px)', key } = {}) {
  useEffect(() => {
    const el = panel.current
    if (!el || !window.matchMedia?.(query).matches) return
    const opener = document.activeElement
    const quiet = []
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      for (const sib of node.parentElement?.children ?? []) {
        if (sib !== node && !sib.hasAttribute('inert')) {
          sib.setAttribute('inert', '')
          quiet.push(sib)
        }
      }
    }
    heading.current?.focus({ preventScroll: true })
    return () => {
      quiet.forEach((n) => n.removeAttribute('inert'))
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [panel, heading, query, key])
}
