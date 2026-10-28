// Redesign preview (#187): the real signed-in app (Home and every page, the real shell and
// router) with made-up data and no server, through the app's own stylesheet. Dev only.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setTheme, startTheme } from './lib/theme.js'
import { fakeApi } from './preview/fakeApi.js'
import './fonts.css'
import './app.css'
import Home from './screens/Home.jsx'
import AuthPage from './components/AuthPage.jsx'
import SignIn from './screens/SignIn.jsx'

globalThis.__tallynPreviewApi = fakeApi
// Open /preview.html?p=accounts to start on a page; the app's router then takes over.
// Add &t=dark or &t=light to open in that theme.
const query = new URLSearchParams(location.search)
const start = query.get('p')
const theme = query.get('t')
history.replaceState(null, '', start === 'signin' ? '/' : `/${start && start !== 'home' ? start : ''}`)
if (theme === 'dark' || theme === 'light') setTheme(theme)
else startTheme()

// ?p=signin shows the sign-in screen in its page frame instead.
const signIn = start === 'signin'
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {signIn ? (
      <AuthPage>
        <SignIn />
      </AuthPage>
    ) : (
      <Home email="maya.rivera@fastmail.com" onSignOut={() => {}} />
    )}
  </StrictMode>,
)
