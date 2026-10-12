import mark from '../../../brand/animation/SVG/tallyn-mark-animated-light.svg'

// Loading (#66): the animated Tallyn mark from brand/animation (leaves sway
// in, the dot pops, then they breathe) with "Adding it all up" and dots that
// appear one by one. Screen readers hear the words once; with reduced motion
// the mark and the dots stand still (the SVG and the CSS both respect it).
export default function TallynLoader({ text = 'Adding it all up', small = false }) {
  return (
    <div className={small ? 'loader loader-small' : 'loader'} role="status">
      <img src={mark} alt="" width={small ? 40 : 88} height={small ? 40 : 88} />
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
