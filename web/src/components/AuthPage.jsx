import logo from '../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg'

// Centered single-card layout with the logo: sign-in, 2FA, joining a
// household, creating your first household, and full-page errors.
export default function AuthPage({ children }) {
  return (
    <main className="page">
      <img className="logo" src={logo} alt="Tallyn" />
      {children}
    </main>
  )
}
