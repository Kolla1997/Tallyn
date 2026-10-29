import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from '../lib/motion.js'

// A number that counts to its new value when it changes (#87), e.g. Spent
// going from $13,259.66 to $6,587.88 when a filter changes. 600ms, easing
// out. Screen readers get only the final value; reduced motion jumps
// straight to it. `start` (#228) counts up from it on the first show, e.g. from 0 when a page loads.
export default function CountUp({ value, format, start }) {
  const [shown, setShown] = useState(start ?? value)
  const from = useRef(start ?? value)
  useEffect(() => {
    const start = from.current
    if (start === value || reducedMotion()) {
      from.current = value
      setShown(value)
      return
    }
    let frame
    const t0 = performance.now()
    const step = (t) => {
      // A frame's time can be a hair before t0: clamp, or the first step overshoots.
      const k = Math.max(0, Math.min(1, (t - t0) / 600))
      const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3))
      from.current = v
      setShown(v)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return (
    <>
      <span aria-hidden="true" className="tabular-nums">
        {format(shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  )
}
