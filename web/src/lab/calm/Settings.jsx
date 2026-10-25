// Settings, calm draft (#185). Same jobs as web/src/screens/Settings.jsx: sections on the left, the
// chosen one on the right, like Family. Profile (your name, email, Save), Sign-in and security
// (two-step sign-in with each authenticator, add or remove one, backup codes left and a new set,
// change password, sign out of other devices, sign out), Household (name and rename, home
// currency, your role, people), Your data (banks, sharing, download with a code), Notifications
// (coming soon), Legal (Terms and Privacy with versions), Leave or close (leave the household,
// close the account by typing your email and a code). Made-up names, codes and amounts.
import { useState } from 'react'
import { User, ShieldCheck, Home, Database, Bell, FileText, LogOut, Smartphone, ChevronRight, X, Check, Plus } from 'lucide-react'
import * as D from '../home/data.js'
import { Panel, Note, PageHead, Button } from './ui.jsx'

const EMAIL = 'maya.rivera@fastmail.com'
const HOUSEHOLD = 'The Rivera family'
const SECTIONS = [
  ['profile', 'Profile', User],
  ['security', 'Sign-in and security', ShieldCheck],
  ['household', 'Household', Home],
  ['data', 'Your data', Database],
  ['notifications', 'Notifications', Bell],
  ['legal', 'Legal', FileText],
  ['leave', 'Leave or close', LogOut],
]
const CODES = ['k7m2-9pqx', 'r4tz-h8wd', 'b3nf-6ycu', 'q9vj-2mle', 'x5sa-7kro', 'd8ge-4hwt', 'p2ux-3zbn', 'm6cy-9fqa', 'w4lr-5jte', 'h7do-8vsk']
const input = 'h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900'

// One setting: what it is and its state on the left, its action on the right.
const Item = ({ label, note, children, tone }) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-1 last:pb-1">
    <span className="min-w-0 grow basis-60">
      <span className="block text-sm font-semibold" style={tone ? { color: tone } : undefined}>
        {label}
      </span>
      {note && <span className="block text-[13px] text-zinc-500 dark:text-zinc-400">{note}</span>}
    </span>
    {children}
  </li>
)
const Items = ({ children }) => <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</ul>
const TextLink = ({ children, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-[13px] font-semibold underline decoration-zinc-300 underline-offset-4 hover:decoration-current dark:decoration-zinc-600"
    style={danger ? { color: 'var(--owe-text)' } : undefined}
  >
    {children}
  </button>
)

function Dialog({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="sdlg-h">
      <div className={`max-h-[90svh] w-full ${wide ? 'max-w-lg' : 'max-w-md'} overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="sdlg-h" className="font-display text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-3 text-sm text-zinc-700 dark:text-zinc-300">{children}</div>
      </div>
    </div>
  )
}
const CodeField = () => (
  <label className="grid gap-1">
    <span className="font-semibold text-zinc-900 dark:text-white">6-digit code from your authenticator</span>
    <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${input} font-display tracking-[0.3em]`} />
  </label>
)
const Actions = ({ onClose, action, danger, onAction }) => (
  <div className="mt-2 flex justify-end gap-2">
    <Button quiet onClick={onClose}>
      Cancel
    </Button>
    {danger ? (
      <Button danger onClick={onAction ?? onClose}>
        {action}
      </Button>
    ) : (
      <Button onClick={onAction ?? onClose}>{action}</Button>
    )}
  </div>
)

// A made-up QR-like grid, so the draft has something to scan-look at. Not a real code.
function FakeQR() {
  const n = 21
  const on = (x, y) => {
    const corner = (cx, cy) =>
      x >= cx &&
      x < cx + 7 &&
      y >= cy &&
      y < cy + 7 &&
      (x === cx || x === cx + 6 || y === cy || y === cy + 6 || (x > cx + 1 && x < cx + 5 && y > cy + 1 && y < cy + 5))
    if (corner(0, 0) || corner(14, 0) || corner(0, 14)) return true
    if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return false
    return (x * 7 + y * 13 + x * y) % 5 < 2
  }
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      className="size-36 rounded-lg bg-white p-2"
      role="img"
      aria-label="QR code to add Tallyn to your other authenticator app (made up)"
    >
      {Array.from(
        { length: n * n },
        (_, i) => on(i % n, Math.floor(i / n)) && <rect key={i} x={i % n} y={Math.floor(i / n)} width="1" height="1" fill="#09090b" />,
      )}
    </svg>
  )
}

function Profile() {
  const [saved, setSaved] = useState(false)
  return (
    <Panel id="set-profile-h" title="Profile">
      <label className="grid max-w-sm gap-1 text-sm">
        <span className="font-semibold">Your name, as your family sees it</span>
        <input defaultValue="Maya" maxLength={80} placeholder="Alex" onChange={() => setSaved(false)} className={input} />
      </label>
      <Items>
        <Item label="Email" note={EMAIL}>
          <Button onClick={() => setSaved(true)}>Save</Button>
        </Item>
      </Items>
      {saved && (
        <p role="status" className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--in-text)' }}>
          <Check className="size-4" aria-hidden="true" /> Saved. Your family now sees you as Maya.
        </p>
      )}
    </Panel>
  )
}

function Security() {
  const [apps, setApps] = useState([
    { id: 'iphone', name: 'iPhone', added: 'Mar 4' },
    { id: '1p', name: '1Password', added: 'Jun 12' },
  ])
  const [dialog, setDialog] = useState(null)
  const [left] = useState(7)
  const close = () => setDialog(null)
  return (
    <Panel id="set-security-h" title="Sign-in and security">
      <Items>
        <li className="py-3 first:pt-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 grow">
              <span className="block text-sm font-semibold">Two-step sign-in</span>
              <span className="block text-[13px] text-zinc-500 dark:text-zinc-400">
                {apps.length === 1 ? '1 authenticator app' : `${apps.length} authenticator apps`}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'var(--in-text)' }}>
              <Check className="size-4" aria-hidden="true" /> On
            </span>
          </div>
          <ul className="mt-2 grid gap-1.5">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                <Smartphone className="size-4 shrink-0 text-zinc-500" aria-hidden="true" />
                <span className="min-w-0 grow">
                  <span className="block text-sm font-semibold">{a.name}</span>
                  <span className="block text-[13px] text-zinc-500 dark:text-zinc-400">Added {a.added}</span>
                </span>
                {apps.length > 1 ? <TextLink onClick={() => setDialog({ kind: 'remove', app: a })}>Remove</TextLink> : <Note>Your only one</Note>}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <Button quiet small icon={Plus} onClick={() => setDialog({ kind: 'add' })}>
              Add another
            </Button>
          </div>
        </li>
        <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
          <span className="min-w-0 grow basis-60">
            <span className="block text-sm font-semibold">Backup codes</span>
            <span className="block text-[13px] text-zinc-500 dark:text-zinc-400">
              {left} of {CODES.length} left · for when you can’t use your authenticator
            </span>
            <span className="mt-1.5 flex gap-1" aria-hidden="true">
              {CODES.map((c, i) => (
                <i key={c} className="h-2 w-4 rounded-sm" style={{ background: i < left ? 'var(--in)' : 'var(--track)' }} />
              ))}
            </span>
          </span>
          <Button quiet small onClick={() => setDialog({ kind: 'codes' })}>
            Regenerate
          </Button>
        </li>
        <Item label="Change password" note="Also “forgot password” on the sign-in screen">
          <Button quiet small onClick={() => setDialog({ kind: 'password' })}>
            Change
          </Button>
        </Item>
        <Item
          label="Sign out of other devices"
          note={dialog === 'done' ? 'Done. Only this device is signed in now.' : 'Phones, tablets and browsers other than this one'}
        >
          <Button quiet small onClick={() => setDialog({ kind: 'others' })}>
            Sign out others
          </Button>
        </Item>
        <Item label="Sign out" note="Everywhere you’re signed in">
          <Button quiet small>
            Sign out
          </Button>
        </Item>
      </Items>

      {dialog?.kind === 'add' && (
        <AddAuthenticator onClose={close} onAdded={(name) => (setApps((l) => [...l, { id: name, name, added: 'Oct 25' }]), close())} />
      )}
      {dialog?.kind === 'remove' && (
        <Dialog title={`Remove ${dialog.app.name}?`} onClose={close}>
          <p>Its codes will stop working for Tallyn. Your other authenticators and backup codes still work.</p>
          <CodeField />
          <Actions onClose={close} action="Remove" danger onAction={() => (setApps((l) => l.filter((a) => a.id !== dialog.app.id)), close())} />
        </Dialog>
      )}
      {dialog?.kind === 'codes' && <NewCodes onClose={close} />}
      {dialog?.kind === 'password' && (
        <Dialog title="Change password" onClose={close}>
          <label className="grid gap-1">
            <span className="font-semibold text-zinc-900 dark:text-white">New password</span>
            <input type="password" autoComplete="new-password" className={input} />
          </label>
          <Note>At least 12 characters. A short sentence works well.</Note>
          <CodeField />
          <Actions onClose={close} action="Change password" />
        </Dialog>
      )}
      {dialog?.kind === 'others' && (
        <Dialog title="Sign out of other devices?" onClose={close}>
          <p>Phones, tablets and browsers other than this one will need to sign in again.</p>
          <Actions onClose={close} action="Sign out others" onAction={() => setDialog('done')} />
        </Dialog>
      )}
    </Panel>
  )
}

function AddAuthenticator({ onClose, onAdded }) {
  const [name, setName] = useState('')
  const [step, setStep] = useState('name')
  return (
    <Dialog title="Add another authenticator" onClose={onClose}>
      {step === 'name' ? (
        <>
          <label className="grid gap-1">
            <span className="font-semibold text-zinc-900 dark:text-white">Name it, so you can tell them apart</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="1Password, Work phone…" className={input} />
          </label>
          <Actions onClose={onClose} action="Show the QR code" onAction={() => name.trim() && setStep('scan')} />
        </>
      ) : (
        <>
          <p>In {name.trim()}, add an account and scan this code.</p>
          <div className="flex flex-wrap items-center gap-4">
            <FakeQR />
            <div className="min-w-0">
              <Note>Can’t scan it? Enter this key instead:</Note>
              <p className="mt-1 font-display text-[13px] font-semibold tracking-wider break-all text-zinc-900 dark:text-white">JBSW Y3DP EHPK 3PXP</p>
            </div>
          </div>
          <p>Then enter the 6-digit code it shows.</p>
          <CodeField />
          <Actions onClose={onClose} action="Add" onAction={() => onAdded(name.trim())} />
        </>
      )}
    </Dialog>
  )
}

function NewCodes({ onClose }) {
  const [step, setStep] = useState('confirm')
  return step === 'confirm' ? (
    <Dialog title="Get new backup codes?" onClose={onClose}>
      <p>Your current codes stop working, and you’ll see ten new ones once.</p>
      <CodeField />
      <Actions onClose={onClose} action="Continue" onAction={() => setStep('show')} />
    </Dialog>
  ) : (
    <Dialog title="Your backup codes" onClose={onClose}>
      <p>Each one works once, for when you can’t use your authenticator. Save them somewhere safe: you won’t see them again.</p>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-zinc-50 p-4 font-display text-sm font-semibold tabular-nums dark:bg-zinc-800/60">
        {CODES.map((c, i) => (
          <li key={c} className="flex gap-2">
            <span className="w-5 text-right font-normal text-zinc-400">{i + 1}</span>
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button quiet small>
          Copy
        </Button>
        <Button quiet small>
          Download
        </Button>
        <Button quiet small>
          Print
        </Button>
      </div>
      <div className="mt-2 flex justify-end">
        <Button onClick={onClose}>I’ve saved them</Button>
      </div>
    </Dialog>
  )
}

function Household() {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(HOUSEHOLD)
  return (
    <Panel id="set-household-h" title="Household">
      <Items>
        {renaming ? (
          <li className="flex flex-wrap items-end gap-2 py-3 first:pt-1">
            <label className="grid grow basis-60 gap-1 text-sm">
              <span className="font-semibold">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={input} />
            </label>
            <Button quiet onClick={() => setRenaming(false)}>
              Save
            </Button>
            <TextLink onClick={() => (setName(HOUSEHOLD), setRenaming(false))}>Cancel</TextLink>
          </li>
        ) : (
          <Item label="Name" note={name}>
            <TextLink onClick={() => setRenaming(true)}>Rename</TextLink>
          </Item>
        )}
        <Item label="Home currency" note="USD. Totals in one currency come with conversion." />
        <Item label="Your role" note="Owner" />
        <Item label="People" note={`${D.people.length} members`}>
          <TextLink>Family</TextLink>
        </Item>
      </Items>
    </Panel>
  )
}

function YourData() {
  const [confirming, setConfirming] = useState(false)
  return (
    <Panel id="set-data-h" title="Your data">
      <Items>
        <Item label="Connected banks" note="Link, check or unlink your banks">
          <TextLink>Accounts</TextLink>
        </Item>
        <Item label="Who sees your money" note="Choose what each person sees">
          <TextLink>Family</TextLink>
        </Item>
        <Item label="Download your data" note="Everything Tallyn holds about you">
          <Button quiet small onClick={() => setConfirming(true)}>
            Download
          </Button>
        </Item>
      </Items>
      {confirming && (
        <Dialog title="Download your data?" onClose={() => setConfirming(false)}>
          <p>
            You’ll get a ZIP with your profile, banks, accounts, transactions, budgets and sharing choices. Only your own data: nothing others share with you.
            Keep it somewhere safe.
          </p>
          <CodeField />
          <Actions onClose={() => setConfirming(false)} action="Download" />
        </Dialog>
      )}
    </Panel>
  )
}

const Notifications = () => (
  <Panel id="set-notif-h" title="Notifications">
    <Items>
      <Item label="Alerts" note="For example a big purchase, a low balance, or a bank that needs you to sign in again">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Coming soon</span>
      </Item>
    </Items>
  </Panel>
)

const Legal = () => (
  <Panel id="set-legal-h" title="Legal">
    <Items>
      {['Terms of Service', 'Privacy Policy'].map((t) => (
        <li key={t}>
          <a href="#" className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
            <span className="grow">
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block text-[13px] text-zinc-500 dark:text-zinc-400">Version 0.1-draft</span>
            </span>
            <ChevronRight className="size-4 text-zinc-400" aria-hidden="true" />
          </a>
        </li>
      ))}
    </Items>
  </Panel>
)

function LeaveOrClose() {
  const [closing, setClosing] = useState(false)
  const [typed, setTyped] = useState('')
  return (
    <Panel id="set-leave-h" title="Leave or close">
      <Items>
        <Item label={`Leave ${HOUSEHOLD}`} note="You’ll confirm with your name and a code from your authenticator app">
          <TextLink danger>Leave</TextLink>
        </Item>
        <Item label="Close your Tallyn account" note="Removes your banks, transactions and sign-in">
          <TextLink danger onClick={() => setClosing(true)}>
            Close account
          </TextLink>
        </Item>
      </Items>
      {closing && (
        <Dialog title="Close your Tallyn account?" onClose={() => setClosing(false)}>
          <p>
            Your banks are disconnected, and your accounts, transactions, sharing choices and sign-in are deleted. This can’t be undone. Your household and its
            budgets stay for the others.
          </p>
          <TextLink>Download your data first</TextLink>
          <label className="grid gap-1">
            <span className="font-semibold text-zinc-900 dark:text-white">Type your email to confirm: {EMAIL}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={input} />
          </label>
          <CodeField />
          <Actions onClose={() => setClosing(false)} action="Close account" danger />
        </Dialog>
      )}
    </Panel>
  )
}

const VIEWS = { profile: Profile, security: Security, household: Household, data: YourData, notifications: Notifications, legal: Legal, leave: LeaveOrClose }

export default function Settings() {
  const [section, setSection] = useState('security')
  const View = VIEWS[section]
  return (
    <>
      <PageHead title="Settings" sub="Your profile, sign-in and household" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 [&>*]:min-w-0">
        <nav
          aria-label="Settings sections"
          className="self-start rounded-2xl border border-zinc-200 bg-white p-2 lg:col-span-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <ul className="grid gap-0.5">
            {SECTIONS.map(([key, label, I]) => (
              <li key={key} className={key === 'leave' ? 'mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800' : undefined}>
                <button
                  type="button"
                  aria-current={section === key ? 'true' : undefined}
                  onClick={() => setSection(key)}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition-colors duration-150 hover:bg-zinc-50 aria-[current=true]:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:aria-[current=true]:bg-zinc-800"
                  style={key === 'leave' ? { color: 'var(--owe-text)' } : undefined}
                >
                  <I className="size-4 shrink-0" aria-hidden="true" />
                  <span className="grow">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="max-w-[640px] lg:col-span-8">
          <View />
        </div>
      </div>
    </>
  )
}
