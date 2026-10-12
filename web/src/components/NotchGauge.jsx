import { useEffect, useState } from 'react'
import { reducedMotion } from '../lib/motion.js'

// A notched bar (#27, Dinesh picked style C): rounded notches in a row, the
// filled share in a colour that deepens along the bar, the rest in Sand. When
// it first shows, the filled notches light up one after another (reduced
// motion: they just appear). Credit cards show how much of the limit is used
// in Clay; loans show how much is paid off in Sage. The label above it is the
// caller's; this draws the bar only, with the same words for screen readers.
const RAMPS = {
  clay: ['var(--color-clay)', 'var(--color-clay-deep)'],
  sage: ['var(--color-sage-light)', 'var(--color-sage-deep)'],
}

export default function NotchGauge({ percent, tone = 'clay', notches = 16, label }) {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * notches)
  const [lit, setLit] = useState(() => (reducedMotion() ? filled : 0))

  useEffect(() => {
    if (reducedMotion()) {
      setLit(filled)
      return
    }
    setLit(0)
    const timers = Array.from({ length: filled }, (_, i) => setTimeout(() => setLit(i + 1), 250 + i * 28))
    return () => timers.forEach(clearTimeout)
  }, [filled])

  const [from, to] = RAMPS[tone] ?? RAMPS.clay
  return (
    <div className="notch-gauge" role="img" aria-label={label}>
      {Array.from({ length: notches }, (_, i) => {
        const on = i < filled
        // Deeper towards the end of the filled part.
        const t = filled > 1 ? i / (filled - 1) : 1
        return (
          <span
            key={i}
            className={on && i < lit ? 'notch is-on' : 'notch'}
            style={on && i < lit ? { background: `color-mix(in srgb, ${to} ${Math.round(t * 100)}%, ${from})` } : undefined}
          />
        )
      })}
    </div>
  )
}
