import { useEffect, useRef, useState } from 'react'
import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
import mark from '../../../brand/logo/svg/tallyn-mark-light.svg'
import { AccountsIcon, BudgetsIcon, DebtsIcon, FamilyIcon, GoalsIcon, HomeIcon, MenuIcon, SettingsIcon, TransactionsIcon } from '../components/Icons.jsx'
import { Link } from '../lib/router.jsx'

// App layout (#39): sidebar on web (1024px and up), header and bottom tab bar
// on phones. Matches docs/03 Design/Comps/web-*-draft.html.
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

// Collapsed or expanded, remembered per device. Without a saved choice,
// medium screens (under 1280px) start collapsed to give the cards room.
function initialCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved) return saved === 'collapsed'
  } catch {
    // storage blocked: fall back to the screen size
  }
  return window.innerWidth < 1280
}

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
    <div className={collapsed ? 'app-shell is-collapsed' : 'app-shell'}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside id="sidebar" className="sidebar" aria-label="Main">
        {/* Logo, with Collapse beside it (#72). */}
        <div className="sidebar-top">
          {collapsed ? <img className="sidebar-mark" src={mark} alt="Tallyn" /> : <img className="sidebar-logo" src={logo} alt="Tallyn" />}
          <button
            className="sidebar-toggle"
            onClick={() => toggle()}
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-tip={collapsed ? 'Expand sidebar' : undefined}
            title={collapsed ? undefined : 'Collapse sidebar  ['}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              {/* Double chevrons, no circle around them (#122): » to expand
                  (Dinesh picked R3), « to collapse (E1). */}
              {collapsed ? <path d="m6 6 6 6-6 6M12 6l6 6-6 6" /> : <path d="m18 6-6 6 6 6M12 6l-6 6 6 6" />}
            </svg>
          </button>
        </div>
        <nav className="nav">
          {SIDEBAR.map(([to, label, Icon]) => (
            <Link key={to} to={to} data-tip={collapsed ? label : undefined}>
              <Icon />
              <span className={collapsed ? 'sr-only' : undefined}>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
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

      <div className="app-main">
        <header className="mobile-header">
          <img src={logo} alt="Tallyn" />
          <MobileMenu name={name} initial={initial} household={household} onSignOut={onSignOut} />
        </header>
        {/* No footer in the signed-in app (#122): Terms and Privacy are in
            the profile menu, the ☰ menu on phones, and Settings → Legal. */}
        <main id="main" className="content">
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(([to, label, Icon]) => (
          <Link key={to} to={to}>
            <Icon width={22} height={22} />
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
    <div className={collapsed ? 'profile is-collapsed' : 'profile'} ref={box}>
      <button
        ref={button}
        className="profile-card"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `${name}, ${summary}. Open menu` : undefined}
        data-tip={collapsed && !open ? name : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="grow profile-text">
              <strong className="block">{name}</strong>
              <span className="small muted block">{summary}</span>
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
        <div className="profile-menu" role="menu" aria-label="Your account" onKeyDown={onMenuKey}>
          {households?.length > 1 && (
            <>
              <p className="profile-menu-label small muted" aria-hidden="true">
                Household
              </p>
              {households.map((h) => (
                <button
                  key={h.id}
                  role="menuitemradio"
                  aria-checked={h.id === household?.id}
                  className="profile-item"
                  onClick={() => {
                    onChooseHousehold(h.id)
                    close()
                  }}
                >
                  <span className="grow">{h.name}</span>
                  {h.id === household?.id && <span aria-hidden="true">✓</span>}
                </button>
              ))}
              <hr />
            </>
          )}
          <button role="menuitem" className="profile-item" onClick={onSignOut}>
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
          <hr />
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
    <div className="mobile-menu" ref={box}>
      <button ref={button} className="menu-button" aria-haspopup="menu" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>
        <MenuIcon />
      </button>
      {open && (
        <div className="mobile-menu-list" role="menu" aria-label="More" onKeyDown={onMenuKey}>
          <Link to="/debts" role="menuitem" className="profile-item" onClick={() => close(false)}>
            <DebtsIcon width={18} height={18} />
            Debts
          </Link>
          <Link to="/goals" role="menuitem" className="profile-item" onClick={() => close(false)}>
            <GoalsIcon width={18} height={18} />
            Goals
          </Link>
          <Link to="/settings" role="menuitem" className="profile-item" onClick={() => close(false)}>
            <SettingsIcon width={18} height={18} />
            Settings
          </Link>
          <hr />
          <p className="mobile-menu-me">
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="grow">
              <strong className="block">{name}</strong>
              <span className="small muted block">{household ? `${ROLE[household.role] ?? household.role} · ${household.name}` : 'No household yet'}</span>
            </span>
          </p>
          <button role="menuitem" className="profile-item" onClick={onSignOut}>
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
          <hr />
          <LegalLinks />
        </div>
      )}
    </div>
  )
}

// One page's heading row: title, optional line under it, and actions.
export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
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
    <p className="menu-legal">
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
