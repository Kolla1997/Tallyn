import { Moon, Sun } from 'lucide-react'
import { press } from './ui.jsx'
import { setTheme, useTheme } from '../../lib/theme.js'

// Light or dark (#187): one round button that swaps the theme. It shows what you switch to: the
// moon in light, the sun in dark.
export default function ThemeSwitch({ className = '', size = 'size-9' }) {
  const dark = useTheme() === 'dark'
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme'
  const I = dark ? Sun : Moon
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => (press(e), setTheme(dark ? 'light' : 'dark'))}
      className={`flex ${size} shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white p-0 text-zinc-700 transition-colors duration-150 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-white ${className}`}
    >
      <I className="size-4" aria-hidden="true" />
    </button>
  )
}
