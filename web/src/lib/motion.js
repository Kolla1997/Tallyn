import { useEffect, useRef, useState } from 'react'

// Loading and change effects (#87, Dinesh picked A with count-up numbers).
// UI transitions are 200 to 300ms ease-out (Animation Guide), and reduced
// motion gets a plain fade only.

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// True once `loading` has lasted longer than `delay`, so fast answers never
// flicker. Pages put it on a "busy zone": its cards dim and a thin bar runs
// along their top.
export function useBusy(loading, delay = 150) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!loading) {
      setBusy(false)
      return
    }
    const t = setTimeout(() => setBusy(true), delay)
    return () => clearTimeout(t)
  }, [loading, delay])
  return busy
}

// True for a moment after `key` changes (not on first show), to fade the new
// content in. Key it on what the card shows, e.g. the account IDs listed.
export function useFadeOnChange(key) {
  const [fading, setFading] = useState(false)
  const last = useRef(key)
  useEffect(() => {
    if (last.current === key) return
    last.current = key
    setFading(true)
    const t = setTimeout(() => setFading(false), 300)
    return () => clearTimeout(t)
  }, [key])
  return fading
}
