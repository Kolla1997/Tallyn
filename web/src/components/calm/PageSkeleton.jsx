import mark from '../../../../brand/coinroof/animation/SVG/coinroof-mark-animated-light.svg'
import markDark from '../../../../brand/coinroof/animation/SVG/coinroof-mark-animated-dark.svg'

// While a page loads (#212, #221): just the animated Coinroof mark and "Adding it all up…", where the
// cards will appear (Dinesh dropped the grey card shapes). Rows then fade up one after another
// (.calm-row in app.css). Screen readers hear the words once.
export default function PageSkeleton({ text = 'Adding it all up' }) {
  return (
    <div role="status" className="calm-skeleton">
      <span className="sr-only">{text}…</span>
      <div aria-hidden="true" className="calm-skeleton-mark">
        <img className="dark:hidden" src={mark} alt="" width={72} height={72} />
        <img className="hidden dark:block" src={markDark} alt="" width={72} height={72} />
        <p className="m-0">{text}…</p>
      </div>
    </div>
  )
}
