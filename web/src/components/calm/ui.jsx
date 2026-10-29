import { animate } from 'animejs'
import { Link } from '../../lib/router.jsx'
import Heading from '../Heading.jsx'

// The calm redesign's building blocks for real screens (#187), copied from the #185 drafts
// (web/src/lab/calm/ui.jsx) so every page is made of the same parts: cards (frosted summaries,
// solid lists), card titles, "see" links, rows, money, figures, chips and buttons.

export const NUM = 'font-[family-name:var(--font-heading)] font-semibold tabular-nums'
export const MUTED = 'text-zinc-500 dark:text-zinc-400'
export const OWE = { color: 'var(--color-redesign-owe-text)' }
export const IN = { color: 'var(--color-redesign-in-text)' }

const EASE = 'cubicBezier(0.23, 1, 0.32, 1)'
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// Press feedback (anime.js). Loading fades in through CSS (.calm-card, .calm-row in app.css, #212).
export const press = (e) => !reduced() && animate(e.currentTarget, { scale: [1, 0.97, 1], duration: 160, ease: EASE })

// A card. `glass` for summaries; lists and tables stay solid (glass Mix).
export function Panel({ id, title, meta, glass = false, className = '', children, label }) {
  return (
    <section
      aria-labelledby={title ? id : undefined}
      aria-label={title ? undefined : label}
      className={`calm-card min-w-0 rounded-2xl p-4 ${glass ? 'calm-glass' : 'calm-solid'} ${className}`}
    >
      {title && (
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={id} className="m-0 font-[family-name:var(--font-heading)] text-[15px] font-semibold text-zinc-900 dark:text-white">
            {title}
          </h2>
          {meta && <span className={`text-[13px] ${MUTED}`}>{meta}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

export const See = ({ to, children }) => (
  <Link
    to={to}
    className="text-[13px] font-semibold text-zinc-900 dark:text-white underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4 hover:decoration-zinc-900 dark:hover:decoration-white"
  >
    {children}
  </Link>
)

export const Rows = ({ children, label }) => (
  <ul aria-label={label} className="m-0 list-none divide-y divide-zinc-100 dark:divide-zinc-800 p-0">
    {children}
  </ul>
)

export const IconTile = ({ children }) => (
  <span
    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
    aria-hidden="true"
  >
    {children}
  </span>
)

// One row: an icon (or avatar), a name and a line under it, and something on the right.
export function Row({ lead, name, sub, children, className = '' }) {
  return (
    <li className={`calm-row flex items-center gap-3 py-2 ${className}`}>
      {lead}
      <span className="min-w-0 grow">
        <span className="name block truncate text-[14px] font-semibold">{name}</span>
        {sub && <span className={`block truncate text-[13px] ${MUTED}`}>{sub}</span>}
      </span>
      {children}
    </li>
  )
}

export const Money = ({ children, tone, className = '' }) => (
  <span className={`shrink-0 whitespace-nowrap ${NUM} ${className}`} style={tone}>
    {children}
  </span>
)

// A row of choices, one pressed at a time.
export function Chips({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([k, text]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className="h-8 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 transition-[background-color,color] duration-150 aria-pressed:border-zinc-900 dark:aria-pressed:border-white aria-pressed:bg-zinc-900 dark:aria-pressed:bg-white aria-pressed:text-white dark:aria-pressed:text-zinc-900"
        >
          {text}
        </button>
      ))}
    </div>
  )
}

// A pill button: red for the one action, outlined when quiet.
// The classes of a pill, for components that render their own button (Link a bank).
export const PILL = 'inline-flex h-9 items-center gap-1.5 rounded-full border-0 px-3 text-[13px] font-semibold text-white bg-[var(--color-redesign-button)]'

export function Pill({ children, icon: I, quiet, onClick, type = 'button', to, disabled, label }) {
  const cls = `inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold no-underline disabled:opacity-60 ${
    quiet ? 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white' : 'border-0 text-white'
  }`
  const style = quiet ? undefined : { background: 'var(--color-redesign-button)' }
  const inner = (
    <>
      {I && <I className="size-3.5" aria-hidden="true" />}
      {children}
    </>
  )
  return to ? (
    <Link to={to} className={cls} style={style} onClick={press}>
      {inner}
    </Link>
  ) : (
    <button type={type} className={cls} style={style} disabled={disabled} aria-label={label} onClick={(e) => (press(e), onClick?.(e))}>
      {inner}
    </button>
  )
}

// The page heading row: title, a line under it, the page's actions.
// `tab` names the browser tab when it differs from the title (#153).
export const Head = ({ title, tab, sub, children }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <Heading title={tab ?? title} className="m-0 font-[family-name:var(--font-heading)] text-2xl font-bold tracking-tight">
        {title}
      </Heading>
      {sub && <p className={`m-0 mt-0.5 text-[15px] ${MUTED}`}>{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
)
