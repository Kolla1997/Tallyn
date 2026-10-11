import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
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

export default function Shell({ me, household, households, onChooseHousehold, children }) {
  const name = me?.display_name || 'You'
  const initial = name.trim().charAt(0).toUpperCase() || '·'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main">
        <img className="sidebar-logo" src={logo} alt="Tallyn" />
        <nav className="nav">
          {[...NAV, ['/settings', 'Settings', SettingsIcon]].map(([to, label, Icon]) => (
            <Link key={to} to={to}>
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {household && (
            <div className="household-box">
              <p className="small muted">Household</p>
              {households.length > 1 ? (
                <select aria-label="Household" value={household.id} onChange={(e) => onChooseHousehold(e.target.value)}>
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
          <Link to="/settings" className="me-chip">
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
            <span>
              <strong>{name}</strong>
              {household && <span className="small muted block">{household.role}</span>}
            </span>
          </Link>
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
