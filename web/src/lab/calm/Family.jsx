// Family, calm draft (#185). Same jobs as web/src/screens/FamilyPage.jsx and Members.jsx:
// people in your household (and pending invites); a person's page with their role (owners can
// change it), what you may see of their money, what you share with them (Balances, Transactions,
// Time and location, under the sharing rules), what they share with you, their cards and debts,
// Remove from household or Leave; Invite someone; a pending invite you can cancel.
// Made-up names and amounts.
import { useState } from 'react'
import { UserPlus, Mail, Check } from 'lucide-react'
import * as D from '../home/data.js'
import { Panel, Rows, Row, Note, Sub, PageHead, Button, Money, Owed, usd } from './ui.jsx'

const ROLES = [
  ['owner', 'Owner'],
  ['adult', 'Adult'],
  ['teen', 'Teen'],
  ['viewer', 'Viewer'],
]
const ROLE_LABEL = { owner: 'Owner', adult: 'Adult', teen: 'Teen', child: 'Child', viewer: 'Viewer' }
const ROLE_INFO = {
  owner: 'manages people and roles, links banks and chooses what to share',
  adult: 'links banks and chooses what to share',
  teen: 'sees only their own money; owners and adults see theirs too',
  viewer: 'sees only what people share with them',
}
const CATEGORIES = [
  ['balances', 'Balances'],
  ['transactions', 'Transactions'],
  ['whereabouts', 'Time and location'],
]
const isKid = (r) => r === 'teen' || r === 'child'

const PEOPLE = [
  { id: 'maya', name: 'Maya Rivera', short: 'You', role: 'owner', you: true, tone: 'var(--accent)', initial: 'M' },
  { id: 'james', name: 'James Rivera', short: 'James', role: 'adult', tone: '#3f3f46', initial: 'J', givesYou: ['balances'], accounts: ['joint'] },
  { id: 'leo', name: 'Leo Rivera', short: 'Leo', role: 'teen', tone: '#16a34a', initial: 'L', accounts: ['leo'] },
]
const INVITES = [{ id: 'rosa', email: 'rosa.martinez@fastmail.com', role: 'viewer', sent: 'Oct 22', expires: 'Oct 29' }]

function Avatar({ p, size = 'size-10' }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full text-sm font-bold text-white`} style={{ background: p.tone }}>
      {p.initial}
    </span>
  )
}

function Switch({ label, checked, disabled, onChange }) {
  return (
    <label className={`flex items-center justify-between gap-3 py-2 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="font-semibold">{label}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-300 transition-colors duration-150 peer-checked:bg-[var(--in)] peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-150 peer-checked:after:translate-x-4 dark:bg-zinc-700"
      />
    </label>
  )
}

// What you may see of someone's money: their accounts (balances shared, or you're their parent).
function TheirMoney({ p }) {
  const accts = D.accounts.filter((a) => (p.you ? a.who === 'maya' : (p.accounts || []).includes(a.who)))
  const have = accts.filter((a) => a.usd > 0).reduce((s, a) => s + a.usd, 0)
  const owe = -accts.filter((a) => a.usd < 0).reduce((s, a) => s + a.usd, 0)
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Note>{p.you ? 'You have' : 'Have'}</Note>
          <Money v={have} className="text-lg" />
        </div>
        <div>
          <Note>{p.you ? 'You owe' : 'Owe'}</Note>
          {owe > 0 ? <Owed v={owe} className="text-lg" /> : <Money v={0} className="text-lg" />}
        </div>
      </div>
      <p className="mt-2 flex gap-4 text-[13px]">
        <a href="?p=accounts" className="font-semibold underline underline-offset-4">
          {p.you ? 'Your accounts' : `${p.short}'s accounts`}
        </a>
        {(p.you || isKid(p.role)) && (
          <a href="?p=transactions" className="font-semibold underline underline-offset-4">
            Transactions
          </a>
        )}
      </p>
    </div>
  )
}

function Person({ p, sharing, setSharing }) {
  const [role, setRole] = useState(p.role)
  const parentView = isKid(p.role)
  const canShare = !p.you && !isKid(p.role)
  const given = sharing[p.id] || []
  const toggle = (c, on) => {
    let next = on ? [...given, c] : given.filter((x) => x !== c)
    if (c === 'transactions' && !on) next = next.filter((x) => x !== 'whereabouts') // location only with transactions
    setSharing({ ...sharing, [p.id]: next })
  }
  return (
    <div className="grid gap-3">
      <Panel id={`person-${p.id}`}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar p={p} size="size-12" />
          <div className="min-w-0 grow">
            <h2 id={`person-${p.id}`} className="font-[family-name:'Space_Grotesk'] text-lg font-semibold">
              {p.you ? `${p.name} (you)` : p.name}
            </h2>
            <Note>
              <span className="mr-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {ROLE_LABEL[role]}
              </span>
              {p.you ? 'You manage people and roles, link banks and choose what to share' : `${p.short} ${ROLE_INFO[role]}`}
            </Note>
          </div>
        </div>
        {!p.you && (
          <div className="mt-3">
            <Sub>Role</Sub>
            <div role="group" aria-label={`Role for ${p.short}`} className="inline-flex rounded-full bg-zinc-100 p-0.5 dark:bg-zinc-800">
              {ROLES.map(([r, l]) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className="rounded-full px-3 py-1 text-[13px] font-semibold text-zinc-600 transition-colors duration-150 aria-pressed:bg-white aria-pressed:text-zinc-900 aria-pressed:shadow-sm dark:text-zinc-300 dark:aria-pressed:bg-zinc-950 dark:aria-pressed:text-white"
                >
                  {l}
                </button>
              ))}
            </div>
            <Note className="mt-1">Every change asks first. Owners can also remove people and change roles, including yours.</Note>
          </div>
        )}
      </Panel>

      <Panel id={`money-${p.id}`} title={p.you ? 'Your money' : `What you see of ${p.short}'s money`}>
        {parentView && <Note className="mb-2">You see {p.short}&apos;s money as a parent.</Note>}
        {!p.you && !parentView && <Note className="mb-2">{p.short} shares balances with you: Joint checking and the car loan.</Note>}
        <TheirMoney p={p} />
      </Panel>

      {!p.you && (
        <Panel id={`share-${p.id}`} title={`You share with ${p.short}`}>
          {canShare ? (
            <>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {CATEGORIES.map(([c, label]) => (
                  <Switch
                    key={c}
                    label={label}
                    checked={given.includes(c)}
                    disabled={c === 'whereabouts' && !given.includes('transactions')}
                    onChange={(on) => toggle(c, on)}
                  />
                ))}
              </div>
              <Note className="mt-1">Time and location are only shared together with transactions. Changes take effect straight away.</Note>
            </>
          ) : (
            <Note>Teens and children only see their own money, so there’s nothing to share with them.</Note>
          )}
        </Panel>
      )}

      {!p.you && (
        <Panel id={`gives-${p.id}`} title={`${p.short} shares with you`}>
          {parentView ? (
            <Note>You see {p.short}&apos;s money as a parent.</Note>
          ) : p.givesYou?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.filter(([c]) => p.givesYou.includes(c)).map(([c, label]) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-[13px] font-semibold dark:bg-zinc-800">
                  <Check className="size-3.5" style={{ color: 'var(--in-text)' }} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <Note>Nothing yet. Only {p.short} can choose to share with you.</Note>
          )}
        </Panel>
      )}

      {p.you && (
        <Panel id="you-share" title="What you share">
          <Rows>
            {PEOPLE.filter((x) => !x.you).map((x) => (
              <Row
                key={x.id}
                lead={<Avatar p={x} size="size-8" />}
                name={x.short}
                sub={
                  isKid(x.role)
                    ? 'Teen: sees only their own money'
                    : (sharing[x.id] || []).map((c) => CATEGORIES.find(([k]) => k === c)[1]).join(', ') || 'Nothing'
                }
              />
            ))}
          </Rows>
        </Panel>
      )}

      <div className="px-1">
        <Button danger small>
          {p.you ? 'Leave The Rivera family' : 'Remove from household'}
        </Button>
      </div>
    </div>
  )
}

function InviteForm() {
  const [sent, setSent] = useState(false)
  return (
    <Panel id="invite-h" title="Invite someone">
      {sent ? (
        <Note>Invite sent. It works for 7 days and shows in your list until it’s used.</Note>
      ) : (
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="font-semibold">Email</span>
            <input
              type="email"
              placeholder="sam@example.com"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Role</span>
            <select className="h-10 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
              {ROLES.filter(([r]) => r !== 'owner').map(([r, l]) => (
                <option key={r} value={r}>
                  {l} · {ROLE_INFO[r]}
                </option>
              ))}
            </select>
          </label>
          <Note>Nobody sees your money until you share it, whatever their role.</Note>
          <div>
            <Button icon={Mail} onClick={() => setSent(true)}>
              Send invite
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Pending({ inv }) {
  return (
    <Panel id="pending-h" title="Invite waiting">
      <p className="text-sm font-semibold">{inv.email}</p>
      <Note>
        {ROLE_LABEL[inv.role]} · sent {inv.sent} · works until {inv.expires}
      </Note>
      <div className="mt-3 flex gap-2">
        <Button small quiet>
          Copy invite link
        </Button>
        <Button small danger>
          Cancel invite
        </Button>
      </div>
    </Panel>
  )
}

export default function Family() {
  const [selected, setSelected] = useState('maya')
  const [sharing, setSharing] = useState({ james: ['balances', 'transactions'] })
  const person = PEOPLE.find((p) => p.id === selected)
  const invite = INVITES.find((i) => `invite-${i.id}` === selected)
  return (
    <>
      <PageHead title="Family" sub="Nobody sees your money until you share it">
        <Button icon={UserPlus} onClick={() => setSelected('invite')}>
          Invite someone
        </Button>
      </PageHead>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 [&>*]:min-w-0">
        <nav
          aria-label="People in your household"
          className="self-start rounded-2xl border border-zinc-200 bg-white p-2 lg:col-span-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <ul className="grid gap-0.5">
            {PEOPLE.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={selected === p.id ? 'true' : undefined}
                  onClick={() => setSelected(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-zinc-50 aria-[current=true]:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:aria-[current=true]:bg-zinc-800"
                >
                  <Avatar p={p} size="size-9" />
                  <span className="min-w-0 grow">
                    <span className="block truncate text-sm font-semibold">{p.you ? `${p.name} (you)` : p.name}</span>
                    <span className="block text-[13px] text-zinc-600 dark:text-zinc-400">{ROLE_LABEL[p.role]}</span>
                  </span>
                </button>
              </li>
            ))}
            {INVITES.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  aria-current={selected === `invite-${i.id}` ? 'true' : undefined}
                  onClick={() => setSelected(`invite-${i.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-zinc-50 aria-[current=true]:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:aria-[current=true]:bg-zinc-800"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-400 text-zinc-500">
                    <Mail className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 grow">
                    <span className="block truncate text-sm font-semibold">{i.email}</span>
                    <span className="block text-[13px] text-zinc-600 dark:text-zinc-400">{ROLE_LABEL[i.role]} · invited</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Note className="px-2 pt-2 pb-1">
            {PEOPLE.length} people · {usd(D.total)} you can see together
          </Note>
        </nav>
        <div className="lg:col-span-8">
          {selected === 'invite' ? (
            <InviteForm />
          ) : invite ? (
            <Pending inv={invite} />
          ) : (
            <Person key={person.id} p={person} sharing={sharing} setSharing={setSharing} />
          )}
        </div>
      </div>
    </>
  )
}
