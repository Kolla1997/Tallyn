import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'
import { Link } from '../lib/router.jsx'

// Centered single-card layout with the logo: sign-in, 2FA, joining a
// household, creating your first household, and full-page errors.
export default function AuthPage({ children, wide = false }) {
  return (
    <main className={wide ? 'page page-wide' : 'page'}>
      <img className="logo" src={logo} alt="Tallyn" />
      {children}
      <LegalLinks />
    </main>
  )
}

// Links to the Terms of Service and Privacy Policy (#36), on every screen.
export function LegalLinks() {
  return (
    <p className="small muted legal-links">
      <Link to="/terms">Terms of Service</Link>
      <span aria-hidden="true"> · </span>
      <Link to="/privacy">Privacy Policy</Link>
    </p>
  )
}
