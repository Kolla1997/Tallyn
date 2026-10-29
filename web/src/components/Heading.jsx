import { useEffect, useRef } from 'react'

let firstScreen = true

// For tests: the next heading counts as the first screen again.
export function resetHeading() {
  firstScreen = true
}

// A screen's h1 (#153). It names the browser tab ("Accounts · Tallyn"), and
// when the screen or step changes it takes keyboard focus, so screen readers
// announce where you are. The very first screen after a page load is left
// alone. Focus from a click shows no ring (only keyboard use does).
export default function Heading({ children, title, ...rest }) {
  const ref = useRef(null)
  const last = useRef(null)
  const name = title ?? (typeof children === 'string' ? children : '')

  useEffect(() => {
    document.title = name ? `${name} · Coinroof` : 'Coinroof'
    if (last.current === name) return // StrictMode runs effects twice
    const moved = last.current !== null || !firstScreen
    firstScreen = false
    last.current = name
    if (moved) ref.current?.focus({ preventScroll: true })
  }, [name])

  return (
    <h1 ref={ref} tabIndex={-1} {...rest}>
      {children}
    </h1>
  )
}
