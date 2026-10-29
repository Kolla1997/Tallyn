import logo from '../../../brand/coinroof/logo/svg/coinroof-lockup-plain-light.svg'
import wordmark from '../../../brand/coinroof/logo/svg/coinroof-wordmark-ink.svg'
import logoDark from '../../../brand/coinroof/logo/svg/coinroof-lockup-plain-dark.svg'
import wordmarkDark from '../../../brand/coinroof/logo/svg/coinroof-wordmark-white.svg'
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

// The page footer (#25, option B): the Coinroof wordmark (#200) and the tagline, then the Terms of
// Service and Privacy Policy (#36). At the very bottom of every screen.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="site-footer-brand">
        {/* The wordmark file, never retyped (Logo Guide). */}
        <img className="dark:hidden" src={wordmark} alt="Coinroof" height="14" />
        <img className="hidden dark:block" src={wordmarkDark} alt="Coinroof" height="14" />
        <span>· It all adds up.</span>
      </span>
      <nav aria-label="Legal" className="flex gap-3">
        <Link to="/terms">Terms of Service</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </nav>
    </footer>
  )
}
