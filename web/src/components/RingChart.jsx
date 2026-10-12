import { useEffect, useState } from 'react'
import CountUp from './CountUp.jsx'
import { reducedMotion } from '../lib/motion.js'

// Rings (#27, Dinesh picked option 1 of the ring drafts): one ring per kind
// of debt, each filled with what's still owed out of its limits or the amount
// borrowed. The total sits in the middle; pointing at a ring or legend row
// (or focusing it) shows that one there instead and fades the others. On
// first show the rings grow in one after another, the arcs fill, the total
// counts up and the legend slides in with its bars filling. Reduced motion:
// everything just appears. Plain SVG with brand tokens, no chart library.
//
// rings: [{ key, label, value, max, maxNote, color }] in minor units,
// outermost first. format(minor) turns amounts into text.

const SIZE = 330
const STROKE = 14
const GAP = 5
const INNER = 80 // radius of the innermost ring's inside edge
// The hole in the middle, as a share of the chart's width, less padding.
const HOLE = (2 * INNER - 18) / SIZE

export default function RingChart({ rings, total, totalLabel, format }) {
  const [hot, setHot] = useState(null)
  const [ready, setReady] = useState(reducedMotion())
  const [shownTotal, setShownTotal] = useState(reducedMotion() ? total : 0)

  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(t)
  }, [])
  useEffect(() => {
    if (ready) setShownTotal(total)
  }, [ready, total])

  const c = SIZE / 2
  const pct = (r) => (r.max > 0 ? Math.min(1, r.value / r.max) : 0)
  const h = hot == null ? null : rings[hot]
  const centerValue = h ? format(h.value) : null
  const centerText = h ? centerValue : format(total)
  // Shrink long numbers to fit the hole (about 0.6em per character).
  const fontSize = `min(26px, ${((HOLE * 100) / (centerText.length * 0.6)).toFixed(2)}cqw)`

  return (
    <div className={ready ? 'ring-chart is-ready' : 'ring-chart'}>
      <div className="ring-svg">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
          {rings.map((r, i) => {
            const radius = INNER + (rings.length - 1 - i) * (STROKE + GAP) + STROKE / 2
            const C = 2 * Math.PI * radius
            const len = pct(r) * C
            return (
              <g key={r.key} style={{ '--delay': `${i * 80}ms`, '--arc-delay': `${350 + i * 110}ms` }}>
                <circle className="ring-track" cx={c} cy={c} r={radius} strokeWidth={STROKE} />
                <circle
                  className={`ring-arc${hot != null && hot !== i ? ' is-dim' : ''}${hot === i ? ' is-hot' : ''}`}
                  cx={c}
                  cy={c}
                  r={radius}
                  stroke={r.color}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${ready ? len : 0} ${C}`}
                  transform={`rotate(-90 ${c} ${c})`}
                  onMouseEnter={() => setHot(i)}
                  onMouseLeave={() => setHot(null)}
                />
              </g>
            )
          })}
        </svg>
        <div className="ring-center">
          <span className="ring-center-value" style={{ fontSize }}>
            {h ? centerValue : <CountUp value={shownTotal} format={format} />}
          </span>
          <span className="ring-center-label" style={{ maxWidth: `${HOLE * 100}%` }}>
            {h ? `${h.label} · ${Math.round(pct(h) * 100)}% of ${format(h.max)} ${h.maxNote}` : totalLabel}
          </span>
        </div>
      </div>

      <ul className="ring-legend">
        {rings.map((r, i) => (
          <li key={r.key} style={{ '--delay': `${700 + i * 120}ms` }}>
            <button
              type="button"
              className={`ring-legend-row${hot != null && hot !== i ? ' is-dim' : ''}${hot === i ? ' is-hot' : ''}`}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
            >
              <span className="ring-swatch" style={{ background: r.color }} aria-hidden="true" />
              <span className="grow">{r.label}</span>
              <span className="ring-legend-amount">
                <strong>{format(r.value)}</strong>
                <span className="small muted"> of {format(r.max)}</span>
              </span>
              <span className="ring-legend-bar" aria-hidden="true">
                <i style={{ width: ready ? `${Math.round(pct(r) * 100)}%` : 0, background: r.color }} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
