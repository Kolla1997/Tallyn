// While a page loads (#212): still grey bars in the shape of the page's cards, so the page
// doesn't sit blank and then appear all at once. Rows then fade up one after another
// (.calm-row in app.css). Screen readers hear the same words as the loader.
const CARDS = [
  ['lg:col-span-8', 3],
  ['lg:col-span-4', 3],
  ['lg:col-span-4', 4],
  ['lg:col-span-4', 4],
  ['lg:col-span-4', 4],
]

export default function PageSkeleton({ text = 'Adding it all up' }) {
  return (
    <div role="status" className="calm-skeleton grid grid-cols-1 gap-3 lg:grid-cols-12">
      <span className="sr-only">{text}…</span>
      {CARDS.map(([span, bars], i) => (
        <div key={i} aria-hidden="true" className={`calm-solid flex flex-col gap-3 rounded-2xl p-4 ${span}`}>
          <i className="calm-bar w-2/5" />
          {Array.from({ length: bars }, (_, j) => (
            <i key={j} className={`calm-bar ${['w-4/5', 'w-3/5', 'w-full'][j % 3]}`} />
          ))}
        </div>
      ))}
    </div>
  )
}
