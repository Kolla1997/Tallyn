// Redesign preview (#187): renders real app components with made-up props and no server, through
// the app's own stylesheet, so each moved screen can be checked before it ships. Dev only.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTokens } from './lib/tokens.js'
import './fonts.css'
import './app.css'
import Shell, { PageHead } from './screens/Shell.jsx'

applyTokens()

const me = { display_name: 'Maya' }
const household = { id: 'h1', name: 'The Rivera family', role: 'owner' }

function Preview() {
  return (
    <Shell me={me} household={household} households={[household]} onChooseHousehold={() => {}} onSignOut={() => {}}>
      <PageHead title="Home" sub="The shell only: screens move one by one (#187)" />
      <section className="calm-glass rounded-2xl p-4">
        <p className="text-[13px] text-zinc-600">A frosted summary card (glass Mix).</p>
      </section>
      <section className="calm-solid mt-3 rounded-2xl p-4">
        <ul className="text-[13px] text-zinc-600">
          <li>A solid card that holds a list.</li>
        </ul>
      </section>
    </Shell>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
