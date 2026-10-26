import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
import wordmark from '../../../brand/logo/svg/tallyn-wordmark-light.svg'
import logoDark from '../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg'
import wordmarkDark from '../../../brand/logo/svg/tallyn-wordmark-dark.svg'
import ThemeSwitch from './calm/ThemeSwitch.jsx'
import { Link } from '../lib/router.jsx'

// Centered single-card layout with the logo (the calm look, #187, from app.css .calm-auth): sign-in, 2FA, joining a
// household, creating your first household, and full-page errors.
// `centred` puts the card in the middle of the page (the 2FA screens, #108).
export default function AuthPage({ children, wide = false, centred = false }) {
  return (
    <main className={`page calm-page calm-auth${wide ? ' page-wide' : ''}${centred ? ' page-centred' : ''}`}>
      <ThemeSwitch className="fixed top-4 right-4 z-10" />
      <img className="logo dark:hidden" src={logo} alt="Tallyn" />
      <img className="logo hidden dark:block" src={logoDark} alt="Tallyn" />
      {children}
      <SiteFooter />
    </main>
  )
}

// The page footer (#25, option B): Tallyn and the tagline, then the Terms of
// Service and Privacy Policy (#36). At the very bottom of every screen.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="site-footer-brand">
        {/* The wordmark file, never retyped (Logo Guide). */}
        <img className="dark:hidden" src={wordmark} alt="Tallyn" height="20" />
        <img className="hidden dark:block" src={wordmarkDark} alt="Tallyn" height="20" />
        <span>· It all adds up.</span>
      </span>
      <nav aria-label="Legal" className="flex gap-3">
        <Link to="/terms">Terms of Service</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </nav>
    </footer>
  )
}
