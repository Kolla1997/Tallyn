'use client'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback } from 'react'
import { cn } from '@/lab/utils'

/**
 * RTL / cursive scripts (Hebrew, Arabic incl. Persian & Urdu, Syriac, Thaana,
 * N'Ko and their presentation forms). Splitting these into per-character
 * spans breaks glyph joining and reverses the visual order, so they shimmer
 * as a single run instead.
 */
const WHOLE_TEXT_SCRIPT_PATTERN = /[\u0590-\u07ff\u0860-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u

export function ShimmeringText({ text, duration = 1, isStopped = false, paused = false, className, ...props }) {
  const reducedMotion = useReducedMotion()
  const stopped = isStopped || paused || reducedMotion === true

  const createCharVariants = useCallback(
    (charIndex) => ({
      running: {
        color: ['var(--color)', 'var(--shimmering-color)', 'var(--color)'],
        transition: {
          duration,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: 'loop',
          repeatDelay: text.length * 0.05,
          delay: (charIndex * duration) / text.length,
          ease: 'easeInOut',
        },
      },

      stopped: {
        color: 'var(--color)',
        transition: {
          duration: duration * 0.5,
          ease: 'easeOut',
        },
      },
    }),
    [duration, text.length],
  )

  if (WHOLE_TEXT_SCRIPT_PATTERN.test(text)) {
    return (
      <motion.span
        animate={
          stopped
            ? { color: 'var(--color)' }
            : {
                color: ['var(--color)', 'var(--shimmering-color)', 'var(--color)'],
              }
        }
        className={cn(
          'inline-block select-none whitespace-nowrap leading-none',
          '[--color:var(--muted-foreground)] [--shimmering-color:var(--foreground)]',
          className,
        )}
        transition={{
          duration,
          ease: 'easeInOut',
          repeat: stopped ? 0 : Number.POSITIVE_INFINITY,
        }}
        {...props}
      >
        {text}
      </motion.span>
    )
  }

  return (
    <motion.span
      className={cn('inline-flex select-none items-center leading-none', '[--color:var(--muted-foreground)] [--shimmering-color:var(--foreground)]', className)}
      {...props}
    >
      {text.split('').map((char, index) => (
        <motion.span
          animate={stopped ? 'stopped' : 'running'}
          aria-hidden
          className="inline-block whitespace-pre leading-none"
          initial="stopped"
          // biome-ignore lint/suspicious/noArrayIndexKey: static label text, order never changes
          key={index}
          variants={createCharVariants(index)}
        >
          {char}
        </motion.span>
      ))}
      <span className="sr-only">{text}</span>
    </motion.span>
  )
}
