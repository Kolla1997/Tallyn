import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
import wordmark from '../../../brand/logo/svg/tallyn-wordmark-light.svg'
import { Link } from '../lib/router.jsx'

// Centered single-card layout with the logo: sign-in, 2FA, joining a
// household, creating your first household, and full-page errors.
export default function AuthPage({ children, wide = false }) {
  return (
    <main className={wide ? 'page page-wide' : 'page'}>
      <img className="logo" src={logo} alt="Tallyn" />
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
        <img src={wordmark} alt="Tallyn" height="20" />
        <span>· It all adds up.</span>
      </span>
      <nav aria-label="Legal">
        <Link to="/terms">Terms of Service</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/privacy">Privacy Policy</Link>
      </nav>
    </footer>
  )
}
