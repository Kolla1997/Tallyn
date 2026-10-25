// Tallyn's Home, redesigned (#182, round 3b). Same jobs as web/src/screens/HomePage.jsx (total with
// Yours/Everyone, accounts, credit cards, spending this month, recent transactions by kind, shared
// with you, family, goals), rebuilt with Kokonut UI, Bklit charts and anime.js.
// Palette: red, green, white, black, red lead (Dinesh, 2026-10-25). Fonts and logo: Tallyn's.
// Motion follows the animate and emil-design-eng skills. All names and amounts are made up.
//
// Layout: four rows, each an 8 + 4 pair on a 12-column grid with one 16px gutter.
//   1 How much do we have, and what's due?      Total (flip board)            | Coming up + credit card
//   2 How is this month going?                   Categories + plan gauge       | Recent transactions
//   3 Where is the money, and whose?             Sankey (is the accounts list) | Family deck + shared
//   4 How did we spend, what do we save for?     Day-by-day terrain            | Goals
import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import {
  Home as HomeIcon,
  Landmark,
  PieChart,
  Link2,
  Users,
  CreditCard,
  Car,
  PiggyBank,
  ShoppingBasket,
  Utensils,
  Bus,
  Baby,
  Zap,
  PartyPopper,
  ArrowLeftRight,
  Banknote,
} from 'lucide-react'
import SplitFlapText from '@/components/kokonutui/split-flap-text'
import BoardingPass from '@/components/kokonutui/boarding-pass'
import CardStack from '@/components/kokonutui/card-stack'
import NotificationStack from '@/components/kokonutui/notification-stack'
import ActivityTerrain from '@/components/kokonutui/activity-terrain'
import LiquidGauge from '@/components/kokonutui/liquid-gauge'
import SmoothTab from '@/components/kokonutui/smooth-tab'
import { SankeyChart, SankeyLink, SankeyNode, SankeyTooltip } from '@/components/charts/sankey'
import { Gauge } from '@/components/charts/gauge'
import * as D from './data.js'
import lockupLight from '../../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg?url'
import lockupDark from '../../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg?url'

// Red lead. Red is the brand and the one action; green is money in; red also marks what is owed.
const PAL = {
  '--accent': '#dc2626',
  '--button': '#b91c1c',
  '--in': '#16a34a',
  '--owe': '#dc2626',
  '--chart-1': '#dc2626',
  '--chart-2': '#6b7280',
  '--chart-3': '#16a34a',
  '--chart-4': '#9ca3af',
  '--chart-5': '#b91c1c',
  '--chart-line-primary': '#dc2626',
}
// Text needs AA: deeper red and green on white, lighter on black. Bright ones stay on fills and charts.
const TEXT = { light: { '--in-text': '#15803d', '--owe-text': '#b91c1c' }, dark: { '--in-text': '#4ade80', '--owe-text': '#f87171' } }
const EASE = 'cubicBezier(0.23, 1, 0.32, 1)' // emil-design-eng: strong ease-out for UI
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const usd = D.usd

// ---- Draft data on top of data.js ----
const amex = D.accounts.find((a) => a.bank === 'Amex')
const CARD_LIMIT = 5000 // made up
const TXS = [
  { kind: 'spending', name: 'Whole Foods', cat: 'Groceries', icon: ShoppingBasket, when: 'Today', who: 'You', amt: -86.4 },
  { kind: 'spending', name: 'Shell', cat: 'Transport', icon: Bus, when: 'Today', who: 'You and James', amt: -48.1 },
  { kind: 'spending', name: 'Little Sprouts', cat: 'Kids', icon: Baby, when: 'Yesterday', who: 'You and James', amt: -120.0 },
  { kind: 'spending', name: 'Nando’s', cat: 'Eating out', icon: Utensils, when: 'Oct 22', who: 'You', amt: -38.75 },
  { kind: 'spending', name: 'Con Edison', cat: 'Bills', icon: Zap, when: 'Oct 21', who: 'You and James', amt: -145.0 },
  { kind: 'income', name: 'Payroll · Harlow & Co', cat: 'Pay', icon: Banknote, when: 'Oct 15', who: 'You', amt: 4210.0 },
  { kind: 'income', name: 'James · to Joint', cat: 'From James', icon: Banknote, when: 'Oct 15', who: 'You and James', amt: 1800.0 },
  { kind: 'transfers', name: 'Amex payment', cat: 'Card payment', icon: ArrowLeftRight, when: 'Oct 3', who: 'You', amt: -1102.55 },
  { kind: 'transfers', name: 'To High-yield savings', cat: 'Between your accounts', icon: ArrowLeftRight, when: 'Oct 1', who: 'You', amt: -500.0 },
]

const scopeData = (scope) => {
  const mine = D.people.find((p) => p.id === 'maya')
  const people = scope === 'yours' ? [mine] : D.people
  const accts = scope === 'yours' ? mine.accounts : D.accounts
  const have = accts.filter((a) => a.usd > 0).reduce((s, a) => s + a.usd, 0)
  const owe = -accts.filter((a) => a.usd < 0).reduce((s, a) => s + a.usd, 0)
  const byCur = ['USD', 'GBP', 'EUR'].map((cur) => ({
    cur,
    native: accts.filter((a) => a.cur === cur).reduce((s, a) => s + a.bal, 0),
    usd: accts.filter((a) => a.cur === cur).reduce((s, a) => s + a.usd, 0),
  }))
  return { people, accts, have, owe, net: Math.round((have - owe) * 100) / 100, byCur }
}

// ---- Motion (animate skill: purpose first) ----
// Arrival: once per session (rare tier). Purpose: the order of the screen.
function useArrival(ref) {
  useEffect(() => {
    if (!ref.current || reduced() || sessionStorage.getItem('tallyn-home-r3')) return
    animate(ref.current.querySelectorAll('[data-arrive]'), {
      opacity: [0, 1],
      translateY: [12, 0],
      delay: stagger(50),
      duration: 380,
      ease: EASE,
      onComplete: () => sessionStorage.setItem('tallyn-home-r3', '1'),
    })
  }, [ref])
}
// Count-up on scope change: state indication, 260ms.
function Count({ value }) {
  const el = useRef(null)
  const prev = useRef(value)
  useEffect(() => {
    const node = el.current
    if (!node) return
    if (reduced() || prev.current === value) {
      node.textContent = usd(value)
      prev.current = value
      return
    }
    const o = { v: prev.current }
    animate(o, { v: value, duration: 260, ease: EASE, onUpdate: () => (node.textContent = usd(o.v)) })
    prev.current = value
  }, [value])
  return <span ref={el}>{usd(value)}</span>
}

// ---- Building blocks ----
const Panel = ({ title, meta, children, className = '', id }) => (
  <section
    data-arrive
    aria-labelledby={id}
    className={`h-full min-w-0 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
  >
    {title && (
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="font-[family-name:'Space_Grotesk'] text-[17px] font-semibold text-zinc-900 dark:text-white">
          {title}
        </h2>
        {meta && <span className="text-sm text-zinc-500 dark:text-zinc-400">{meta}</span>}
      </header>
    )}
    {children}
  </section>
)
const Money = ({ v, className = '' }) => <span className={`font-[family-name:'Space_Grotesk'] font-semibold tabular-nums ${className}`}>{usd(v)}</span>
const See = ({ children }) => (
  <a
    href="#"
    className="text-sm font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900 dark:text-white dark:decoration-zinc-600"
  >
    {children}
  </a>
)
const IconBox = ({ icon: I }) => (
  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
    <I className="size-4" aria-hidden="true" />
  </span>
)

// Row 1 ------------------------------------------------------------------
function Total({ scope, setScope }) {
  const s = useMemo(() => scopeData(scope), [scope])
  return (
    <section
      data-arrive
      aria-label={scope === 'yours' ? 'Your balance' : 'Total balance'}
      className="flex h-full flex-col justify-between gap-5 rounded-3xl bg-zinc-950 p-5 text-white md:p-7 dark:bg-black dark:ring-1 dark:ring-zinc-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{scope === 'yours' ? 'Your balance · US dollars' : 'Total balance · US dollars · everything you can see'}</p>
        <div role="group" aria-label="Show on Home" className="flex rounded-full bg-white/10 p-1 text-sm font-semibold">
          {[
            ['yours', 'Yours'],
            ['everyone', 'Everyone'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={scope === k}
              onClick={() => setScope(k)}
              className="rounded-full px-4 py-1.5 text-zinc-300 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] aria-pressed:bg-white aria-pressed:text-zinc-950"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="overflow-x-auto pb-1">
          <SplitFlapText text={usd(s.have)} className="text-4xl md:text-6xl" />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          <span className="text-zinc-200">−{usd(D.spent)}</span> spent this month · net worth{' '}
          <span className="text-zinc-200">
            <Count value={s.net} />
          </span>{' '}
          after {usd(s.owe)} owed on cards
        </p>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        {s.byCur
          .filter((c) => c.native !== 0)
          .map((c) => (
            <div key={c.cur} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
              <span className="font-semibold text-zinc-300">{c.cur}</span>
              <span className="text-right tabular-nums">
                {c.cur === 'USD' ? usd(c.usd) : D.native({ cur: c.cur, bal: c.native })}
                {c.cur !== 'USD' && <span className="block text-xs text-zinc-400">= {usd(c.usd)}</span>}
              </span>
            </div>
          ))}
      </div>
    </section>
  )
}

function Bills() {
  const ICON = { 'Amex card': CreditCard, 'Car loan': Car, "Leo's allowance": PiggyBank }
  const items = D.due.map((d, i) => {
    const I = ICON[d.name]
    return {
      id: `b${i}`,
      app: `Due ${d.when}`,
      title: `${d.name} · ${usd(d.amt)}`,
      body: `From ${d.from}, in ${d.inDays} days.`,
      time: d.when,
      icon: (
        <span className="flex size-8 items-center justify-center rounded-lg text-white" style={{ background: d.inDays <= 5 ? 'var(--owe)' : '#3f3f46' }}>
          <I className="size-4" aria-hidden="true" />
        </span>
      ),
    }
  })
  return (
    <Panel id="bills-h" title="Coming up" meta={`Next 8 days · ${usd(D.dueTotal)}`}>
      <NotificationStack notifications={items} />
    </Panel>
  )
}

function Cards() {
  const used = Math.round((-amex.bal / CARD_LIMIT) * 100)
  return (
    <Panel id="cards-h" title="Credit card" meta={<See>Debts</See>}>
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="block font-semibold">Amex ··{amex.last4}</span>
          <span className="block text-sm text-zinc-500 dark:text-zinc-400">
            {usd(CARD_LIMIT + amex.bal, 0)} available of {usd(CARD_LIMIT, 0)}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-[family-name:'Space_Grotesk'] font-semibold tabular-nums" style={{ color: 'var(--owe-text)' }}>
            −{usd(-amex.bal)}
          </span>
          <span className="block text-sm text-zinc-500 dark:text-zinc-400">{used}% of the limit</span>
        </span>
      </div>
      <div className="mt-3">
        <Gauge orientation="linear" value={used} totalNotches={30} activeFill="var(--owe)" defaultLabel="Limit used" suffix="%" minWidth={160} />
      </div>
    </Panel>
  )
}

// Row 2 ------------------------------------------------------------------
function Spending({ scope }) {
  const ICON = { Bills: Zap, Groceries: ShoppingBasket, Kids: Baby, 'Eating out': Utensils, Transport: Bus, Fun: PartyPopper }
  return (
    <Panel
      id="sp-h"
      title={scope === 'yours' ? 'Your spending in October' : 'Spending in October'}
      meta={`${usd(D.spent, 0)} of ${usd(D.planned, 0)} · day ${D.today} of ${D.days}`}
    >
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {D.cats.map((c) => {
            const pct = (c.spent / c.planned) * 100
            return (
              <li key={c.name}>
                <a href="#" className="flex items-center gap-3 py-2.5 transition-transform duration-150 ease-out active:scale-[0.99]">
                  <IconBox icon={ICON[c.name]} />
                  <span className="min-w-0 grow">
                    <span className="flex justify-between gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <Money v={c.spent} />
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.min(100, pct)}%`, background: pct >= 90 ? 'var(--accent)' : '#71717a' }}
                      />
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                      {Math.round(pct)}% of {usd(c.planned, 0)}
                      {pct >= 90 && ' · nearly used'}
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
        <div className="flex justify-center">
          <LiquidGauge value={Math.round((D.spent / D.planned) * 100)} readOnly label="October plan used" total={D.planned} unit="USD" warnAt={95} />
        </div>
      </div>
    </Panel>
  )
}

function Recent({ scope }) {
  const pick = (kind) => TXS.filter((t) => t.kind === kind && (scope === 'everyone' || t.who === 'You'))
  const list = (kind, note) => (
    <div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {pick(kind).map((t) => (
          <li key={t.name + t.when} className="flex items-center gap-3 py-2.5">
            <IconBox icon={t.icon} />
            <span className="min-w-0 grow">
              <span className="block truncate font-semibold">{t.name}</span>
              <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
                {t.cat} · {t.when}
                {scope === 'everyone' && ` · ${t.who}`}
              </span>
            </span>
            <span className="font-[family-name:'Space_Grotesk'] font-semibold tabular-nums" style={t.amt > 0 ? { color: 'var(--in-text)' } : undefined}>
              {t.amt > 0 ? '+' : '−'}
              {usd(Math.abs(t.amt))}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{note}</p>}
    </div>
  )
  return (
    <Panel id="tx-h" title={scope === 'yours' ? 'Your recent transactions' : 'Recent transactions'} meta={<See>See all</See>}>
      <SmoothTab
        label="Kind of transaction"
        activeColor="bg-zinc-900 dark:bg-white"
        activeTextColor="text-white dark:text-zinc-900"
        items={[
          { id: 'spending', title: 'Spending', content: list('spending') },
          {
            id: 'transfers',
            title: 'Transfers',
            content: list('transfers', 'Card payments and moves between your own accounts sit here, so they don’t look like spending.'),
          },
          { id: 'income', title: 'Income', content: list('income') },
        ]}
      />
    </Panel>
  )
}

// Row 3 ------------------------------------------------------------------
function Flow({ scope }) {
  const data = useMemo(() => {
    const s = scopeData(scope)
    const nodes = []
    const links = []
    const idx = (name, source) => {
      let i = nodes.findIndex((n) => n.name === name)
      if (i < 0) i = nodes.push(source ? { name, category: 'source' } : { name }) - 1
      return i
    }
    const pos = s.accts.filter((a) => a.usd > 0)
    for (const a of pos)
      links.push({ source: idx(`${a.name} (${a.cur})`, true), target: idx(D.people.find((p) => p.id === a.who).name), value: Math.round(a.usd) })
    for (const p of s.people) {
      const g = pos.filter((a) => a.who === p.id).reduce((x, a) => x + a.usd, 0)
      if (g > 0) links.push({ source: idx(p.name), target: idx(scope === 'yours' ? 'Your total' : 'The Riveras'), value: Math.round(g) })
    }
    return { nodes, links }
  }, [scope])
  return (
    <Panel id="flow-h" title="Where it all comes from" meta={<See>All accounts</See>}>
      <SankeyChart key={scope} data={data} aspectRatio="16 / 8.5" nodeWidth={12} nodePadding={26}>
        <SankeyLink />
        <SankeyNode formatValue={(v) => usd(v, 0)} />
        <SankeyTooltip />
      </SankeyChart>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Every account flows into its owner, every owner into the family. The Amex card isn’t a flow: its {usd(-amex.bal)} comes off the net worth above.
      </p>
    </Panel>
  )
}

function Family() {
  const deck = D.people.map((p, i) => ({
    id: p.id,
    title: p.name,
    subtitle: p.sub,
    art: (
      <div className="flex size-full items-center justify-center" style={{ background: ['#dc2626', '#18181b', '#16a34a'][i] }}>
        <span className="font-[family-name:'Space_Grotesk'] text-6xl font-bold text-white">{p.initial}</span>
      </div>
    ),
    description: p.accounts.map((a) => `${a.name} ${usd(a.usd)}`).join(' · '),
    specs: [
      { label: 'Accounts', value: String(p.accounts.length) },
      { label: 'Currencies', value: [...new Set(p.accounts.map((a) => a.cur))].join(', ') },
      { label: 'Share', value: `${Math.round((p.total / D.total) * 100)}%` },
    ],
    price: usd(p.total),
  }))
  return (
    <Panel id="fam-h" title="Family" meta={<See>Family and sharing</See>} className="flex flex-col">
      <CardStack cards={deck} accent="#dc2626" actionLabel="Open accounts" className="min-h-0 py-1" />
      <p className="mt-auto rounded-2xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        James shares <b className="font-semibold text-zinc-900 dark:text-white">Joint checking</b> with you and keeps his own accounts private.
      </p>
    </Panel>
  )
}

// Row 4 ------------------------------------------------------------------
function Terrain() {
  const data = useMemo(() => {
    const out = []
    let seed = 11
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 13 * 7 - D.today; i++) out.push(Math.round(20 + rnd() * 120))
    let prev = 0
    for (const r of D.series.slice(0, D.today)) {
      out.push(r.spent - prev)
      prev = r.spent
    }
    return out.map((v) => Math.min(9, Math.round(v / 40)))
  }, [])
  return (
    <Panel id="days-h" title="Spending, day by day" meta="Last 13 weeks · drag to tilt">
      <ActivityTerrain data={data} endDate="2026-10-24" title="Daily spending" />
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">The two tall days in October are the bills on the 1st and the 12th.</p>
    </Panel>
  )
}

function Goals() {
  const [trip, fund] = D.goals
  return (
    <Panel id="goals-h" title="Goals" meta={<See>All goals</See>}>
      <BoardingPass
        flight={{
          airline: 'Tallyn Goals',
          number: 'Beach trip',
          from: { code: 'NOW', city: `${usd(trip.saved, 0)} saved`, time: 'Oct 24' },
          to: { code: 'SUN', city: `${usd(trip.target, 0)} goal`, time: 'Jun 27' },
          date: 'June 2027',
          gate: '68%',
          boards: '$200',
          seat: 'All',
          group: '4',
          passenger: 'The Riveras',
          status: 'on-time',
          note: 'On track: put aside $200 a month to make June.',
        }}
      />
      <div className="mt-4">
        <div className="flex justify-between gap-3">
          <span>
            <span className="block font-semibold">Leo’s school fund</span>
            <span className="block text-sm text-zinc-500 dark:text-zinc-400">By September 2027 · follows Teen savings</span>
          </span>
          <span className="text-right">
            <Money v={fund.saved} />
            <span className="block text-sm text-zinc-500 dark:text-zinc-400">of {usd(fund.target, 0)}</span>
          </span>
        </div>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <span className="block h-full rounded-full" style={{ width: `${(fund.saved / fund.target) * 100}%`, background: 'var(--in)' }} />
        </span>
      </div>
    </Panel>
  )
}

export default function RedesignHome() {
  const q = new URLSearchParams(location.search)
  const [dark, setDark] = useState(q.get('t') === 'dark')
  const [scope, setScope] = useState(q.get('s') === 'yours' ? 'yours' : 'everyone')
  const root = useRef(null)
  useArrival(root)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.body.style.background = dark ? '#09090b' : '#fafafa'
  }, [dark])
  const press = (e) => !reduced() && animate(e.currentTarget, { scale: [1, 0.97, 1], duration: 160, ease: EASE })
  return (
    <div
      ref={root}
      style={{ ...PAL, ...TEXT[dark ? 'dark' : 'light'] }}
      className="min-h-svh bg-zinc-50 font-[family-name:Montserrat] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white/90 px-4 py-2 text-[13px] text-zinc-600 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-400">
        <span>
          <b className="text-zinc-900 dark:text-white">Draft for #182 · Home redesign</b> · red, green, white, black · made-up names and amounts
        </span>
        <span className="flex gap-1">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={v === dark}
              onClick={() => setDark(v)}
              className="rounded-full border border-zinc-300 px-3 py-1 font-semibold aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:border-zinc-700 dark:aria-pressed:border-white dark:aria-pressed:bg-white dark:aria-pressed:text-zinc-900"
            >
              {v ? 'Dark' : 'Light'}
            </button>
          ))}
        </span>
      </div>

      <header className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-8 gap-y-3 px-4 pt-5 md:px-8">
        <img src={dark ? lockupDark : lockupLight} alt="Tallyn" className="h-7" />
        <nav aria-label="Main" className="hidden flex-wrap gap-5 text-sm font-semibold text-zinc-500 lg:flex dark:text-zinc-400">
          {['Home', 'Accounts', 'Transactions', 'Budgets', 'Debts', 'Goals', 'Family'].map((n) => (
            <a
              key={n}
              href="#"
              aria-current={n === 'Home' ? 'page' : undefined}
              className="transition-colors duration-150 hover:text-zinc-900 aria-[current=page]:text-zinc-900 dark:hover:text-white dark:aria-[current=page]:text-white"
            >
              {n}
            </a>
          ))}
        </nav>
        <span className="ml-auto flex size-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-bold dark:bg-zinc-800">M</span>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pt-5 pb-28 md:px-8 lg:pb-16">
        <div data-arrive className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:'Space_Grotesk'] text-3xl font-bold tracking-tight">The Rivera family</h1>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              Evening, Maya. <b className="font-semibold text-zinc-900 dark:text-white">{D.finding.strong}</b>
              {D.finding.rest}
            </p>
          </div>
          <button
            type="button"
            onClick={press}
            className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white"
            style={{ background: 'var(--button)' }}
          >
            <Link2 className="size-4" aria-hidden="true" />
            Link a bank
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Total scope={scope} setScope={setScope} />
          </div>
          <div className="grid content-start gap-4 lg:col-span-4">
            <Bills />
            <Cards />
          </div>
          <div className="lg:col-span-8">
            <Spending scope={scope} />
          </div>
          <div className="lg:col-span-4">
            <Recent scope={scope} />
          </div>
          <div className="lg:col-span-8">
            <Flow scope={scope} />
          </div>
          <div className="lg:col-span-4">
            <Family />
          </div>
          <div className="lg:col-span-8">
            <Terrain />
          </div>
          <div className="lg:col-span-4">
            <Goals />
          </div>
        </div>
      </main>

      {/* Phones and tablets: Tallyn's bottom tab bar (Design System) */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
      >
        {[
          ['Home', HomeIcon],
          ['Accounts', Landmark],
          ['Activity', ArrowLeftRight],
          ['Budgets', PieChart],
          ['Family', Users],
        ].map(([n, I]) => (
          <a
            key={n}
            href="#"
            aria-current={n === 'Home' ? 'page' : undefined}
            className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-zinc-500 aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:aria-[current=page]:text-white"
          >
            <I className="size-5" aria-hidden="true" />
            {n}
          </a>
        ))}
      </nav>
    </div>
  )
}
