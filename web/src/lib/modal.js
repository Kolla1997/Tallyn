import { useEffect, useRef } from 'react'

// Opens a <dialog> as a modal while the component is shown, and when it
// closes puts focus back where it was, usually the button that opened it
// (#153). The dialog leaves after React removes it, so the browser can't.
export function useModal(ref) {
  useEffect(() => {
    const d = ref.current
    const opener = document.activeElement
    if (!d.open) d.showModal()
    return () => {
      if (d.open) d.close()
      returnFocus(opener)
    }
  }, [ref])
}

export function returnFocus(el) {
  if (el && el !== document.body && el.isConnected) el.focus?.({ preventScroll: true })
}

// On phones a list sits above the details it opens, so picking from it would
// change content off-screen. When `key` changes (not on first show), bring the
// details into view there (#153). Wider screens show both side by side.
export function useRevealOnPhone(ref, key) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (window.matchMedia?.('(min-width: 1024px)').matches) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' })
  }, [ref, key])
}
