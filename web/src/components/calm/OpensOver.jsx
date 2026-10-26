import { useLayoutEffect, useRef, useState } from 'react'

// From the #182 draft (lab/home/CalmHome.jsx), for Home's Coming up (#187).
// The card keeps its resting height in the layout; when its list expands it grows over the cards
// below instead of pushing them. Re-measures whenever it is closed, so wraps and font loads follow.
export default function OpensOver({ children }) {
  const card = useRef(null)
  const rest = useRef({ h: null, w: null })
  const [h, setH] = useState(null)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    // The resting height is measured only while closed and only when the width changes (or fonts
    // load), never mid-animation: the stack reports "collapsed" before its height has finished
    // shrinking, and measuring then made the whole row jump.
    const measure = () => {
      const expanded = el.querySelector('[aria-expanded="true"]') != null
      if (expanded) return
      rest.current = { h: el.offsetHeight, w: el.offsetWidth }
      setH(el.offsetHeight)
    }
    let wasOpen = false
    let settle
    // Once the card has settled (after mount, and after each close animation), take its true resting height.
    const later = () => {
      clearTimeout(settle)
      settle = setTimeout(measure, 350)
    }
    const read = () => {
      const expanded = el.querySelector('[aria-expanded="true"]') != null
      // Stay on top until the card has fully closed again.
      const isOpen = expanded || (rest.current.h != null && el.offsetHeight > rest.current.h + 1)
      setOpen(isOpen)
      if (wasOpen && !expanded) later()
      wasOpen = expanded
      if (el.offsetWidth !== rest.current.w) measure()
    }
    measure()
    later()
    document.fonts?.ready.then(later)
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearTimeout(settle)
    }
  }, [])
  return (
    <div className="relative" style={h == null ? undefined : { height: h }}>
      <div ref={card} className={`${h == null ? '' : 'absolute inset-x-0 top-0'} ${open ? 'z-30 rounded-2xl shadow-2xl shadow-black/30' : ''}`}>
        {children}
      </div>
    </div>
  )
}
