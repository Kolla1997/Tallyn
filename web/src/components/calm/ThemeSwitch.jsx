import { Moon, Sun } from 'lucide-react'
import { setTheme, useTheme } from '../../lib/theme.js'

// Light or dark (#187), the #185 drafts' sun and moon. `stacked` for the collapsed rail.
export default function ThemeSwitch({ stacked = false }) {
  const theme = useTheme()
  return (
    <div
      role="group"
      aria-label="Theme"
      className={`flex w-fit gap-0.5 rounded-full border border-zinc-300 p-0.5 dark:border-zinc-700 ${stacked ? 'flex-col' : ''}`}
    >
      {[
        ['light', 'Light', Sun],
        ['dark', 'Dark', Moon],
      ].map(([v, label, I]) => (
        <button
          key={v}
          type="button"
          aria-pressed={theme === v}
          aria-label={label}
          title={label}
          onClick={() => setTheme(v)}
          className="flex size-8 items-center justify-center rounded-full border-0 bg-transparent p-0 text-zinc-500 transition-colors duration-150 hover:text-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:text-zinc-400 dark:hover:text-white dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
        >
          <I className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
