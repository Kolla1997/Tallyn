import mark from '../../../../brand/coinroof/animation/SVG/coinroof-mark-animated-light.svg'
import markDark from '../../../../brand/coinroof/animation/SVG/coinroof-mark-animated-dark.svg'

// While a page loads (#212, #221): the animated Coinroof mark first, so a quick load is just the
// mark. After 900ms it hands over (CSS only, no timers): a small mark by the top of the page and
// grey bars in the shape of the page's cards, with a faint sweep of the mark's green and red.
// Rows then fade up one after another (.calm-row in app.css). Screen readers hear the words once.
const CARDS = [
  ['lg:col-span-8', 3],
  ['lg:col-span-4', 3],
  ['lg:col-span-4', 4],
  ['lg:col-span-4', 4],
  ['lg:col-span-4', 4],
]

function Mark({ size }) {
  return (
    <>
      <img className="dark:hidden" src={mark} alt="" width={size} height={size} />
      <img className="hidden dark:block" src={markDark} alt="" width={size} height={size} />
    </>
  )
}

export default function PageSkeleton({ text = 'Adding it all up' }) {
  return (
    <div role="status" className="calm-skeleton relative">
      <span className="sr-only">{text}…</span>
      <div aria-hidden="true" className="calm-skeleton-mark">
        <Mark size={72} />
        <p>{text}…</p>
      </div>
      <div aria-hidden="true" className="calm-skeleton-shapes">
        <div className="calm-skeleton-mini">
          <Mark size={20} />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {CARDS.map(([span, bars], i) => (
            <div key={i} className={`calm-solid flex flex-col gap-3 rounded-2xl p-4 ${span}`}>
              <i className="calm-bar w-2/5" />
              {Array.from({ length: bars }, (_, j) => (
                <i key={j} className={`calm-bar ${['w-4/5', 'w-3/5', 'w-full'][j % 3]}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
