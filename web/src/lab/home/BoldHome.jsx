// Bold Home drafts for #182, round 2. The libraries lead (Dinesh, 2026-10-25): Kokonut UI and
// Bklit at full strength, anime.js for the moments that explain something, emil-design-eng and
// animate for how motion feels. taste-skill keeps the data honest. All names and amounts are made up.
import { useEffect, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { Plane, Receipt, CreditCard, Car, PiggyBank } from 'lucide-react'
import SplitFlapText from '@/components/kokonutui/split-flap-text'
import BoardingPass from '@/components/kokonutui/boarding-pass'
import CardStack from '@/components/kokonutui/card-stack'
import NotificationStack from '@/components/kokonutui/notification-stack'
import ActivityTerrain from '@/components/kokonutui/activity-terrain'
import LiquidGauge from '@/components/kokonutui/liquid-gauge'
import ReceiptPrinter from '@/components/kokonutui/receipt-printer'
import { SankeyChart, SankeyLink, SankeyNode, SankeyTooltip } from '@/components/charts/sankey'
import { Gauge } from '@/components/charts/gauge'
import * as D from './data.js'
import lockupLight from '../../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg?url'
import lockupDark from '../../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg?url'

// Palettes to test: each sets the accent the libraries use. Light and dark come from Tailwind's dark variant.
const PALETTES = {
  ember: { name: 'Ember', accent: '#f97316', button: '#c2410c', second: '#0ea5e9', note: "Kokonut's own orange" },
  clay: { name: 'Sage & Clay', accent: '#C8553D', button: '#B04A34', second: '#6F9575', note: "Tallyn's brand colours" },
  ocean: { name: 'Ocean', accent: '#2563eb', button: '#1d4ed8', second: '#14b8a6', note: 'Blue and teal' },
  orchid: { name: 'Orchid', accent: '#a21caf', button: '#a21caf', second: '#f59e0b', note: 'Violet and amber' },
  // Red, green, white and black: Light/Dark gives the white or black ground; these pick which colour leads.
  green: {
    name: 'RGWB · green lead',
    accent: '#16a34a',
    button: '#15803d',
    second: '#6b7280',
    owe: '#dc2626',
    chart: ['#16a34a', '#6b7280', '#22c55e', '#9ca3af', '#15803d'],
    note: 'Green for actions and money, red only for what you owe',
  },
  red: {
    name: 'RGWB · red lead',
    accent: '#dc2626',
    button: '#b91c1c',
    second: '#16a34a',
    owe: '#dc2626',
    chart: ['#dc2626', '#6b7280', '#16a34a', '#9ca3af', '#b91c1c'],
    note: 'Red as the brand colour, green for money in',
  },
}

const money = (v) => D.usd(v)

// ---- Data shaped for each component ----
// Sankey: every account flows into its person, every person into the household. It all adds up.
function flowData() {
  const nodes = []
  const links = []
  const idx = (name) => {
    let i = nodes.findIndex((n) => n.name === name)
    if (i < 0) i = nodes.push(name.endsWith(')') ? { name, category: 'source' } : { name }) - 1
    return i
  }
  const positive = D.accounts.filter((a) => a.usd > 0)
  for (const a of positive) {
    const p = D.people.find((x) => x.id === a.who)
    links.push({ source: idx(`${a.name} (${a.cur})`), target: idx(p.name), value: Math.round(a.usd) })
  }
  for (const p of D.people) {
    const gross = positive.filter((a) => a.who === p.id).reduce((s, a) => s + a.usd, 0)
    links.push({ source: idx(p.name), target: idx('The Riveras'), value: Math.round(gross) })
  }
  return { nodes, links }
}

const BILL_ICONS = { 'Amex card': CreditCard, 'Car loan': Car, "Leo's allowance": PiggyBank }
const bills = D.due.map((d, i) => {
  const I = BILL_ICONS[d.name] || Receipt
  return {
    id: `bill-${i}`,
    app: `Due ${d.when}`,
    title: `${d.name} · ${money(d.amt)}`,
    body: `From ${d.from}${d.inDays <= 5 ? `, in ${d.inDays} days` : ''}.`,
    time: d.when,
    icon: (
      <span className="flex size-8 items-center justify-center rounded-lg text-white" style={{ background: d.inDays <= 5 ? 'var(--owe)' : 'var(--accent)' }}>
        <I className="size-4" />
      </span>
    ),
  }
})

const beach = D.goals[0]
const beachPass = {
  airline: 'Tallyn Goals',
  number: 'TG 2027',
  from: { code: 'NOW', city: `${money(beach.saved).replace('.00', '')} saved`, time: 'Oct 24' },
  to: { code: 'SUN', city: `${money(beach.target).replace('.00', '')} beach trip`, time: 'Jun 27' },
  date: 'June 2027',
  gate: '68%',
  boards: '$200',
  seat: 'All',
  group: '4',
  passenger: 'The Riveras',
  status: 'on-time',
  note: 'On track: put aside $200 a month to make June.',
}

function Initial({ letter, tone }) {
  return (
    <div className="flex size-full items-center justify-center" style={{ background: tone }}>
      <span className="font-display text-6xl font-bold text-white/95">{letter}</span>
    </div>
  )
}
const deck = D.people.map((p, i) => ({
  id: p.id,
  title: p.name,
  subtitle: p.sub,
  art: <Initial letter={p.initial} tone={['var(--accent)', 'var(--second)', '#71717a'][i]} />,
  description: p.accounts.map((a) => `${a.name} ${D.usd(a.usd)}`).join(' · '),
  specs: [
    { label: 'Accounts', value: String(p.accounts.length) },
    { label: 'Currencies', value: [...new Set(p.accounts.map((a) => a.cur))].join(', ') },
    { label: 'Share', value: `${Math.round((p.total / D.total) * 100)}%` },
  ],
  price: D.usd(p.total),
}))

// 13 weeks of daily spending ending today; October is the real draft data, earlier weeks are made up.
function terrainData() {
  const out = []
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const before = 13 * 7 - D.today
  for (let i = 0; i < before; i++) out.push(Math.round(20 + rnd() * 120))
  let prev = 0
  for (const row of D.series.slice(0, D.today)) {
    out.push(row.spent - prev)
    prev = row.spent
  }
  return out.map((v) => Math.min(9, Math.round(v / 40)))
}

// ---- Motion (animate + emil-design-eng): one staggered arrival per session, transform and opacity only ----
function useArrival(ref, key) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const seen = sessionStorage.getItem('tallyn-arrived')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const items = el.querySelectorAll('[data-arrive]')
    if (seen || reduce) return
    animate(items, {
      opacity: [0, 1],
      translateY: [12, 0],
      scale: [0.98, 1],
      delay: stagger(60),
      duration: 420,
      ease: 'cubicBezier(0.23, 1, 0.32, 1)',
      onComplete: () => sessionStorage.setItem('tallyn-arrived', '1'),
    })
  }, [ref, key])
}

function pressable(e) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  animate(e.currentTarget, { scale: [1, 0.97, 1], duration: 160, ease: 'cubicBezier(0.23, 1, 0.32, 1)' })
}

const Panel = ({ title, meta, children, className = '' }) => (
  <section data-arrive className={`min-w-0 rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
    {title && (
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {meta && <span className="text-sm text-zinc-500 dark:text-zinc-400">{meta}</span>}
      </header>
    )}
    {children}
  </section>
)

function Board() {
  return (
    <div data-arrive className="rounded-3xl bg-zinc-950 p-6 text-white md:p-8 dark:bg-black">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
        <span>The Rivera family · everything, in US dollars</span>
        <span>Updated 9:41</span>
      </div>
      <div className="mt-5 overflow-x-auto">
        <SplitFlapText text={D.usd(D.total)} className="text-4xl md:text-6xl" />
      </div>
      <div className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
        {D.byCur.map((c) => (
          <div key={c.cur} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3">
            <span className="font-semibold tracking-wide text-zinc-300">{c.cur}</span>
            <span className="text-right tabular-nums">
              {c.cur === 'USD' ? D.usd(c.usd) : D.native({ cur: c.cur, bal: c.native })}
              {c.cur !== 'USD' && <span className="block text-xs text-zinc-400">= {D.usd(c.usd)}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Flow() {
  return (
    <Panel title="Where the total comes from" meta="Each account flows into its owner, and every owner into the family">
      <SankeyChart data={flowData()} aspectRatio="21 / 8" nodeWidth={12} nodePadding={18}>
        <SankeyLink />
        <SankeyNode formatValue={(v) => D.usd(v, 0)} />
        <SankeyTooltip />
      </SankeyChart>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        The Amex card ({D.usd(1286.4)} owed) comes off your share, so the flows add to {D.usd(D.total + 1286.4)} before it and {D.usd(D.total)} after.
      </p>
    </Panel>
  )
}

function October() {
  return (
    <Panel title="October plan" meta={`Day ${D.today} of ${D.days}`}>
      <LiquidGauge value={Math.round((D.spent / D.planned) * 100)} readOnly label="Spent of the plan" total={D.planned} unit="USD" warnAt={95} />
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
        <b className="text-zinc-900 dark:text-white">{D.finding.strong}</b>
        {D.finding.rest}
      </p>
    </Panel>
  )
}

function PlanGauge() {
  return (
    <Panel title="October, notch by notch" meta={`${D.usd(D.spent, 0)} of ${D.usd(D.planned, 0)}`}>
      <Gauge value={Math.round((D.spent / D.planned) * 100)} centerValue={D.left} prefix="$" defaultLabel="Left to spend" activeFill="var(--accent)" />
    </Panel>
  )
}

function Bills() {
  return (
    <Panel title="Coming up" meta={`Next 8 days · ${D.usd(D.dueTotal)}`}>
      <NotificationStack notifications={bills} />
    </Panel>
  )
}

function Goal() {
  return (
    <Panel title="Beach trip" meta={`${D.usd(beach.saved, 0)} of ${D.usd(beach.target, 0)}`}>
      <BoardingPass flight={beachPass} />
    </Panel>
  )
}

function Family() {
  return (
    <Panel title="The family" meta="Swipe through">
      <CardStack cards={deck} accent="var(--accent)" actionLabel="Open accounts" />
    </Panel>
  )
}

function OctoberReceipt() {
  return (
    <Panel title="October receipt" meta={`${D.usd(D.left, 0)} left`}>
      <ReceiptPrinter
        merchant="The Rivera family"
        order="October"
        date={`Oct 1 – ${D.today}, 2026`}
        items={D.cats.map((c) => ({ name: c.name, quantity: 1, price: c.spent }))}
        tax={0}
        totalLabel="Spent so far"
        footer="It all adds up"
        autoPrint={false}
        printLabel="Print October"
      />
    </Panel>
  )
}

function Terrain() {
  return (
    <Panel title="Spending, day by day" meta="Last 13 weeks · drag to tilt">
      <ActivityTerrain data={terrainData()} endDate="2026-10-24" title="Daily spending" />
    </Panel>
  )
}

// ---- Designs ----
const DESIGNS = {
  arrivals: {
    name: 'Arrivals board',
    why: 'The family total flips into place like a departures board, and the sankey shows every account flowing into it. Bills arrive as a notification stack; the beach trip is a boarding pass.',
    View: () => (
      <div className="grid gap-6">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Board />
          <Bills />
        </div>
        <Flow />
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Goal />
          <October />
        </div>
      </div>
    ),
  },
  table: {
    name: 'Kitchen table',
    why: "Money as the family's things on a table: a deck of the family's cards to swipe, October printed as a receipt, the plan as a glass filling up, and the days as terrain.",
    View: () => (
      <div className="grid gap-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Family />
          <OctoberReceipt />
          <October />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Terrain />
          <PlanGauge />
        </div>
      </div>
    ),
  },
  mix: {
    name: 'Mix',
    why: 'The arrivals board and the flow from Arrivals, the receipt and the family deck from Kitchen table, and the boarding pass for the goal.',
    View: () => (
      <div className="grid gap-6">
        <Board />
        <Flow />
        <div className="grid gap-6 lg:grid-cols-3">
          <OctoberReceipt />
          <Family />
          <Goal />
        </div>
      </div>
    ),
  },
}

export default function BoldHome() {
  const q = new URLSearchParams(location.search)
  const [design, setDesign] = useState(q.get('d') in DESIGNS ? q.get('d') : 'mix')
  const [dark, setDark] = useState(q.get('t') === 'dark')
  const [pal, setPal] = useState(q.get('p') in PALETTES ? q.get('p') : 'ember')
  const root = useRef(null)
  useArrival(root, design)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.body.style.background = dark ? '#09090b' : '#fafafa'
  }, [dark])
  const P = PALETTES[pal]
  const View = DESIGNS[design].View
  return (
    <div
      ref={root}
      className="min-h-svh bg-zinc-50 font-body text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      style={{
        '--button': P.button,
        '--accent': P.accent,
        '--second': P.second,
        '--owe': P.owe || P.accent,
        '--chart-line-primary': P.accent,
        ...(P.chart ? Object.fromEntries(P.chart.map((c, i) => [`--chart-${i + 1}`, c])) : { '--chart-1': P.accent, '--chart-2': P.second }),
      }}
    >
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-4 gap-y-2 bg-zinc-200 px-4 py-2 text-[13px] text-zinc-700">
        <span>
          <b className="text-zinc-900">Draft for #182, round 2</b> · libraries lead · <b className="text-zinc-900">made-up names and amounts</b>
        </span>
        <span className="flex flex-wrap gap-1">
          {Object.entries(DESIGNS).map(([k, d]) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === design}
              onClick={() => setDesign(k)}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-semibold aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white"
            >
              {d.name}
              {k === 'mix' ? ' (recommended)' : ''}
            </button>
          ))}
        </span>
        <span className="flex flex-wrap gap-1">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={v === dark}
              onClick={() => setDark(v)}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-semibold aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white"
            >
              {v ? 'Dark' : 'Light'}
            </button>
          ))}
        </span>
        <span className="flex flex-wrap gap-1">
          {Object.entries(PALETTES).map(([k, p]) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === pal}
              onClick={() => setPal(k)}
              title={p.note}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1 font-semibold aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white"
            >
              <i
                className="size-2.5 rounded-full"
                style={{ background: p.owe && p.owe !== p.accent ? `linear-gradient(90deg, ${p.accent} 50%, ${p.owe} 50%)` : p.accent }}
              />
              {p.name}
            </button>
          ))}
        </span>
      </div>

      <header className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-3 px-4 pt-6 md:px-8">
        <img src={dark ? lockupDark : lockupLight} alt="Tallyn" className="h-7" />
        <nav aria-label="Main" className="flex flex-wrap gap-5 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          {['Home', 'Accounts', 'Transactions', 'Budgets', 'Goals', 'Family'].map((n) => (
            <a
              key={n}
              href="#"
              aria-current={n === 'Home' ? 'page' : undefined}
              className="aria-[current=page]:text-zinc-900 dark:aria-[current=page]:text-white"
            >
              {n}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={pressable}
          className="ml-auto rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
          style={{ background: 'var(--button)' }}
        >
          Plan November
        </button>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pt-6 pb-16 md:px-8">
        <h1 className="text-2xl font-bold">Evening, Maya</h1>
        <p className="mt-1 mb-6 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
          <b className="text-zinc-700 dark:text-zinc-200">{DESIGNS[design].name}.</b> {DESIGNS[design].why} Palette: {P.name} ({P.note}).
        </p>
        <View />
      </main>
    </div>
  )
}
