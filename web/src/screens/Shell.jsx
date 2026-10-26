import { useEffect, useRef, useState } from 'react'
import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
import mark from '../../../brand/logo/svg/tallyn-mark-light.svg'
import logoDark from '../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg'
import markDark from '../../../brand/logo/svg/tallyn-mark-dark.svg'
import { AccountsIcon, BudgetsIcon, DebtsIcon, FamilyIcon, GoalsIcon, HomeIcon, MenuIcon, SettingsIcon, TransactionsIcon } from '../components/Icons.jsx'
import { Link } from '../lib/router.jsx'
import Heading from '../components/Heading.jsx'
import ThemeSwitch from '../components/calm/ThemeSwitch.jsx'

// App layout (#39), in the calm redesign (#187): a floating frosted rail on web (1024px and up),
// collapsed by default; header and bottom tab bar on phones. One 1280px content width. Built from
// the #185 drafts (web/src/lab/calm/ui.jsx).
// The phone tab bar keeps these five; Debts (#27) and Goals are in the
// sidebar on web and in the ☰ menu on phones (Dinesh's choice). Budgets (#13)
// took Goals' place in the tab bar.
const NAV = [
  ['/', 'Home', HomeIcon],
  ['/accounts', 'Accounts', AccountsIcon],
  ['/transactions', 'Transactions', TransactionsIcon],
  ['/budgets', 'Budgets', BudgetsIcon],
  ['/family', 'Family', FamilyIcon],
]
const SIDEBAR = [
  ...NAV.slice(0, 4),
  ['/debts', 'Debts', DebtsIcon],
  ['/family', 'Family', FamilyIcon],
  ['/goals', 'Goals', GoalsIcon],
  ['/settings', 'Settings', SettingsIcon],
]

const SIDEBAR_KEY = 'tallyn.sidebar'

// The logo file for the theme (Logo Guide: the dark files on dark grounds, never recoloured).
const Logo = ({ light, dark, className }) => (
  <>
    <img className={`${className} dark:hidden`} src={light} alt="Tallyn" />
    <img className={`${className} hidden dark:block`} src={dark} alt="Tallyn" />
  </>
)

// Collapsed or expanded, remembered per device. Without a saved choice it
// starts collapsed (#187, Dinesh picked the rail).
function initialCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved) return saved === 'collapsed'
  } catch {
    // storage blocked: start collapsed
  }
  return true
}

const NAV_LINK =
  'group relative flex h-8 items-center gap-3 rounded-xl text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 no-underline transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:bg-zinc-800 aria-[current=page]:text-[var(--color-redesign-owe-text)]'
const MENU = 'absolute z-50 grid min-w-56 gap-0.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 text-[13px] shadow-xl'
const MENU_ITEM =
  'flex w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left font-semibold text-zinc-800 dark:text-zinc-100 no-underline hover:bg-zinc-100 dark:hover:bg-zinc-800 aria-checked:text-[var(--color-redesign-owe-text)]'
const Avatar = ({ initial, size = 'size-7' }) => (
  <span
    className={`flex ${size} shrink-0 items-center justify-center rounded-full text-xs font-bold text-white`}
    style={{ background: 'var(--color-redesign-accent)' }}
    aria-hidden="true"
  >
    {initial}
  </span>
)

function isTyping(el) {
  return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

export default function Shell({ me, household, households, onChooseHousehold, onSignOut, children }) {
  const name = me?.display_name || 'You'
  const initial = name.trim().charAt(0).toUpperCase() || '·'
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const toggle = (next = !collapsed) => {
    setCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded')
    } catch {
      // only a convenience
    }
  }

  // "[" toggles the sidebar, unless you're typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return
      e.preventDefault()
      setCollapsed((c) => {
        try {
          localStorage.setItem(SIDEBAR_KEY, c ? 'expanded' : 'collapsed')
        } catch {
          // only a convenience
        }
        return !c
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="calm-page min-h-svh">
      <a className="skip-link text-zinc-900 dark:text-white" href="#main">
        Skip to content
      </a>
      <aside
        id="sidebar"
        aria-label="Main"
        className={`calm-glass fixed top-3 bottom-3 left-3 z-40 hidden flex-col rounded-3xl p-3 lg:flex ${collapsed ? 'w-[60px] items-center' : 'w-[208px]'}`}
      >
        {/* Logo, with Collapse beside it (#72). */}
        <div className={`mb-4 flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between pl-2'}`}>
          {collapsed ? <Logo light={mark} dark={markDark} className="size-8" /> : <Logo light={logo} dark={logoDark} className="h-7" />}
          <button
            className="flex size-8 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-zinc-500 dark:text-zinc-400 transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
            onClick={() => toggle()}
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar  [' : 'Collapse sidebar  ['}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              {/* Double chevrons, no circle around them (#122): » to expand (R3), « to collapse (E1). */}
              {collapsed ? <path d="m6 6 6 6-6 6M12 6l6 6-6 6" /> : <path d="m18 6-6 6 6 6M12 6l-6 6 6 6" />}
            </svg>
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {SIDEBAR.map(([to, label, Icon]) => (
            <Link key={to} to={to} className={`${NAV_LINK} ${collapsed ? 'w-[42px] justify-center' : 'px-3'}`}>
              <Icon width={18} height={18} />
              {collapsed ? (
                // The name, on hover and on keyboard focus, beside the icon.
                <span className="pointer-events-none absolute left-full z-50 ml-3 rounded-md bg-zinc-900 dark:bg-white px-2 py-1 text-[12px] whitespace-nowrap text-white dark:text-zinc-900 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {label}
                </span>
              ) : (
                <span>{label}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className={`mt-auto flex flex-col gap-2 ${collapsed ? 'items-center' : ''}`}>
          <div className={collapsed ? '' : 'px-1'}>
            <ThemeSwitch stacked={collapsed} />
          </div>
          <ProfileMenu
            name={name}
            initial={initial}
            household={household}
            households={households}
            onChooseHousehold={onChooseHousehold}
            onSignOut={onSignOut}
            collapsed={collapsed}
          />
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 lg:hidden">
        <Logo light={logo} dark={logoDark} className="h-7" />
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <MobileMenu name={name} initial={initial} household={household} onSignOut={onSignOut} />
        </div>
      </header>
      {/* No footer in the signed-in app (#122): Terms and Privacy are in
          the profile menu, the ☰ menu on phones, and Settings → Legal. */}
      <main id="main" className={`px-4 pt-5 pb-24 md:px-6 lg:pr-6 lg:pb-12 ${collapsed ? 'lg:pl-[92px]' : 'lg:pl-[240px]'}`}>
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>

      <nav
        aria-label="Main"
        className="tabbar fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/90 backdrop-blur lg:hidden"
      >
        {NAV.map(([to, label, Icon]) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 no-underline aria-[current=page]:text-zinc-900 dark:aria-[current=page]:text-white"
          >
            <Icon width={20} height={20} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

// The profile card at the bottom of the sidebar (#72, option A): you, your
// role and household. It opens a menu to switch household (when you're in
// more than one) or sign out. Settings is in the main menu above. Esc or a click outside closes
// it, and focus goes back to the card.
function ProfileMenu({ name, initial, household, households, onChooseHousehold, onSignOut, collapsed }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const button = useRef(null)
  const ROLE = { owner: 'Owner', adult: 'Adult', teen: 'Teen', child: 'Child', viewer: 'Viewer' }
  const role = household ? (ROLE[household.role] ?? household.role) : ''
  const summary = household ? `${role} · ${household.name}` : 'No household yet'

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => box.current && !box.current.contains(e.target) && close(false)
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Move focus into the menu so keyboard users land on the first choice.
    box.current?.querySelector('[role="menuitem"], [role="menuitemradio"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Up and Down move between choices.
  const onMenuKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...box.current.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')]
    const i = items.indexOf(document.activeElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div className="relative" ref={box}>
      <button
        ref={button}
        className={`profile-card flex h-12 items-center gap-2.5 rounded-2xl border-0 bg-transparent p-0 text-left text-zinc-900 dark:text-white transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${collapsed ? 'w-[42px] justify-center' : 'w-full px-2'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `${name}, ${summary}. Open menu` : undefined}
        title={collapsed && !open ? name : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar initial={initial} />
        {!collapsed && (
          <>
            <span className="min-w-0 grow leading-tight">
              <strong className="block truncate text-[13px]">{name}</strong>
              <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">{summary}</span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
            </svg>
          </>
        )}
      </button>
      {open && (
        <div className={`${MENU} bottom-full left-0 mb-2`} role="menu" aria-label="Your account" onKeyDown={onMenuKey}>
          {households?.length > 1 && (
            <>
              <p className="px-2.5 pt-1 text-[12px] text-zinc-500 dark:text-zinc-400" aria-hidden="true">
                Household
              </p>
              {households.map((h) => (
                <button
                  key={h.id}
                  role="menuitemradio"
                  aria-checked={h.id === household?.id}
                  className={MENU_ITEM}
                  onClick={() => {
                    onChooseHousehold(h.id)
                    close()
                  }}
                >
                  <span className="grow">{h.name}</span>
                  {h.id === household?.id && <span aria-hidden="true">✓</span>}
                </button>
              ))}
              <hr className="my-1 border-zinc-100 dark:border-zinc-800" />
            </>
          )}
          <button role="menuitem" className={MENU_ITEM} onClick={onSignOut}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
            </svg>
            Sign out
          </button>
          <hr className="my-1 border-zinc-100 dark:border-zinc-800" />
          <LegalLinks />
        </div>
      )}
    </div>
  )
}

// Phones (#27): a ☰ button in the header opening Debts, Settings, who you
// are, and Sign out. Esc or a tap outside closes it; focus returns to ☰.
function MobileMenu({ name, initial, household, onSignOut }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const button = useRef(null)
  const ROLE = { owner: 'Owner', adult: 'Adult', teen: 'Teen', child: 'Child', viewer: 'Viewer' }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => box.current && !box.current.contains(e.target) && close(false)
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    box.current?.querySelector('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onMenuKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...box.current.querySelectorAll('[role="menuitem"]')]
    const i = items.indexOf(document.activeElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div className="relative" ref={box}>
      <button
        ref={button}
        className="flex size-10 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-transparent p-0 text-zinc-900 dark:text-white"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <MenuIcon />
      </button>
      {open && (
        <div className={`${MENU} top-full right-0 mt-2`} role="menu" aria-label="More" onKeyDown={onMenuKey}>
          <Link to="/debts" role="menuitem" className={MENU_ITEM} onClick={() => close(false)}>
            <DebtsIcon width={18} height={18} />
            Debts
          </Link>
          <Link to="/goals" role="menuitem" className={MENU_ITEM} onClick={() => close(false)}>
            <GoalsIcon width={18} height={18} />
            Goals
          </Link>
          <Link to="/settings" role="menuitem" className={MENU_ITEM} onClick={() => close(false)}>
            <SettingsIcon width={18} height={18} />
            Settings
          </Link>
          <hr className="my-1 border-zinc-100 dark:border-zinc-800" />
          <p className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar initial={initial} />
            <span className="min-w-0 grow leading-tight">
              <strong className="block truncate text-[13px]">{name}</strong>
              <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                {household ? `${ROLE[household.role] ?? household.role} · ${household.name}` : 'No household yet'}
              </span>
            </span>
          </p>
          <button role="menuitem" className={MENU_ITEM} onClick={onSignOut}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
            </svg>
            Sign out
          </button>
          <hr className="my-1 border-zinc-100 dark:border-zinc-800" />
          <LegalLinks />
        </div>
      )}
    </div>
  )
}

// One page's heading row: title, optional line under it, and actions.
// `tab` names the browser tab when it differs from the title (#153).
export function PageHead({ title, tab, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <Heading title={tab ?? title}>{title}</Heading>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}

// Terms and Privacy, as one quiet line at the bottom of the profile and ☰
// menus (#122, Dinesh picked M2). They open in a new tab. Plain paths, not
// lib/legal.js, so the documents' text stays out of the first download (#99).
function LegalLinks() {
  return (
    <p className="px-2.5 py-1.5 text-[12px] text-zinc-500 dark:text-zinc-400 [&_a]:text-zinc-600 [&_a]:underline [&_a]:underline-offset-2">
      <a role="menuitem" href="/terms" target="_blank" rel="noopener">
        Terms of Service
      </a>
      <span aria-hidden="true"> · </span>
      <a role="menuitem" href="/privacy" target="_blank" rel="noopener">
        Privacy Policy
      </a>
    </p>
  )
}
