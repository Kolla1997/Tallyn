import { useEffect, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { api } from '../lib/api.js'
import { Link } from '../lib/router.jsx'
import { supabase } from '../lib/supabase.js'
import { PageHead } from './Shell.jsx'

// Settings (#39 step 5): sections on the left, the chosen one on the right,
// like Family. Everything here works today; what doesn't yet says so and
// names its ticket, so nothing pretends to work.

const SECTIONS = [
  ['profile', 'Profile'],
  ['security', 'Sign-in and security'],
  ['household', 'Household'],
  ['data', 'Your data'],
  ['notifications', 'Notifications'],
  ['legal', 'Legal'],
  ['leave', 'Leave or close'],
]
const ROLE_LABEL = { owner: 'Owner', adult: 'Adult', teen: 'Teen', child: 'Child', viewer: 'Viewer' }

const fromAddress = () => {
  const s = new URLSearchParams(window.location.search).get('section')
  return SECTIONS.some(([k]) => k === s) ? s : 'profile'
}

export default function Settings({ me, household, email, onSaved, onSignOut }) {
  const [section, setSection] = useState(fromAddress)

  // Keep the section in the address, so a link can open it and Back works.
  useEffect(() => {
    const url = `/settings?section=${section}`
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url)
  }, [section])

  return (
    <>
      <PageHead title="Settings" sub="Your profile, sign-in and household" />
      <div className="family-grid settings-grid">
        <nav className="panel family-list" aria-label="Settings sections">
          <ul className="rows">
            {SECTIONS.map(([key, label]) => (
              <li key={key}>
                <button
                  className={key === 'leave' ? 'family-person settings-danger' : 'family-person'}
                  aria-current={section === key ? 'true' : undefined}
                  onClick={() => setSection(key)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="family-detail">
          {section === 'profile' && <Profile me={me} email={email} onSaved={onSaved} />}
          {section === 'security' && <Security email={email} onSignOut={onSignOut} />}
          {section === 'household' && <Household household={household} />}
          {section === 'data' && <YourData />}
          {section === 'notifications' && <Notifications />}
          {section === 'legal' && <Legal />}
          {section === 'leave' && <LeaveOrClose me={me} household={household} />}
        </div>
      </div>
    </>
  )
}

function Section({ id, title, children }) {
  return (
    <section className="panel settings-section" aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

// One line in a section: a label with a note, and something on the right.
function Row({ label, note, children }) {
  return (
    <li className="settings-row">
      <span className="grow">
        <span className="name block">{label}</span>
        {note && <span className="small muted block">{note}</span>}
      </span>
      {children}
    </li>
  )
}

function Soon({ ticket }) {
  return (
    <span className="tag">
      Coming soon
      {ticket && (
        <>
          {' · '}
          <a href={`https://github.com/Kolla1997/Tallyn/issues/${ticket}`} target="_blank" rel="noreferrer">
            #{ticket}
          </a>
        </>
      )}
    </span>
  )
}

function Profile({ me, email, onSaved }) {
  const [name, setName] = useState(me?.display_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaved(false)
    try {
      await api('/api/me', { method: 'PUT', body: { display_name: name } })
      setSaved(true)
      onSaved()
    } catch {
      setError("We couldn't save your name.")
    }
  }

  return (
    <Section id="profile-h" title="Profile">
      <form onSubmit={save} className="settings-form">
        <label>
          Your name, as your family sees it
          <input
            value={name}
            maxLength={80}
            placeholder="Alex"
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <ul className="rows">
          <Row label="Email" note={email}>
            <button className="btn btn-secondary" type="submit">
              Save
            </button>
          </Row>
        </ul>
        {saved && (
          <p className="saved small" role="status">
            Saved. Your family now sees you as {name.trim() || 'your role'}.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Section>
  )
}

function Security({ email, onSignOut }) {
  const [factor, setFactor] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => setFactor(data?.totp?.find((f) => f.status === 'verified') ?? null))
  }, [])

  // Ends every other session for this account; this one stays signed in.
  async function signOutOthers() {
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) throw new Error("We couldn't sign out your other devices. Try again in a moment.")
    setDone(true)
  }

  return (
    <Section id="security-h" title="Sign-in and security">
      <ul className="rows">
        <Row label="Email" note={email} />
        <Row
          label="Two-step sign-in"
          note={
            factor
              ? `Authenticator app, added ${new Date(factor.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'Authenticator app'
          }
        >
          <span className="status-on small">On</span>
        </Row>
        <Row label="Change password" note="Also “forgot password” on the sign-in screen">
          <Soon ticket={22} />
        </Row>
        <Row label="Lost your authenticator?" note="Recovery codes, so you can still get in">
          <Soon ticket={23} />
        </Row>
        <Row label="Sign out of other devices" note={done ? 'Done. Only this device is signed in now.' : 'Phones, tablets and browsers other than this one'}>
          <button className="btn btn-secondary btn-small" onClick={() => setConfirming(true)}>
            Sign out others
          </button>
        </Row>
        <Row label="Sign out" note="Of this device">
          <button className="btn btn-secondary btn-small" onClick={onSignOut}>
            Sign out
          </button>
        </Row>
      </ul>
      {confirming && (
        <ConfirmDialog title="Sign out of other devices?" action="Sign out others" onConfirm={signOutOthers} onClose={() => setConfirming(false)}>
          <p>Every other phone, tablet and browser signed in to your account will need to sign in again. You&apos;ll stay signed in here.</p>
        </ConfirmDialog>
      )}
    </Section>
  )
}

function Household({ household }) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    if (!household) return
    api(`/api/households/${encodeURIComponent(household.id)}/members`).then(
      (d) => setCount(d.members.length),
      () => setCount(null),
    )
  }, [household])

  if (!household) {
    return (
      <Section id="household-h" title="Household">
        <p className="small muted">You&apos;re not in a household yet.</p>
      </Section>
    )
  }
  return (
    <Section id="household-h" title="Household">
      <ul className="rows">
        <Row label="Name" note={household.name}>
          {household.role === 'owner' && <Soon ticket={53} />}
        </Row>
        <Row label="Home currency" note={`${household.home_currency}. Totals in one currency come with conversion.`} />
        <Row label="Your role" note={ROLE_LABEL[household.role] ?? household.role} />
        <Row label="People" note={count == null ? '' : `${count} ${count === 1 ? 'member' : 'members'}`}>
          <Link to="/family" className="link small">
            Family
          </Link>
        </Row>
      </ul>
    </Section>
  )
}

function YourData() {
  return (
    <Section id="data-h" title="Your data">
      <p className="small muted">Tallyn reads balances and transactions from your banks. It can&apos;t move money.</p>
      <ul className="rows">
        <Row label="Connected banks" note="Link, check or unlink your banks">
          <Link to="/accounts" className="link small">
            Accounts
          </Link>
        </Row>
        <Row label="Who sees your money" note="Choose what each person sees">
          <Link to="/family" className="link small">
            Family
          </Link>
        </Row>
        <Row label="Download your data" note="Everything Tallyn holds about you">
          <Soon ticket={54} />
        </Row>
      </ul>
    </Section>
  )
}

function Notifications() {
  return (
    <Section id="notifications-h" title="Notifications">
      <ul className="rows">
        <Row label="Alerts" note="For example a big purchase, a low balance, or a bank that needs you to sign in again">
          <Soon ticket={55} />
        </Row>
      </ul>
    </Section>
  )
}

function Legal() {
  return (
    <Section id="legal-h" title="Legal">
      <ul className="rows">
        <Row label="Terms of Service">
          <Soon ticket={36} />
        </Row>
        <Row label="Privacy Policy">
          <Soon ticket={36} />
        </Row>
      </ul>
    </Section>
  )
}

function LeaveOrClose({ me, household }) {
  return (
    <Section id="leave-h" title="Leave or close">
      <ul className="rows">
        {household && (
          <Row label={`Leave ${household.name}`} note="You'll confirm with your name and a code from your authenticator app">
            <Link to={`/family?member=${me.user_id}`} className="link small danger-link">
              Leave
            </Link>
          </Row>
        )}
        <Row label="Close your Tallyn account" note="Removes your banks, transactions and sign-in">
          <Soon ticket={56} />
        </Row>
      </ul>
    </Section>
  )
}
