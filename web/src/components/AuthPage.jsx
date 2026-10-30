import logo from '../../../brand/coinroof/logo/svg/coinroof-lockup-plain-light.svg'
import logoDark from '../../../brand/coinroof/logo/svg/coinroof-lockup-plain-dark.svg'
import ThemeSwitch from './calm/ThemeSwitch.jsx'
import { Link } from '../lib/router.jsx'

// Centered single-card layout with the logo (the calm look, #187, from app.css .calm-auth): sign-in, 2FA, joining a
// household, creating your first household, and full-page errors.
// `centred` puts the card in the middle of the page (the 2FA screens, #108).
export default function AuthPage({ children, wide = false, centred = false }) {
  return (
    <main className={`page calm-page calm-auth${wide ? ' page-wide' : ''}${centred ? ' page-centred' : ''}`}>
      <ThemeSwitch className="fixed top-4 right-4 z-10" />
      <img className="logo dark:hidden" src={logo} alt="Coinroof" />
      <img className="logo hidden dark:block" src={logoDark} alt="Coinroof" />
      {children}
      <SiteFooter />
    </main>
  )
}

// The page footer (#220, Dinesh picked B from the footer drafts, with the brand tile bigger):
// frosted tiles in a grid. A tall tile with the Coinroof lockup and "It all adds up."; the launch
// page's sections; Create an account; Terms of Service; Privacy Policy (#36); the copyright.
// `onSignUp` opens sign-up in the card on the launch page; elsewhere the button goes home.
// On the launch page a section link scrolls there smoothly instead of reloading the page; from other
// pages it opens the launch page at that section. Reduced motion jumps.
function toSection(e) {
  const id = e.currentTarget.hash.slice(1)
  const el = location.pathname === '/' && document.getElementById(id)
  if (!el) return
  e.preventDefault()
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

export function SiteFooter({ onSignUp }) {
  return (
    <footer className="site-footer tile-footer">
      <div className="tile-footer-brand calm-glass">
        <img className="dark:hidden" src={logo} alt="Coinroof" />
        <img className="hidden dark:block" src={logoDark} alt="Coinroof" />
        <span className="site-footer-tag">It all adds up.</span>
      </div>
      <nav className="calm-glass tile-footer-links" aria-label="About Coinroof">
        <a href="/#about-h" onClick={toSection}>
          About
        </a>
        <a href="/#features-h" onClick={toSection}>
          What it does
        </a>
        <a href="/#safe-h" onClick={toSection}>
          Your money stays yours
        </a>
      </nav>
      <div className="calm-glass tile-footer-cta">
        {onSignUp ? (
          <button type="button" onClick={onSignUp}>
            Create an account
          </button>
        ) : (
          <Link to="/">Create an account</Link>
        )}
      </div>
      <div className="calm-glass">
        <Link to="/terms">Terms of Service</Link>
      </div>
      <div className="calm-glass">
        <Link to="/privacy">Privacy Policy</Link>
      </div>
      <div className="calm-glass tile-footer-copy">© {new Date().getFullYear()} Coinroof</div>
    </footer>
  )
}
