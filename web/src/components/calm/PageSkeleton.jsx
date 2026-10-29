import { useEffect, useState } from 'react'
import { reducedMotion } from '../../lib/motion.js'
import mark from '../../../../brand/coinroof/animation/SVG/coinroof-mark-animated-light.svg'
import markDark from '../../../../brand/coinroof/animation/SVG/coinroof-mark-animated-dark.svg'

// The mark builds in about 1.9s (brand/coinroof/animation); hold it a moment, then build it again.
const LOOP_MS = 2600
// The words type out with each build, a letter every 60ms.
const TYPE_MS = 60

// While a page loads (#212, #221): just the animated Coinroof mark and "Adding it all up…", where the
// cards will appear (Dinesh dropped the grey card shapes). The mark builds and the words type out, again and again until the
// data arrives and this unmounts; with reduced motion it stands still. Rows then fade up one after
// another (.calm-row in app.css). Screen readers hear the words once.
export default function PageSkeleton({ text = 'Adding it all up' }) {
  const words = `${text}…`
  const [round, setRound] = useState(0)
  const [typed, setTyped] = useState(() => (reducedMotion() ? words.length : 0))
  useEffect(() => {
    if (reducedMotion()) return
    const id = setInterval(() => setRound((r) => r + 1), LOOP_MS)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (reducedMotion()) return
    let n = 0
    const id = setInterval(() => {
      n += 1
      setTyped(n)
      if (n >= words.length) clearInterval(id)
    }, TYPE_MS)
    return () => clearInterval(id)
  }, [round, words])
  // A new address each round loads a fresh copy of the SVG, so its animation starts over. (A file
  // under 4 KB would be inlined as a data: URL, which can't take a query; ours are just over.)
  const again = (url) => (round && !url.startsWith('data:') ? `${url}?round=${round}` : url)
  return (
    <div role="status" className="calm-skeleton">
      <span className="sr-only">{text}…</span>
      <div aria-hidden="true" className="calm-skeleton-mark">
        <img className="dark:hidden" src={again(mark)} alt="" width={72} height={72} />
        <img className="hidden dark:block" src={again(markDark)} alt="" width={72} height={72} />
        {/* The full line holds its width while it types, so nothing moves. */}
        <p className="m-0 grid">
          <span className="invisible col-start-1 row-start-1">{words}</span>
          <span className="col-start-1 row-start-1">{words.slice(0, typed)}</span>
        </p>
      </div>
    </div>
  )
}
