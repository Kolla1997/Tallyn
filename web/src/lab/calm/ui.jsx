// Shared pieces for the calm drafts of every screen (#185), taken from the calm Home (#182).
// Red, green, white, black; the original sidebar and phone tab bar; Tallyn's fonts and logo.
// Kokonut UI and Bklit components are used by the pages; anime.js only for press feedback.
import { useLayoutEffect, useState } from 'react'
import { animate } from 'animejs'
import {
  Home as HomeIcon,
  Landmark,
  PieChart,
  Users,
  ArrowLeftRight,
  Receipt as DebtsIcon,
  Target,
  Settings as SettingsIcon,
  Menu,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import * as D from '../home/data.js'
import lockupLight from '../../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg?url'
import lockupDark from '../../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg?url'
import markLight from '../../../../brand/logo/svg/tallyn-mark-light.svg?url'
import markDark from '../../../../brand/logo/svg/tallyn-mark-dark.svg?url'

export { lockupLight, lockupDark, markLight, markDark }
export const usd = D.usd

// One accent: red for the one action and for what is owed. Green for money in and progress.
// Text shades pass AA on their ground.
export const THEME = {
  light: { '--accent': '#dc2626', '--button': '#b91c1c', '--owe-text': '#b91c1c', '--in-text': '#15803d', '--in': '#16a34a', '--track': '#e4e4e7' },
  dark: { '--accent': '#dc2626', '--button': '#b91c1c', '--owe-text': '#f87171', '--in-text': '#4ade80', '--in': '#16a34a', '--track': '#3f3f46' },
}
const EASE = 'cubicBezier(0.23, 1, 0.32, 1)'
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
export const press = (e) => !reduced() && animate(e.currentTarget, { scale: [1, 0.97, 1], duration: 160, ease: EASE })

// ---- Building blocks ----
export const Panel = ({ title, meta, children, id, className = '' }) => (
  <section
    aria-labelledby={title ? id : undefined}
    className={`min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
  >
    {title && (
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="font-[family-name:'Space_Grotesk'] text-[15px] font-semibold text-zinc-900 dark:text-white">
          {title}
        </h2>
        {meta && <span className="text-[13px] text-zinc-500 dark:text-zinc-400">{meta}</span>}
      </header>
    )}
    {children}
  </section>
)
export const See = ({ children, href = '#' }) => (
  <a
    href={href}
    className="text-[13px] font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900 dark:text-white dark:decoration-zinc-600"
  >
    {children}
  </a>
)
export const Money = ({ v, className = '', style, digits = 2 }) => (
  <span className={`shrink-0 font-[family-name:'Space_Grotesk'] font-semibold whitespace-nowrap tabular-nums ${className}`} style={style}>
    {usd(v, digits)}
  </span>
)
export const Owed = ({ v, className = '' }) => <Money v={-Math.abs(v)} className={className} style={{ color: 'var(--owe-text)' }} />
export const Icon = ({ icon: I }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
    <I className="size-4" aria-hidden="true" />
  </span>
)
export const Badge = ({ text, tone }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: tone || '#3f3f46' }}>
    {text}
  </span>
)
export const Row = ({ icon, lead, name, sub, children }) => (
  <li className="flex items-center gap-3 py-2">
    {lead ?? (icon && <Icon icon={icon} />)}
    <span className="min-w-0 grow">
      <span className="block truncate text-sm font-semibold">{name}</span>
      {sub && <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{sub}</span>}
    </span>
    {children}
  </li>
)
export const Rows = ({ children }) => <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</ul>
export const Sub = ({ children }) => <h3 className="mt-3 mb-0.5 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{children}</h3>
export const Note = ({ children, className = '' }) => <p className={`text-[13px] text-zinc-500 dark:text-zinc-400 ${className}`}>{children}</p>

// A row of choices (whose money, kind of thing): one pressed at a time.
export function Chips({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([k, text]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className="h-8 rounded-full border border-zinc-200 px-3 text-[13px] font-semibold text-zinc-600 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:border-zinc-700 dark:text-zinc-300 dark:aria-pressed:border-white dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export const Button = ({ children, icon: I, quiet, danger, onClick, small }) => (
  <button
    type="button"
    onClick={(e) => (press(e), onClick?.(e))}
    className={`inline-flex ${small ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm'} items-center gap-2 rounded-full font-semibold ${
      quiet ? 'border border-zinc-300 dark:border-zinc-700' : danger ? 'border border-red-300 text-[var(--owe-text)] dark:border-red-900' : 'text-white'
    }`}
    style={quiet || danger ? undefined : { background: 'var(--button)' }}
  >
    {I && <I className="size-4" aria-hidden="true" />}
    {children}
  </button>
)

// The page heading row, as PageHead in the app: title, one line under it, the page's actions.
export const PageHead = ({ title, sub, children }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="font-[family-name:'Space_Grotesk'] text-2xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
)

// ---- The original sidebar (Shell.jsx): only the colours are new ----
export const SIDEBAR = [
  ['home', 'Home', HomeIcon],
  ['accounts', 'Accounts', Landmark],
  ['transactions', 'Transactions', ArrowLeftRight],
  ['budgets', 'Budgets', PieChart],
  ['debts', 'Debts', DebtsIcon],
  ['family', 'Family', Users],
  ['goals', 'Goals', Target],
  ['settings', 'Settings', SettingsIcon],
]
const TABS = ['home', 'accounts', 'transactions', 'budgets', 'family']

function Sidebar({ dark, collapsed, onToggle, page, go }) {
  return (
    <aside
      aria-label="Main"
      className={`fixed top-[52px] bottom-3 left-3 z-40 hidden flex-col rounded-3xl border border-zinc-200 bg-white p-3 lg:flex dark:border-zinc-800 dark:bg-zinc-900 ${collapsed ? 'w-[60px] items-center' : 'w-[208px]'}`}
    >
      <div className={`mb-4 flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between pl-2'}`}>
        {collapsed ? (
          <img src={dark ? markDark : markLight} alt="Tallyn" className="size-8" />
        ) : (
          <img src={dark ? lockupDark : lockupLight} alt="Tallyn" className="h-7" />
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          {collapsed ? <ChevronsRight className="size-4" aria-hidden="true" /> : <ChevronsLeft className="size-4" aria-hidden="true" />}
        </button>
      </div>
      <nav className="flex flex-col gap-1">
        {SIDEBAR.map(([key, label, I]) => (
          <a
            key={key}
            href={`?p=${key}`}
            onClick={(e) => (e.preventDefault(), go(key))}
            aria-current={key === page ? 'page' : undefined}
            className={`group relative flex h-10 items-center gap-3 rounded-xl text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white font-semibold text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 aria-[current=page]:bg-zinc-100 aria-[current=page]:text-[var(--owe-text)] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:aria-[current=page]:bg-zinc-800 ${collapsed ? 'w-[42px] justify-center' : 'px-3'}`}
          >
            <I className="size-[18px] shrink-0" aria-hidden="true" />
            {collapsed ? (
              // A label you can always get at: on hover and on keyboard focus, beside the icon.
              <span className="pointer-events-none absolute left-full z-50 ml-3 rounded-md bg-zinc-900 px-2 py-1 text-[12px] whitespace-nowrap text-white opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-white dark:text-zinc-900">
                {label}
              </span>
            ) : (
              <span>{label}</span>
            )}
          </a>
        ))}
      </nav>
      <button
        type="button"
        aria-label="Maya Rivera, owner of The Rivera family. Open profile menu"
        className={`mt-auto flex h-12 items-center gap-2.5 rounded-2xl text-left transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${collapsed ? 'w-[42px] justify-center' : 'px-2'}`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
          M
        </span>
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-semibold">Maya Rivera</span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">Owner · The Rivera family</span>
          </span>
        )}
      </button>
    </aside>
  )
}

// The signed-in shell: draft bar (page switcher, Light/Dark), sidebar, phone header and tab bar.
export function Shell({ page, pages, go, dark, setDark, children, bare = false }) {
  const q = new URLSearchParams(location.search)
  // Rail, collapsed by default (#185, Dinesh picked it). ?nav=expanded opens it.
  const [collapsed, setCollapsed] = useState(q.get('nav') !== 'expanded')
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.body.style.background = dark ? '#09090b' : '#fafafa'
  }, [dark])
  return (
    <div
      style={THEME[dark ? 'dark' : 'light']}
      data-compact
      className="min-h-svh bg-zinc-50 font-[family-name:Montserrat] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200 bg-white/90 px-4 py-2 text-[13px] text-zinc-600 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-400">
        <b className="text-zinc-900 dark:text-white">Draft for #185 · calm screens</b>
        <label className="flex items-center gap-2">
          <span className="sr-only">Screen</span>
          <select
            value={page}
            onChange={(e) => go(e.target.value)}
            className="h-8 rounded-full border border-zinc-300 bg-white px-3 font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          >
            {pages.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span>made-up names and amounts</span>
        <span className="ml-auto flex gap-1">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={v === dark}
              onClick={() => setDark(v)}
              className="rounded-full border border-zinc-300 px-3 py-1 font-semibold aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:border-zinc-700 dark:aria-pressed:border-white dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
            >
              {v ? 'Dark' : 'Light'}
            </button>
          ))}
        </span>
      </div>

      {bare ? (
        <main className="px-4 py-10">{children}</main>
      ) : (
        <>
          <Sidebar dark={dark} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} page={page} go={go} />
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 lg:hidden dark:border-zinc-800">
            <img src={dark ? lockupDark : lockupLight} alt="Tallyn" className="h-7" />
            <button
              type="button"
              aria-label="Menu"
              className="flex size-10 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </header>
          <main className={`px-4 pt-5 pb-24 md:px-6 lg:pb-12 lg:pr-6 ${collapsed ? 'lg:pl-[92px]' : 'lg:pl-[240px]'}`}>
            <div className="mx-auto max-w-[1180px]">{children}</div>
          </main>
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
          >
            {SIDEBAR.filter(([k]) => TABS.includes(k)).map(([k, n, I]) => (
              <a
                key={k}
                href={`?p=${k}`}
                onClick={(e) => (e.preventDefault(), go(k))}
                aria-current={k === page ? 'page' : undefined}
                className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-zinc-500 aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:aria-[current=page]:text-white"
              >
                <I className="size-5" aria-hidden="true" />
                {n}
              </a>
            ))}
          </nav>
        </>
      )}
    </div>
  )
}
