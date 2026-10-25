// Sign-in and setup, calm drafts (#185). One page with a screen switcher, the same jobs as
// web/src/screens/SignIn.jsx, Verify2FA.jsx, BackupCodes.jsx (UseBackupCode, SaveBackupCodes),
// SetUp2FA.jsx, ResetPassword.jsx, CreateHousehold.jsx and Join.jsx, in AuthPage's frame: the
// logo, one centred card, the footer with the tagline and the legal links. No sidebar.
// Made-up email, key and codes.
import { useRef, useState } from 'react'
import { Check, Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react'
import lockupLight from '../../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg?url'
import lockupDark from '../../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg?url'
import wordLight from '../../../../brand/logo/svg/tallyn-wordmark-light.svg?url'
import wordDark from '../../../../brand/logo/svg/tallyn-wordmark-dark.svg?url'
import { Note, Chips, press } from './ui.jsx'

const EMAIL = 'maya.rivera@fastmail.com'
const CODES = ['k7m2-9pqx', 'r4tz-h8wd', 'b3nf-6ycu', 'q9vj-2mle', 'x5sa-7kro', 'd8ge-4hwt', 'p2ux-3zbn', 'm6cy-9fqa', 'w4lr-5jte', 'h7do-8vsk']
const SCREENS = [
  ['signin', 'Sign in'],
  ['signup', 'Create account'],
  ['code', '2FA code'],
  ['backup', 'Use a backup code'],
  ['setup', 'Set up 2FA'],
  ['codes', 'Backup codes'],
  ['reset', 'Reset password'],
  ['sent', 'Check your email'],
  ['newpw', 'New password'],
  ['household', 'Create household'],
  ['join', 'Join'],
]
const input = 'h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950'

const H = ({ children }) => <h1 className="font-[family-name:'Space_Grotesk'] text-xl font-bold tracking-tight">{children}</h1>
const Field = ({ label, aside, children }) => (
  <div className="grid gap-1 text-sm">
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-semibold">{label}</span>
      {aside}
    </div>
    {children}
  </div>
)
const Primary = ({ children, disabled, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={(e) => (press(e), onClick?.())}
    className="h-10 w-full rounded-full text-sm font-semibold text-white transition-opacity duration-150 disabled:opacity-40"
    style={{ background: 'var(--button)' }}
  >
    {children}
  </button>
)
const Secondary = ({ children, onClick, small }) => (
  <button
    type="button"
    onClick={(e) => (press(e), onClick?.())}
    className={`${small ? 'h-8 px-3 text-[13px]' : 'h-10 w-full text-sm'} rounded-full border border-zinc-300 font-semibold dark:border-zinc-700`}
  >
    {children}
  </button>
)
const Quiet = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-[13px] font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-white"
  >
    {children}
  </button>
)
const Info = ({ icon: I = Lock, children }) => (
  <p className="flex gap-2 rounded-xl bg-zinc-50 p-3 text-[13px] text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
    <I className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>
)
const Rule = ({ ok }) => (
  <p id="password-rule" className="flex items-center gap-1.5 text-[13px]" style={{ color: ok ? 'var(--in-text)' : undefined }}>
    <span
      className={`flex size-4 items-center justify-center rounded-full ${ok ? 'text-white' : 'border border-zinc-400'}`}
      style={ok ? { background: 'var(--in)' } : undefined}
      aria-hidden="true"
    >
      {ok && <Check className="size-3" />}
    </span>
    <span className={ok ? 'font-semibold' : 'text-zinc-500 dark:text-zinc-400'}>At least 8 characters</span>
  </p>
)
const Agree = ({ checked, onChange, children }) => (
  <label className="flex items-start gap-2.5 text-[13px] text-zinc-700 dark:text-zinc-300">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--button)]" />
    <span>{children}</span>
  </label>
)
const A = ({ children }) => (
  <a href="#" className="font-semibold text-zinc-900 underline underline-offset-2 dark:text-white">
    {children}
  </a>
)

// The 6-digit code as six boxes: type, paste or backspace across them. The button waits for all six.
function CodeBoxes({ button, onDone }) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const boxes = useRef([])
  const set = (i, v) => {
    const clean = v.replace(/\D/g, '')
    const next = [...digits]
    clean
      .slice(0, 6 - i)
      .split('')
      .forEach((d, k) => (next[i + k] = d))
    if (!clean) next[i] = ''
    setDigits(next)
    boxes.current[Math.min(5, i + Math.max(clean.length, 0))]?.focus()
  }
  const full = digits.every(Boolean)
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5 text-sm">
        <span id="code-l" className="font-semibold">
          6-digit code
        </span>
        <div role="group" aria-labelledby="code-l" className="flex gap-1.5">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (boxes.current[i] = el)}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${i + 1} of 6`}
              value={d}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && boxes.current[i - 1]?.focus()}
              onFocus={(e) => e.target.select()}
              className={`h-12 w-full min-w-0 rounded-xl border bg-white text-center font-[family-name:'Space_Grotesk'] text-xl font-semibold dark:bg-zinc-950 ${i === 2 ? 'mr-2' : ''} ${d ? 'border-zinc-900 dark:border-white' : 'border-zinc-300 dark:border-zinc-700'}`}
            />
          ))}
        </div>
      </div>
      <Primary disabled={!full} onClick={onDone}>
        {button}
      </Primary>
    </div>
  )
}

function SignInCard({ signup, go }) {
  const [pw, setPw] = useState('')
  const [agreed, setAgreed] = useState(false)
  return (
    <>
      <H>{signup ? 'Create your account' : 'Welcome back'}</H>
      <Field label="Email">
        <input type="email" autoComplete="email" defaultValue={signup ? '' : EMAIL} className={input} />
      </Field>
      <Field label="Password" aside={!signup && <Quiet onClick={() => go('reset')}>Forgot password?</Quiet>}>
        <input
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          aria-describedby={signup ? 'password-rule' : undefined}
          className={input}
        />
      </Field>
      {signup && <Rule ok={pw.length >= 8} />}
      {signup && (
        <Agree checked={agreed} onChange={setAgreed}>
          I agree to the <A>Terms of Service</A> and <A>Privacy Policy</A>. Tallyn is for people 18 and over.
        </Agree>
      )}
      <Primary disabled={signup && !agreed} onClick={() => go(signup ? 'setup' : 'code')}>
        {signup ? 'Create account' : 'Sign in'}
      </Primary>
      <p className="flex items-center gap-3 text-[13px] text-zinc-500" aria-hidden="true">
        <span className="h-px grow bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px grow bg-zinc-200 dark:bg-zinc-800" />
      </p>
      <button
        type="button"
        onClick={() => go(signup ? 'signin' : 'signup')}
        className="flex items-center justify-center gap-1.5 text-sm font-semibold hover:underline"
      >
        {signup ? 'Sign in to your account' : 'Create a new account'} <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </>
  )
}

function CodeCard({ go }) {
  const [help, setHelp] = useState(false)
  return (
    <>
      <H>Enter your code</H>
      <Note>Open your authenticator app and enter the 6-digit code for Tallyn.</Note>
      <CodeBoxes button="Continue" onDone={() => go('household')} />
      {help && (
        <div id="code-help" className="grid gap-2">
          <Info>Lost your phone or deleted the app? Use one of the backup codes you saved.</Info>
          <Secondary onClick={() => go('backup')}>Use a backup code</Secondary>
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          aria-expanded={help}
          aria-controls="code-help"
          onClick={() => setHelp(!help)}
          className="text-[13px] font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 dark:text-zinc-300 dark:decoration-zinc-600"
        >
          Can’t get a code?
        </button>
        <Quiet onClick={() => go('signin')}>Use a different account</Quiet>
      </div>
    </>
  )
}

function BackupCard({ go }) {
  const [code, setCode] = useState('')
  const ok = code.replace(/[\s-]/g, '').length === 8
  return (
    <>
      <H>Use a backup code</H>
      <Note>Enter one of the codes you saved when you set up two-step sign-in. Each code works once.</Note>
      <Field label="Backup code">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="xxxx-xxxx"
          autoComplete="off"
          spellCheck={false}
          className={`${input} font-[family-name:'Space_Grotesk'] tracking-widest`}
        />
      </Field>
      <Primary disabled={!ok} onClick={() => go('setup')}>
        Continue
      </Primary>
      <Note>After this, you’ll set up your authenticator again, and the lost one stops working.</Note>
      <div>
        <Quiet onClick={() => go('code')}>Back</Quiet>
      </div>
    </>
  )
}

// A made-up QR-like grid (not a real code), so the draft shows the scan step.
function FakeQR() {
  const n = 21
  const corner = (x, y, cx, cy) =>
    x >= cx &&
    x < cx + 7 &&
    y >= cy &&
    y < cy + 7 &&
    (x === cx || x === cx + 6 || y === cy || y === cy + 6 || (x > cx + 1 && x < cx + 5 && y > cy + 1 && y < cy + 5))
  const on = (x, y) =>
    corner(x, y, 0, 0) || corner(x, y, 14, 0) || corner(x, y, 0, 14)
      ? true
      : (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)
        ? false
        : (x * 7 + y * 13 + x * y) % 5 < 2
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      className="size-40 rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-700"
      role="img"
      aria-label="QR code to add Tallyn to your authenticator app (made up)"
    >
      {Array.from(
        { length: n * n },
        (_, i) => on(i % n, Math.floor(i / n)) && <rect key={i} x={i % n} y={Math.floor(i / n)} width="1" height="1" fill="#09090b" />,
      )}
    </svg>
  )
}

function SetupCard({ go }) {
  return (
    <>
      <H>Protect your account</H>
      <Note>Tallyn asks for a code from an authenticator app each time you sign in, so your password alone can’t open your family’s money.</Note>
      <ol className="grid gap-1 text-sm">
        <li className="flex gap-2">
          <b className="font-[family-name:'Space_Grotesk']">1</b> In your authenticator app, add an account and scan this code.
        </li>
      </ol>
      <div className="flex justify-center">
        <FakeQR />
      </div>
      <div className="text-center">
        <Note>Can’t scan it? Enter this key instead:</Note>
        <p className="mt-0.5 font-[family-name:'Space_Grotesk'] text-sm font-semibold tracking-wider">JBSW Y3DP EHPK 3PXP</p>
      </div>
      <p className="flex gap-2 text-sm">
        <b className="font-[family-name:'Space_Grotesk']">2</b> Then enter the 6-digit code it shows.
      </p>
      <CodeBoxes button="Turn on 2FA" onDone={() => go('codes')} />
      <Note>Then you’ll save backup codes, for when you can’t use your phone.</Note>
      <div>
        <Quiet onClick={() => go('signin')}>Use a different account</Quiet>
      </div>
    </>
  )
}

function CodesCard({ go }) {
  const [saved, setSaved] = useState(false)
  return (
    <>
      <H>Save your backup codes</H>
      <Note>Each one works once, for when you can’t use your authenticator app.</Note>
      <ol
        aria-label="Your backup codes"
        className="grid grid-cols-2 gap-x-5 gap-y-1.5 rounded-xl bg-zinc-50 p-4 font-[family-name:'Space_Grotesk'] text-sm font-semibold tabular-nums dark:bg-zinc-800/60"
      >
        {CODES.map((c, i) => (
          <li key={c} className="flex gap-2">
            <span className="w-5 text-right font-normal text-zinc-400">{i + 1}</span>
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Secondary small>Copy</Secondary>
        <Secondary small>Download</Secondary>
        <Secondary small>Print</Secondary>
      </div>
      <Info>You won’t see these codes again. You can get new ones in Settings.</Info>
      <Agree checked={saved} onChange={setSaved}>
        I’ve saved these codes somewhere safe
      </Agree>
      <Primary disabled={!saved} onClick={() => go('household')}>
        Continue to Tallyn
      </Primary>
      <div className="text-center">
        <Quiet>Remind me next time</Quiet>
      </div>
    </>
  )
}

function ResetCard({ go }) {
  return (
    <>
      <H>Reset your password</H>
      <Note>Enter the email you use for Tallyn and we’ll send you a link to choose a new password.</Note>
      <Field label="Email">
        <input type="email" autoComplete="email" defaultValue={EMAIL} className={input} />
      </Field>
      <Primary onClick={() => go('sent')}>Send reset link</Primary>
      <div>
        <Quiet onClick={() => go('signin')}>Back to sign in</Quiet>
      </div>
    </>
  )
}

function SentCard({ go }) {
  return (
    <>
      <span className="flex size-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
        <Mail className="size-5" />
      </span>
      <H>Check your email</H>
      <p className="text-sm">
        We sent a link to <b>{EMAIL}</b>. It works once, for 1 hour.
      </p>
      <Info icon={Mail}>Nothing there? Check your spam folder. You can ask for a new link in a minute.</Info>
      <button
        type="button"
        disabled
        className="h-10 w-full rounded-full border border-zinc-300 text-sm font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      >
        Send another link in 42s
      </button>
      <div className="flex flex-wrap justify-between gap-2">
        <Quiet onClick={() => go('signin')}>Back to sign in</Quiet>
        <Quiet onClick={() => go('reset')}>Use a different email</Quiet>
      </div>
      <Note className="border-t border-zinc-100 pt-3 dark:border-zinc-800">Draft: the link opens “Choose a new password”, after your code.</Note>
      <Secondary small onClick={() => go('newpw')}>
        Open the link
      </Secondary>
    </>
  )
}

function NewPasswordCard({ go }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  return (
    <>
      <H>Choose a new password</H>
      <Note>For {EMAIL}</Note>
      <Field label="New password">
        <span className="relative block">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            aria-describedby="password-rule"
            className={`${input} pr-11`}
          />
          <button
            type="button"
            aria-pressed={show}
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow(!show)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500"
          >
            {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </span>
      </Field>
      <Rule ok={pw.length >= 8} />
      <Primary disabled={pw.length < 8} onClick={() => go('signin')}>
        Save new password
      </Primary>
      <Note>You’ll be signed out on your other devices.</Note>
    </>
  )
}

function HouseholdCard() {
  return (
    <>
      <H>Set up your household</H>
      <Note>A household is where your family’s money comes together. You can invite others later.</Note>
      <Field label="Household name">
        <input maxLength={80} placeholder="The Rivera family" className={input} />
      </Field>
      <Field label="Home currency">
        <select defaultValue="USD" className={input}>
          {['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'INR'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Note>Totals show in this currency. Accounts in others are converted.</Note>
      <Primary>Create household</Primary>
    </>
  )
}

function JoinCard() {
  return (
    <>
      <H>You’ve been invited</H>
      <Note>Someone invited you to their household on Tallyn. Joining doesn’t share any of your money: you choose that later in Sharing.</Note>
      <Info>Nobody sees your money until you share it.</Info>
      <Primary>Join household</Primary>
      <div className="text-center">
        <Quiet>Not now</Quiet>
      </div>
    </>
  )
}

const CARDS = {
  signin: (p) => <SignInCard {...p} />,
  signup: (p) => <SignInCard signup {...p} />,
  code: CodeCard,
  backup: BackupCard,
  setup: SetupCard,
  codes: CodesCard,
  reset: ResetCard,
  sent: SentCard,
  newpw: NewPasswordCard,
  household: HouseholdCard,
  join: JoinCard,
}

export default function SignIn({ dark }) {
  const [screen, setScreen] = useState(() => {
    const s = new URLSearchParams(location.search).get('s')
    return CARDS[s] ? s : 'signin'
  })
  const go = (s) => {
    setScreen(s)
    const u = new URL(location.href)
    u.searchParams.set('s', s)
    history.replaceState(null, '', u)
  }
  const Card = CARDS[screen]
  const centred = ['code', 'backup', 'setup', 'codes'].includes(screen)
  return (
    <div className="flex min-h-[calc(100svh-120px)] flex-col items-center">
      <div className="mb-8 w-full max-w-3xl">
        <Note className="mb-1.5">Draft only: pick a screen</Note>
        <Chips label="Screen" options={SCREENS} value={screen} onChange={go} />
      </div>
      <div className={`flex w-full grow flex-col items-center ${centred ? 'justify-center' : ''}`}>
        <img src={dark ? lockupDark : lockupLight} alt="Tallyn" className="mb-6 h-8" />
        <section key={screen} className="grid w-full max-w-[380px] gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <Card go={go} />
        </section>
      </div>
      <footer className="mt-12 flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 text-[13px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <img src={dark ? wordDark : wordLight} alt="Tallyn" height="18" className="h-[18px]" />
          <span>· It all adds up.</span>
        </span>
        <nav aria-label="Legal" className="flex gap-3">
          <a href="#" className="hover:underline">
            Terms of Service
          </a>
          <a href="#" className="hover:underline">
            Privacy Policy
          </a>
        </nav>
      </footer>
    </div>
  )
}
