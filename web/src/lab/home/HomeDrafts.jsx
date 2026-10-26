// Home drafts for #182: three designs, each in a light and a dark taste-skill style.
// Built with Bklit charts, Kokonut UI and anime.js (#183). All names and amounts are made up.
import { useEffect, useState } from 'react'
import { animate } from 'animejs'
import { curveLinear } from '@visx/curve'
import { LineChart } from '@/components/charts/line-chart'
import { Line } from '@/components/charts/line'
import { Grid } from '@/components/charts/grid'
import { XAxis } from '@/components/charts/x-axis'
import { YAxis } from '@/components/charts/y-axis'
import ReceiptPrinter from '@/components/kokonutui/receipt-printer'
import SpendingRing from '@/components/kokonutui/spending-ring'
import { STYLES, DESIGNS } from './themes.js'
import * as D from './data.js'
import './home.css'
import lockupLight from '../../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg?url'
import lockupDark from '../../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg?url'
import markLight from '../../../../brand/logo/svg/tallyn-mark-light.svg?url'
import markDark from '../../../../brand/logo/svg/tallyn-mark-dark.svg?url'

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// anime.js: feedback only. A short press on buttons, nothing performs an entrance.
function press(e) {
  if (reduced()) return
  animate(e.currentTarget, { scale: [1, 0.96, 1], duration: 200, ease: 'outQuad' })
}

const ICONS = {
  Home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  Accounts: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z',
  Transactions: 'M4 7h13l-3-3M20 17H7l3 3',
  Budgets: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 3.5V12l6 6',
  Goals: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  Family: 'M9 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M17 7.2a2.3 2.3 0 1 0 0 4.6M14.5 14.6c2.6-.5 5 .9 5.6 4.4',
  Settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8',
}
const NAV = Object.keys(ICONS)
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
)

function Shell({ style, children }) {
  const logo = style.dark ? lockupDark : lockupLight
  const mark = style.dark ? markDark : markLight
  const me = (
    <div className="who">
      <span className="avatar" style={{ background: 'var(--p-maya)' }}>
        M
      </span>
      {style.shell === 'plane' && (
        <span>
          <b>Maya Rivera</b>
          <br />
          <span className="muted">The Rivera family</span>
        </span>
      )}
    </div>
  )
  return (
    <>
      {style.shell === 'plane' && (
        <aside className="side plane" aria-label="Main">
          <img className="logo" src={logo} alt="Tallyn" />
          {NAV.map((n) => (
            <a key={n} href="#" aria-current={n === 'Home' ? 'page' : undefined}>
              <Icon name={n} />
              {n}
            </a>
          ))}
          {me}
        </aside>
      )}
      {style.shell === 'rail' && (
        <aside className="side rail" aria-label="Main">
          <img className="mark" src={mark} alt="Tallyn" />
          {NAV.map((n) => (
            <a key={n} href="#" aria-label={n} title={n} aria-current={n === 'Home' ? 'page' : undefined}>
              <Icon name={n} />
            </a>
          ))}
          {me}
        </aside>
      )}
      {style.shell === 'top' && (
        <header className="topbar">
          <div className="in">
            <img className="logo" src={logo} alt="Tallyn" />
            <nav style={{ display: 'flex', gap: 24 }} aria-label="Main">
              {['Home', 'Accounts', 'Transactions', 'Budgets', 'Family'].map((n) => (
                <a key={n} href="#" aria-current={n === 'Home' ? 'page' : undefined}>
                  {n}
                </a>
              ))}
            </nav>
            {me}
          </div>
        </header>
      )}
      <main className="canvas">{children}</main>
      <nav className="tabbar" aria-label="Main">
        {['Home', 'Accounts', 'Transactions', 'Budgets', 'Family'].map((n) => (
          <a key={n} href="#" aria-current={n === 'Home' ? 'page' : undefined}>
            <Icon name={n} />
            {n === 'Transactions' ? 'Activity' : n}
          </a>
        ))}
      </nav>
    </>
  )
}

function TitleRow({ title }) {
  return (
    <div className="title-row">
      <div>
        <h1>{title}</h1>
        <p className="sub">
          <b>{D.finding.strong}</b>
          {D.finding.rest}
        </p>
      </div>
      <div className="acts">
        <span className="stamp">Updated 9:41</span>
        <button className="btn" type="button" onClick={press}>
          Plan November
        </button>
      </div>
    </div>
  )
}

const Big = ({ v }) => {
  const [d, c] = D.usd(v).split('.')
  return (
    <>
      {d}
      <small>.{c}</small>
    </>
  )
}

function Tape({ people = D.people, title = 'The tally', compact }) {
  return (
    <aside className="tape" aria-label={title}>
      {compact ? (
        <div className="person-head">
          <span className="avatar" style={{ background: `var(--p-${people[0].id})` }}>
            {people[0].initial}
          </span>
          <div>
            <h2>{people[0].name}</h2>
            <p>{people[0].sub}</p>
          </div>
        </div>
      ) : (
        <>
          <h2>{title}</h2>
          <p>Every account in its own currency, adding up</p>
        </>
      )}
      <ul>
        {people.map((p) => (
          <TapeGroup key={p.id} p={p} label={!compact} />
        ))}
        <li className="eq">
          <span className="op">=</span>
          <span className="nm">
            <strong>{compact ? (people[0].id === 'maya' ? 'Yours' : people[0].id === 'joint' ? 'Joint' : "Leo's") : 'It all adds up'}</strong>
          </span>
          <span className="fig">{D.usd(people.reduce((s, p) => s + p.total, 0))}</span>
        </li>
      </ul>
      {!compact && <p className="foot">James keeps his own accounts private, so they&apos;re not in the tally.</p>}
    </aside>
  )
}
function TapeGroup({ p, label }) {
  return (
    <>
      {label && <li className="grp">{p.id === 'maya' ? 'Yours' : p.id === 'joint' ? 'With James' : 'Leo'}</li>}
      {p.accounts.map((a) => (
        <li key={a.name}>
          <span className="op">{a.bal < 0 ? '−' : '+'}</span>
          <span className="nm">
            <strong>{a.name}</strong>
            <span>
              {a.bank} ··{a.last4}
              {a.cur !== 'USD' && ` · ${a.cur === 'GBP' ? '£' : '€'}1 = $${a.rate.toFixed(2)}`}
              {a.note && ` · ${a.note}`}
            </span>
          </span>
          <span className="fig">
            {D.usd(Math.abs(a.usd))}
            {a.cur !== 'USD' && <em>{D.native(a)}</em>}
          </span>
        </li>
      ))}
    </>
  )
}

// Bklit line: spent so far in the one hue, dashed after today (forecast); an even pace dashed in grey.
function SpendChart() {
  return (
    <div className="card">
      <div className="card-head">
        <h2>October spending</h2>
        <div className="legend">
          <span>Spent, dashed after today</span>
          <span className="pace">Even pace to {D.usd(D.planned, 0)}</span>
        </div>
      </div>
      <LineChart data={D.series} aspectRatio="5 / 2" margin={{ left: 56, right: 16, top: 12, bottom: 28 }}>
        <Grid horizontal strokeDasharray="0" numTicksRows={4} />
        <Line
          dataKey="pace"
          curve={curveLinear}
          fadeEdges={false}
          stroke="var(--muted)"
          strokeWidth={1.5}
          dashFromIndex={0}
          showHighlight={false}
          animate={false}
        />
        <Line dataKey="spent" curve={curveLinear} fadeEdges={false} stroke="var(--hue)" strokeWidth={2} dashFromIndex={D.today - 1} animate={false} />
        <YAxis numTicks={4} formatValue={(v) => D.usd(v, 0)} />
        <XAxis />
      </LineChart>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        Today, Oct {D.today}: {D.usd(D.spent, 0)} spent. At this rate October ends near {D.usd(D.forecastEnd, 0)}. October bills went out on the 1st.
      </p>
    </div>
  )
}

function Due() {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Coming up</h2>
        <a className="link" href="#">
          Debts
        </a>
      </div>
      <ul className="rows">
        {D.due.map((d) => (
          <li key={d.name}>
            <span className="nm">
              <strong>{d.name}</strong>
              <span>
                {d.when} · from {d.from}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {d.inDays <= 5 && <span className="pill">In {d.inDays} days</span>}
              <span className="fig">{D.usd(d.amt)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="foot keys" style={{ justifyContent: 'space-between', borderTop: '3px double var(--ink)', paddingTop: 10, marginTop: 'auto' }}>
        <span>Next 8 days</span>
        <b className="fig">{D.usd(D.dueTotal)}</b>
      </p>
    </div>
  )
}

function Goals() {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Goals</h2>
        <a className="link" href="#">
          All goals
        </a>
      </div>
      <ul className="rows">
        {D.goals.map((g) => (
          <li key={g.name} style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span className="nm">
                <strong>{g.name}</strong>
                <span>
                  By {g.by} · {g.how}
                </span>
              </span>
              <span className="fig">
                {D.usd(g.saved, 0)}
                <em>of {D.usd(g.target, 0)}</em>
              </span>
            </div>
            <div className="track" style={{ marginTop: 8 }}>
              <i style={{ width: `${(g.saved / g.target) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Kokonut receipt printer, edited for a ledger receipt: October's spending, printed on demand.
function OctoberReceipt() {
  return (
    <div className="card printer-card">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>October receipt</h2>
        <span className="meta">
          {D.usd(D.left, 0)} left of {D.usd(D.planned, 0)}
        </span>
      </div>
      <ReceiptPrinter
        plain
        autoPrint={false}
        merchant="The Rivera family"
        order={null}
        date={`October 1–${D.today}, 2026`}
        items={D.cats.map((c) => ({ name: c.name, quantity: 1, price: c.spent, note: `of ${D.usd(c.planned, 0)}` }))}
        tax={0}
        totalLabel="Spent so far"
        footer={`${D.usd(D.left, 0)} left in the plan · It all adds up`}
        printLabel="Print October"
      />
    </div>
  )
}

// Kokonut spending ring: five parts in one hue at five strengths (taste-skill: one hue, five parts at most).
const RING = [
  { stroke: 'stroke-[var(--hue)]', dot: 'bg-[var(--hue)]' },
  { stroke: 'stroke-[color-mix(in_srgb,var(--hue)_75%,var(--surface))]', dot: 'bg-[color-mix(in_srgb,var(--hue)_75%,var(--surface))]' },
  { stroke: 'stroke-[color-mix(in_srgb,var(--hue)_55%,var(--surface))]', dot: 'bg-[color-mix(in_srgb,var(--hue)_55%,var(--surface))]' },
  { stroke: 'stroke-[color-mix(in_srgb,var(--hue)_38%,var(--surface))]', dot: 'bg-[color-mix(in_srgb,var(--hue)_38%,var(--surface))]' },
  { stroke: 'stroke-[color-mix(in_srgb,var(--hue)_22%,var(--surface))]', dot: 'bg-[color-mix(in_srgb,var(--hue)_22%,var(--surface))]' },
]
function OctoberRing() {
  const five = [...D.cats.slice(0, 4), { name: 'Other', spent: D.cats[4].spent + D.cats[5].spent }]
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 4 }}>
        <h2>October</h2>
        <span className="meta">Day {D.today} of 31</span>
      </div>
      <p className="fig" style={{ fontSize: 24 }}>
        {D.usd(D.left, 0)}{' '}
        <span className="muted" style={{ font: '400 14px Montserrat, system-ui' }}>
          left of {D.usd(D.planned, 0)}
        </span>
      </p>
      <SpendingRing title="Spent so far" currency="USD" categories={five.map((c, i) => ({ name: c.name, amount: c.spent, change: undefined, ...RING[i] }))} />
    </div>
  )
}

function Total({ people = true, due = false }) {
  return (
    <div className="card total">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <span className="label">The Rivera family · everything in US dollars</span>
        <a className="link" href="#">
          Accounts
        </a>
      </div>
      <p className="fig big">
        <Big v={D.total} />
      </p>
      {people ? (
        <>
          <div className="split" aria-hidden="true">
            {D.people.map((p) => (
              <i
                key={p.id}
                style={{
                  width: `${(p.total / D.total) * 100}%`,
                  background: p.id === 'maya' ? 'var(--hue)' : p.id === 'joint' ? 'var(--muted)' : 'var(--warning)',
                }}
              />
            ))}
          </div>
          <div className="keys">
            {D.people.map((p) => (
              <span key={p.id}>
                {p.name} <b className="fig">{D.usd(p.total)}</b>
              </span>
            ))}
          </div>
          <div className="keys" style={{ marginTop: 8 }}>
            {D.byCur.map((c) => (
              <span key={c.cur}>
                {c.cur} <b className="fig">{c.cur === 'USD' ? D.usd(c.usd) : `${D.native({ cur: c.cur, bal: c.native })} = ${D.usd(c.usd)}`}</b>
              </span>
            ))}
          </div>
          {due && (
            <>
              <p className="sect" style={{ marginTop: 20 }}>
                Coming up in the next 8 days · {D.usd(D.dueTotal)}
              </p>
              <ul className="rows">
                {D.due.map((d) => (
                  <li key={d.name}>
                    <span className="nm">
                      <strong>{d.name}</strong>
                      <span>
                        {d.when} · from {d.from}
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {d.inDays <= 5 && <span className="pill">In {d.inDays} days</span>}
                      <span className="fig">{D.usd(d.amt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <div className="keys" style={{ marginTop: 8 }}>
          {D.byCur.map((c) => (
            <span key={c.cur}>
              {c.cur} <b className="fig">{c.cur === 'USD' ? D.usd(c.usd) : `${D.native({ cur: c.cur, bal: c.native })} = ${D.usd(c.usd)}`}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function PersonCard({ p }) {
  const goals = D.goals.filter((g) => g.who === p.id)
  const due = D.due.filter((d) => p.accounts.some((a) => a.name === d.from))
  return (
    <div className="card">
      <div className="person-head">
        <span className="avatar" style={{ background: `var(--p-${p.id})` }}>
          {p.initial}
        </span>
        <div>
          <h2>{p.name}</h2>
          <p>{p.sub}</p>
        </div>
        <span className="fig">{D.usd(p.total)}</span>
      </div>
      <ul className="rows">
        {p.accounts.map((a) => (
          <li key={a.name}>
            <span className="nm">
              <strong>{a.name}</strong>
              <span>
                {a.bank} ··{a.last4}
                {a.note && ` · ${a.note}`}
              </span>
            </span>
            <span className="fig">
              {D.usd(a.usd)}
              {a.cur !== 'USD' && <em>{D.native(a)}</em>}
            </span>
          </li>
        ))}
      </ul>
      {due.length > 0 && (
        <>
          <p className="sect">Coming up</p>
          <ul className="rows">
            {due.map((d) => (
              <li key={d.name}>
                <span className="nm">
                  <strong>{d.name}</strong>
                  <span>{d.when}</span>
                </span>
                <span className="fig">{D.usd(d.amt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {goals.length > 0 && (
        <>
          <p className="sect">Saving for</p>
          {goals.map((g) => (
            <div key={g.name} style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ fontWeight: 600 }}>{g.name}</strong>
                <span className="fig">
                  {D.usd(g.saved, 0)}{' '}
                  <span className="muted" style={{ font: '400 13px Montserrat, system-ui' }}>
                    of {D.usd(g.target, 0)}
                  </span>
                </span>
              </div>
              <div className="track" style={{ marginTop: 8 }}>
                <i style={{ width: `${(g.saved / g.target) * 100}%` }} />
              </div>
            </div>
          ))}
        </>
      )}
      {p.id === 'joint' && (
        <div className="private">
          <span className="avatar" style={{ background: 'var(--p-james)' }}>
            J
          </span>
          <span>James keeps his own accounts private. Only what you share shows here.</span>
        </div>
      )}
    </div>
  )
}

// ---------- The three designs ----------
function ReceiptDesign() {
  return (
    <>
      <TitleRow title="Home" />
      <div className="grid d-receipt">
        <Tape />
        <div className="d-right">
          <Total people={false} />
          <SpendChart />
          <div className="pair">
            <Due />
            <Goals />
          </div>
          <OctoberReceipt />
        </div>
      </div>
    </>
  )
}

function ColumnsDesign() {
  const [maya, joint, leo] = D.people
  return (
    <>
      <TitleRow title="The Rivera family" />
      <div className="grid d-cols-top">
        <Total due />
        <OctoberRing />
      </div>
      <div className="grid d-cols">
        <PersonCard p={maya} />
        <div className="stack">
          <PersonCard p={joint} />
          <PersonCard p={leo} />
        </div>
      </div>
    </>
  )
}

function MixDesign() {
  return (
    <>
      <TitleRow title="Evening, Maya" />
      <div className="eqn" role="img" aria-label={`${D.people.map((p) => `${p.name} ${D.usd(p.total)}`).join(' plus ')} equals ${D.usd(D.total)}`}>
        {D.people.map((p, i) => (
          <span key={p.id} style={{ display: 'contents' }}>
            {i > 0 && <span className="op">+</span>}
            <span className="part">
              <span className="avatar" style={{ background: `var(--p-${p.id})` }}>
                {p.initial}
              </span>
              <span className="fig">{D.usd(p.total)}</span>
            </span>
          </span>
        ))}
        <span className="op">=</span>
        <span className="part sum">
          <span className="fig">
            <Big v={D.total} />
          </span>
        </span>
      </div>
      <div className="hang" aria-hidden="true" />
      <div className="grid d-tapes">
        {D.people.map((p) => (
          <Tape key={p.id} people={[p]} compact />
        ))}
      </div>
      <div className="grid d-bottom">
        <SpendChart />
        <OctoberReceipt />
      </div>
    </>
  )
}

const VIEWS = { receipt: ReceiptDesign, columns: ColumnsDesign, mix: MixDesign }
const WHY = {
  receipt:
    'The tally tape you liked, pinned on the left. Light: Achromatic ledger (stone ground, one blue on the spending line). Dark: Data terminal (1px accent lines, signs on numbers). Kokonut receipt printer prints October on demand.',
  columns:
    'The family as columns: You, then Joint and Leo stacked. Light: Pastel consumer (people tints, balance carries the screen). Dark: True-black flat (warm near-black, Clay as the one data hue). Kokonut spending ring for October.',
  mix: 'Each person is a receipt hanging from one line, and the line above adds them up. Light: Achromatic ledger. Dark: True-black flat. Bklit spending line and the Kokonut October receipt below.',
}

export default function HomeDrafts() {
  const q = new URLSearchParams(location.search)
  const [design, setDesign] = useState(q.get('d') || 'mix')
  const [theme, setTheme] = useState(q.get('t') || 'light')
  const style = STYLES[DESIGNS[design][theme]]
  const View = VIEWS[design]
  useEffect(() => {
    document.documentElement.classList.toggle('dark', style.dark)
    document.body.style.background = style.vars['--ground']
  }, [style])
  return (
    <div className={`home style-${DESIGNS[design][theme]} shell-${style.shell}`} style={{ ...style.vars, '--bar-h': '48px' }}>
      <div className="lab-bar">
        <span>
          <b>Draft for #182</b> · 100% taste-skill · Tallyn fonts and logo · <b>made-up names and amounts</b>
        </span>
        <span className="grp" role="group" aria-label="Design">
          {Object.entries(DESIGNS).map(([k, d]) => (
            <button key={k} type="button" aria-pressed={k === design} onClick={() => setDesign(k)}>
              {d.name}
              {k === 'mix' ? ' (recommended)' : ''}
            </button>
          ))}
        </span>
        <span className="grp" role="group" aria-label="Theme">
          {['light', 'dark'].map((t) => (
            <button key={t} type="button" aria-pressed={t === theme} onClick={() => setTheme(t)}>
              {t === 'light' ? 'Light' : 'Dark'}: {STYLES[DESIGNS[design][t]].name}
            </button>
          ))}
        </span>
      </div>
      <Shell style={style}>
        <p className="lab-note" style={{ padding: '0 0 16px' }}>
          <b>{DESIGNS[design].name}.</b> {WHY[design]}
        </p>
        <View />
      </Shell>
    </div>
  )
}
