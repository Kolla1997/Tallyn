'use client'
import { motion } from 'motion/react'
import { useId, useLayoutEffect, useRef } from 'react'

export function HighlightSegment({ pathRef, visible, stroke, strokeWidth, height, x, width }) {
  const clipId = useId()
  const highlightRef = useRef(null)

  // Copy the base stroke's `d` after commit (before paint) instead of reading
  // `pathRef.current` during render — same frame, and it picks up the base
  // path's `d` from this commit rather than the previous one.
  useLayoutEffect(() => {
    if (!visible) {
      return
    }
    highlightRef.current?.setAttribute('d', pathRef.current?.getAttribute('d') || '')
  })

  if (!visible) {
    return null
  }
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          {/* Bleed by strokeWidth so a stroke at the min/max value keeps its full width. */}
          <motion.rect height={height + strokeWidth * 2} width={width} x={x} y={-strokeWidth} />
        </clipPath>
      </defs>
      <motion.path
        animate={{ opacity: 1 }}
        clipPath={`url(#${clipId})`}
        exit={{ opacity: 0 }}
        fill="none"
        initial={{ opacity: 0 }}
        ref={highlightRef}
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      />
    </>
  )
}

HighlightSegment.displayName = 'HighlightSegment'

export default HighlightSegment
