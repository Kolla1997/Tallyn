import mark from '../../../brand/coinroof/animation/SVG/coinroof-mark-animated-light.svg'
import markDark from '../../../brand/coinroof/animation/SVG/coinroof-mark-animated-dark.svg'

// Loading (#66, #200): the animated Coinroof tile from brand/coinroof/animation (Ripple: the arcs spread out of the
// corner one by one, the level stripes slide in, then each arc brightens in turn) with "Adding it all up" and dots
// that appear one by one. Screen readers hear the words once; with reduced motion the tile and the dots stand still
// (the SVG and the CSS both respect it). The component keeps its name until the code rename (#203).
export default function TallynLoader({ text = 'Adding it all up', small = false }) {
  return (
    <div className={small ? 'loader loader-small' : 'loader'} role="status">
      <img className="dark:hidden" src={mark} alt="" width={small ? 40 : 88} height={small ? 40 : 88} />
      <img className="hidden dark:block" src={markDark} alt="" width={small ? 40 : 88} height={small ? 40 : 88} />
      <p className="loader-text">
        {text}
        <span className="loader-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
        <span className="sr-only">…</span>
      </p>
    </div>
  )
}
