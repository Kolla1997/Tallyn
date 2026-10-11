import { useEffect, useRef, useState } from 'react'
import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
import mark from '../../../brand/logo/svg/tallyn-mark-light.svg'
import { AccountsIcon, FamilyIcon, GoalsIcon, HomeIcon, SettingsIcon, TransactionsIcon } from '../components/Icons.jsx'
import { Link } from '../lib/router.jsx'

// App layout (#39): sidebar on web (1024px and up), header and bottom tab bar
// on phones. Matches docs/03 Design/Comps/web-*-draft.html.
const NAV = [
  ['/', 'Home', HomeIcon],
  ['/accounts', 'Accounts', AccountsIcon],
  ['/transactions', 'Transactions', TransactionsIcon],
  ['/family', 'Family', FamilyIcon],
  ['/goals', 'Goals', GoalsIcon],
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

export default function Shell({ me, household, households, onChooseHousehold, children }) {
  const name = me?.display_name || 'You'
  const initial = name.trim().charAt(0).toUpperCase() || '·'
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const householdSelect = useRef(null)

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

  // From the collapsed household circle: expand, then focus the switcher.
  const openHousehold = () => {
    toggle(false)
    setTimeout(() => householdSelect.current?.focus(), 250)
  }

  return (
    <div className={collapsed ? 'app-shell is-collapsed' : 'app-shell'}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside id="sidebar" className="sidebar" aria-label="Main">
        {collapsed ? (
          <img className="sidebar-mark" src={mark} alt="Tallyn" />
        ) : (
          <img className="sidebar-logo" src={logo} alt="Tallyn" />
        )}
        <nav className="nav">
          {[...NAV, ['/settings', 'Settings', SettingsIcon]].map(([to, label, Icon]) => (
            <Link key={to} to={to} data-tip={collapsed ? label : undefined}>
              <Icon />
              <span className={collapsed ? 'sr-only' : undefined}>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {household && collapsed && (
            <button className="household-dot" data-tip={household.name} onClick={openHousehold} aria-label={`Household: ${household.name}`}>
              {household.name.trim().charAt(0).toUpperCase()}
            </button>
          )}
          {household && !collapsed && (
            <div className="household-box">
              <p className="small muted">Household</p>
              {households.length > 1 ? (
                <select ref={householdSelect} aria-label="Household" value={household.id} onChange={(e) => onChooseHousehold(e.target.value)}>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p>
                  <strong>{household.name}</strong>
                </p>
              )}
            </div>
          )}
          <Link to="/settings" className="me-chip" data-tip={collapsed ? name : undefined} aria-label={collapsed ? `Settings for ${name}` : undefined}>
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
            {!collapsed && (
              <span>
                <strong>{name}</strong>
                {household && <span className="small muted block">{household.role}</span>}
              </span>
            )}
          </Link>
          <button
            className="sidebar-toggle"
            onClick={() => toggle()}
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar  [' : 'Collapse sidebar  ['}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              {collapsed ? <path d="m9 6 6 6-6 6M4 6v12" /> : <path d="m15 6-6 6 6 6M20 6v12" />}
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <img src={logo} alt="Tallyn" />
          <Link to="/settings" className="me-chip" aria-label="Settings">
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
          </Link>
        </header>
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
