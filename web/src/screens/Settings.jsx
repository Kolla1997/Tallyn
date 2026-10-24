import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { PhoneIcon } from '../components/Icons.jsx'
import { api, apiFile } from '../lib/api.js'
import { LEGAL } from '../lib/legal.js'
import { verifiedAuthenticators } from '../lib/mfa.js'
import { Link } from '../lib/router.jsx'
import { rememberSignOutNote, signOutHere } from '../lib/session.js'
import { supabase } from '../lib/supabase.js'
import { SaveBackupCodes } from './BackupCodes.jsx'
import CodeForm from './CodeForm.jsx'
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
          {section === 'leave' && <LeaveOrClose me={me} household={household} email={email} />}
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

// Not built yet. `ticket` is the issue that builds it: for us reading the
// code, never shown to people (Settings showed GitHub links until #36's fix).
// eslint-disable-next-line no-unused-vars
function Soon({ ticket }) {
  return <span className="tag">Coming soon</span>
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
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

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
        <Authenticators />
        <BackupCodesRow email={email} />
        <Row label="Change password" note="Also “forgot password” on the sign-in screen">
          <Soon ticket={22} />
        </Row>
        <Row label="Sign out of other devices" note={done ? 'Done. Only this device is signed in now.' : 'Phones, tablets and browsers other than this one'}>
          <button className="btn btn-secondary btn-small" onClick={() => setConfirming(true)}>
            Sign out others
          </button>
        </Row>
        <Row label="Sign out" note="Everywhere you’re signed in">
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

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// Your authenticators (#23, Dinesh picked A): each with the name you gave it
// and Remove, plus Add another. Never the last one: 2FA stays on.
function Authenticators() {
  const [list, setList] = useState(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [error, setError] = useState('')

  const load = () =>
    verifiedAuthenticators().then(
      (l) => setList(l),
      () => setError("We couldn't load your authenticators. Try again in a moment."),
    )
  useEffect(() => {
    load()
  }, [])

  async function remove() {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: removing.id })
    if (error) throw new Error("We couldn't remove it. Try again in a moment.")
    await load()
  }

  const count = list?.length ?? 0
  return (
    <li className="settings-row settings-row-wrap">
      <span className="grow">
        <span className="name block">Two-step sign-in</span>
        <span className="small muted block">{list ? (count === 1 ? '1 authenticator app' : `${count} authenticator apps`) : 'Authenticator app'}</span>
      </span>
      <span className="status-on small">On</span>
      <div className="auth-list">
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        <ul className="auth-items">
          {list?.map((f) => (
            <li key={f.id}>
              <span className="auth-icon">
                <PhoneIcon />
              </span>
              <span className="grow">
                <strong className="block">{f.friendly_name || 'Authenticator app'}</strong>
                <span className="small muted block">Added {shortDate(f.created_at)}</span>
              </span>
              {count > 1 ? (
                <button type="button" className="link-quiet" onClick={() => setRemoving(f)}>
                  Remove
                </button>
              ) : (
                <span className="small muted">Your only one</span>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary btn-small auth-add" onClick={() => setAdding(true)}>
          + Add another
        </button>
      </div>
      {adding && <AddAuthenticator names={list?.map((f) => f.friendly_name) ?? []} onAdded={load} onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.friendly_name || 'this authenticator'}?`}
          action="Remove"
          needsCode
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        >
          <p>Its codes will stop working for Tallyn. Your other authenticators and backup codes still work.</p>
        </ConfirmDialog>
      )}
    </li>
  )
}

// Backup codes (#23): how many are left, and a new set after a fresh code.
function BackupCodesRow({ email }) {
  const [status, setStatus] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [showing, setShowing] = useState(false)

  const load = () => api('/api/backup-codes').then(setStatus, () => setStatus(null))
  useEffect(() => {
    load()
  }, [])

  const note = !status
    ? 'For when you can’t use your authenticator'
    : status.total === 0
      ? 'None yet. Get a set for when you can’t use your authenticator'
      : `${status.left} of ${status.total} left · for when you can’t use your authenticator`

  return (
    <li className="settings-row">
      <span className="grow">
        <span className="name block">Backup codes</span>
        <span className="small muted block">{note}</span>
        {status?.total > 0 && (
          <span className="codes-meter" aria-hidden="true">
            {Array.from({ length: status.total }, (_, i) => (
              <i key={i} className={i < status.left ? 'on' : ''} />
            ))}
          </span>
        )}
      </span>
      {status && (
        <button className="btn btn-secondary btn-small" onClick={() => setConfirming(true)}>
          {status.total === 0 ? 'Get codes' : 'Regenerate'}
        </button>
      )}
      {confirming && (
        <ConfirmDialog
          title={status?.total === 0 ? 'Get backup codes?' : 'Get new backup codes?'}
          action="Continue"
          needsCode
          onConfirm={async () => setShowing(true)}
          onClose={() => setConfirming(false)}
        >
          <p>
            {status?.total === 0 ? 'You’ll see ten codes once, to save somewhere safe.' : 'Your current codes stop working, and you’ll see ten new ones once.'}
          </p>
        </ConfirmDialog>
      )}
      {showing && (
        <CodesDialog
          email={email}
          onClose={() => {
            setShowing(false)
            load()
          }}
        />
      )}
    </li>
  )
}

function CodesDialog({ email, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d.open) d.showModal()
    return () => d.open && d.close()
  }, [])
  return (
    <dialog ref={ref} className="dialog codes-dialog" aria-label="Your backup codes" onCancel={(e) => e.preventDefault()}>
      <SaveBackupCodes email={email} done="Done" onDone={onClose} />
    </dialog>
  )
}

// Add another authenticator (#23): a name, then the QR code, then a code from
// it. Supabase needs the name before it makes the QR code, so the name comes
// first. Cancelling removes the half-added one.
function AddAuthenticator({ names, onAdded, onClose }) {
  const ref = useRef(null)
  const [name, setName] = useState('')
  const [factor, setFactor] = useState(null) // { id, qr, secret }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d.open) d.showModal()
    return () => d.open && d.close()
  }, [])

  async function start(e) {
    e.preventDefault()
    const n = name.trim()
    if (names.some((x) => x?.toLowerCase() === n.toLowerCase())) {
      setError('You already have one with that name. Choose another.')
      return
    }
    setError('')
    setBusy(true)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Tallyn', friendlyName: n })
    setBusy(false)
    if (error) {
      setError("We couldn't start adding it. Try again in a moment.")
      return
    }
    const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`
    setFactor({ id: data.id, qr, secret: data.totp.secret })
  }

  async function cancel() {
    if (factor) await supabase.auth.mfa.unenroll({ factorId: factor.id })
    onClose()
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="add-auth-title" onCancel={(e) => (e.preventDefault(), cancel())}>
      <h2 id="add-auth-title">Add another authenticator</h2>
      {!factor ? (
        <form onSubmit={start}>
          <label>
            Give it a name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="1Password, Work phone…" autoFocus />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={cancel}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              Show the QR code
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted">In {name.trim()}, add an account and scan this code.</p>
          <img className="qr" src={factor.qr} alt="QR code to add Tallyn to your other authenticator app" />
          <p className="muted small">Can&apos;t scan it? Enter this key instead:</p>
          <p className="secret">{factor.secret}</p>
          <p className="muted">
            Then enter the <span className="nowrap">6-digit</span> code it shows.
          </p>
          <CodeForm
            factorIds={[factor.id]}
            button="Add"
            autoFocus={false}
            onVerified={async () => {
              await onAdded()
              onClose()
            }}
          />
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </dialog>
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

// Download your data (#54): a fresh code, then a ZIP of everything Tallyn
// holds about you. The server checks the code was entered just now.
const EXPORT_ERRORS = {
  too_many_requests: 'You can download your data 3 times an hour. Try again later.',
  reauth_required: 'That took a little long. Enter a new code and try again.',
}

async function downloadData() {
  let file
  try {
    file = await apiFile('/api/me/export', `tallyn-data-${new Date().toISOString().slice(0, 10)}.zip`)
  } catch (e) {
    throw new Error(EXPORT_ERRORS[e.message] ?? "We couldn't make your download. Try again in a moment.")
  }
  const url = URL.createObjectURL(file.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // some browsers cancel the download if it goes at once
}

function YourData() {
  const [confirming, setConfirming] = useState(false)
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
          <button className="btn btn-secondary btn-small" onClick={() => setConfirming(true)}>
            Download
          </button>
        </Row>
      </ul>
      {confirming && (
        <ConfirmDialog title="Download your data?" action="Download" needsCode onConfirm={downloadData} onClose={() => setConfirming(false)}>
          <p>
            You&apos;ll get a ZIP with your profile, banks, accounts, transactions, budgets and sharing choices. Only your own data: nothing others share with
            you. Keep it somewhere safe.
          </p>
        </ConfirmDialog>
      )}
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

// The Terms and the Privacy Policy (#36, Dinesh picked A): each row opens the
// page inside Tallyn, with the version underneath.
function Legal() {
  return (
    <Section id="legal-h" title="Legal">
      <ul className="rows">
        {[LEGAL.terms, LEGAL.privacy].map((doc) => (
          <li key={doc.path} className="settings-row">
            <Link to={doc.path} className="settings-link">
              <span className="grow">
                <span className="name block">{doc.title}</span>
                <span className="small muted block">Version {doc.version}</span>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// Close your account (#56, ADR 0015): type your email and a fresh code. The
// server unlinks your banks at Plaid, then deletes everything of yours.
const CLOSE_ERRORS = {
  last_owner: "You're the only owner of a household with other people in it. In Family, make someone else an owner first.",
  bank_service_error: "We couldn't disconnect one of your banks, so nothing else was deleted. Try again in a moment.",
  reauth_required: 'That took a little long. Enter a new code and try again.',
  email_mismatch: "That email doesn't match your account.",
}

async function closeAccount(email) {
  try {
    await api('/api/me/close', { method: 'POST', body: { email } })
  } catch (e) {
    throw new Error(CLOSE_ERRORS[e.message] ?? "We couldn't close your account. Try again in a moment.")
  }
  rememberSignOutNote('closed')
  await signOutHere()
}

function LeaveOrClose({ me, household, email }) {
  const [closing, setClosing] = useState(false)
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
          <button className="link small danger-link" onClick={() => setClosing(true)}>
            Close account
          </button>
        </Row>
      </ul>
      {closing && (
        <ConfirmDialog
          title="Close your Tallyn account?"
          action="Close account"
          typeToConfirm={email}
          needsCode
          onConfirm={() => closeAccount(email)}
          onClose={() => setClosing(false)}
        >
          <p>
            Your banks are disconnected, and your accounts, transactions, sharing choices and sign-in are deleted. This can&apos;t be undone. Your household and
            its budgets stay for the others.
          </p>
          <p>
            <Link to="/settings?section=data" className="link small" onClick={() => setClosing(false)}>
              Download your data first
            </Link>
          </p>
        </ConfirmDialog>
      )}
    </Section>
  )
}
