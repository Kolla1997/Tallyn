// Tallyn Home, calm draft (#182, round 4). Dinesh: the bold drafts felt overwhelming; use only the
// newly installed libraries. Built from Kokonut UI (split-flap text, notification stack, metric card,
// smooth tab) and Bklit (linear gauge), with anime.js only for press feedback (animate skill: nothing
// moves on load on a screen opened daily). Red, green, white, black; the original sidebar; Tallyn's
// fonts and logo. All names and amounts are made up.
//
// Five blocks, two rows on a 12-column grid, 16px gutter:
//   1 Total (8)            | Coming up (4)
//   2 Spending (8)         | Recent transactions + Goals (4)
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'animejs'
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
  ArrowLeftRight,
  Banknote,
  Receipt as DebtsIcon,
  Target,
  Settings as SettingsIcon,
  Menu,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import SplitFlapText from '@/components/kokonutui/split-flap-text'
import NotificationStack from '@/components/kokonutui/notification-stack'
import MetricCard from '@/components/kokonutui/metric-card'
import SmoothTab from '@/components/kokonutui/smooth-tab'
import { Gauge } from '@/components/charts/gauge'
import * as D from './data.js'
import lockupLight from '../../../../brand/logo/svg/tallyn-lockup-horizontal-light.svg?url'
import lockupDark from '../../../../brand/logo/svg/tallyn-lockup-horizontal-dark.svg?url'
import markLight from '../../../../brand/logo/svg/tallyn-mark-light.svg?url'
import markDark from '../../../../brand/logo/svg/tallyn-mark-dark.svg?url'

// One accent: red for the one action and for what is owed. Green only for money in. Everything else
// is black, white and grey. Text shades pass AA on their ground.
const THEME = {
  light: { '--accent': '#dc2626', '--button': '#b91c1c', '--owe-text': '#b91c1c', '--in-text': '#15803d', '--in': '#16a34a' },
  dark: { '--accent': '#dc2626', '--button': '#b91c1c', '--owe-text': '#f87171', '--in-text': '#4ade80', '--in': '#16a34a' },
}
const EASE = 'cubicBezier(0.23, 1, 0.32, 1)'
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const press = (e) => !reduced() && animate(e.currentTarget, { scale: [1, 0.97, 1], duration: 160, ease: EASE })
const usd = D.usd

// ---- Data for the metric card: 90 days of spending in three parts, ending today ----
// October is the draft's real data (Bills $1,640, Kids $420, Everyday $1,426 = $3,486); earlier days
// are made up at a similar level.
const SEGMENTS = ['Bills', 'Everyday', 'Kids and family']
function spendingDays() {
  const out = []
  let seed = 19
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const end = Date.UTC(2026, 9, 24)
  const day = 86400000
  const before = 90 - D.today
  for (let i = 0; i < before; i++) {
    const t = end - (90 - 1 - i) * day
    const dom = new Date(t).getUTCDate()
    out.push({
      date: new Date(t).toISOString().slice(0, 10),
      parts: [dom === 1 ? 1495 : dom === 12 ? 145 : 0, Math.round(25 + rnd() * 70), Math.round(rnd() < 0.7 ? 20 : 0)],
    })
  }
  let prev = 0
  D.series.slice(0, D.today).forEach((r, i) => {
    const spentToday = r.spent - prev
    prev = r.spent
    const bills = i === 0 ? 1495 : i === 11 ? 145 : 0
    const kids = i >= 1 && i <= 21 ? 20 : 0
    out.push({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, parts: [bills, spentToday - bills - kids, kids] })
  })
  return out
}
const BILL_DAYS = [
  { date: '2026-10-01', label: 'October bills' },
  { date: '2026-09-01', label: 'September bills' },
]

const TXS = [
  { kind: 'spending', name: 'Whole Foods', cat: 'Groceries', icon: ShoppingBasket, when: 'Today', who: 'You', amt: -86.4 },
  { kind: 'spending', name: 'Shell', cat: 'Transport', icon: Bus, when: 'Today', who: 'You and James', amt: -48.1 },
  { kind: 'spending', name: 'Little Sprouts', cat: 'Kids', icon: Baby, when: 'Yesterday', who: 'You and James', amt: -120.0 },
  { kind: 'spending', name: 'Nando’s', cat: 'Eating out', icon: Utensils, when: 'Oct 22', who: 'You', amt: -38.75 },
  { kind: 'income', name: 'Payroll · Harlow & Co', cat: 'Pay', icon: Banknote, when: 'Oct 15', who: 'You', amt: 4210.0 },
  { kind: 'income', name: 'James · to Joint', cat: 'From James', icon: Banknote, when: 'Oct 15', who: 'You and James', amt: 1800.0 },
  { kind: 'transfers', name: 'Amex payment', cat: 'Card payment', icon: ArrowLeftRight, when: 'Oct 3', who: 'You', amt: -1102.55 },
  { kind: 'transfers', name: 'To High-yield savings', cat: 'Between your accounts', icon: ArrowLeftRight, when: 'Oct 1', who: 'You', amt: -500.0 },
]

const have = D.accounts.filter((a) => a.usd > 0).reduce((s, a) => s + a.usd, 0)
const owe = -D.accounts.filter((a) => a.usd < 0).reduce((s, a) => s + a.usd, 0)

// ---- Building blocks ----
const Panel = ({ title, meta, children, id, className = '' }) => (
  <section aria-labelledby={id} className={`min-w-0 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
    <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="font-[family-name:'Space_Grotesk'] text-[17px] font-semibold text-zinc-900 dark:text-white">
        {title}
      </h2>
      {meta && <span className="text-sm text-zinc-500 dark:text-zinc-400">{meta}</span>}
    </header>
    {children}
  </section>
)
const See = ({ children }) => (
  <a
    href="#"
    className="text-sm font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900 dark:text-white dark:decoration-zinc-600"
  >
    {children}
  </a>
)

// The card keeps its resting height in the layout; when its list expands it grows over the cards
// below instead of pushing them. Re-measures whenever it is closed, so wraps and font loads follow.
function OpensOver({ children }) {
  const card = useRef(null)
  const [h, setH] = useState(null)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const read = () => {
      const expanded = el.querySelector('[aria-expanded="true"]') != null
      setOpen(expanded)
      if (!expanded) setH(el.offsetHeight)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="relative" style={h == null ? undefined : { height: h }}>
      <div ref={card} className={`${h == null ? '' : 'absolute inset-x-0 top-0'} ${open ? 'z-30 rounded-3xl shadow-2xl shadow-black/30' : ''}`}>
        {children}
      </div>
    </div>
  )
}

// ---- The five blocks ----
function Total() {
  return (
    <section
      aria-label="Total balance"
      className="flex h-full flex-col justify-center gap-4 rounded-3xl bg-zinc-950 p-6 text-white md:p-8 dark:bg-black dark:ring-1 dark:ring-zinc-800"
    >
      <p className="text-sm text-zinc-400">The Rivera family · everything, in US dollars</p>
      <div className="overflow-x-auto">
        <SplitFlapText text={usd(have)} className="text-4xl md:text-6xl" />
      </div>
      <p className="text-sm text-zinc-400">
        Net worth <span className="text-white">{usd(D.total)}</span> after {usd(owe)} owed on the Amex card. Includes £2,150.00 and €1,480.00.
      </p>
    </section>
  )
}

function ComingUp() {
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
        <span className="flex size-8 items-center justify-center rounded-lg text-white" style={{ background: d.inDays <= 5 ? 'var(--accent)' : '#3f3f46' }}>
          <I className="size-4" aria-hidden="true" />
        </span>
      ),
    }
  })
  return (
    <Panel id="due-h" title="Coming up" meta={`Next 8 days · ${usd(D.dueTotal)}`}>
      <NotificationStack notifications={items} />
    </Panel>
  )
}

function Spending() {
  const data = useMemo(() => spendingDays(), [])
  return (
    <section aria-label="Spending" className="min-w-0">
      <MetricCard
        label="Spending"
        segments={SEGMENTS}
        data={data}
        events={BILL_DAYS}
        periods={[7, 30, 90]}
        defaultPeriod={30}
        format="currency"
        upIsGood={false}
        currency="USD"
        className="w-full max-w-none"
      />
      <p className="mt-2 px-1 text-sm text-zinc-500 dark:text-zinc-400">
        October so far: <b className="font-semibold text-zinc-900 dark:text-white">{usd(D.spent, 0)}</b> of the {usd(D.planned, 0)} plan, {usd(D.left, 0)} left
        with {D.days - D.today} days to go.
      </p>
    </section>
  )
}

function Recent() {
  const list = (kind) => (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {TXS.filter((t) => t.kind === kind).map((t) => (
        <li key={t.name + t.when} className="flex items-center gap-3 py-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <t.icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 grow">
            <span className="block truncate font-semibold">{t.name}</span>
            <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
              {t.cat} · {t.when}
            </span>
          </span>
          <span
            className="shrink-0 font-[family-name:'Space_Grotesk'] font-semibold whitespace-nowrap tabular-nums"
            style={t.amt > 0 ? { color: 'var(--in-text)' } : undefined}
          >
            {t.amt > 0 ? '+' : '−'}
            {usd(Math.abs(t.amt))}
          </span>
        </li>
      ))}
    </ul>
  )
  return (
    <Panel id="tx-h" title="Recent transactions" meta={<See>See all</See>}>
      <div className="overflow-hidden">
        <SmoothTab
          label="Kind of transaction"
          activeColor="bg-zinc-900 dark:bg-white"
          activeTextColor="text-white dark:text-zinc-900"
          items={[
            { id: 'spending', title: 'Spending', content: list('spending') },
            { id: 'transfers', title: 'Transfers', content: list('transfers') },
            { id: 'income', title: 'Income', content: list('income') },
          ]}
        />
      </div>
    </Panel>
  )
}

function Goals() {
  return (
    <Panel id="goals-h" title="Goals" meta={<See>All goals</See>}>
      <ul className="grid gap-4">
        {D.goals.map((g) => {
          const pct = Math.round((g.saved / g.target) * 100)
          return (
            <li key={g.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{g.name}</span>
                <span className="font-[family-name:'Space_Grotesk'] font-semibold tabular-nums">
                  {usd(g.saved, 0)}{' '}
                  <span className="font-[family-name:Montserrat] text-sm font-normal text-zinc-500 dark:text-zinc-400">of {usd(g.target, 0)}</span>
                </span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                By {g.by} · {pct}%
              </p>
              <div className="mt-2">
                <Gauge
                  orientation="linear"
                  value={pct}
                  totalNotches={28}
                  activeFill="var(--in)"
                  defaultLabel={g.name}
                  suffix="%"
                  minWidth={160}
                  linearHeight={18}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// ---- The original sidebar (Shell.jsx): only the colours are new ----
const SIDEBAR = [
  ['Home', HomeIcon],
  ['Accounts', Landmark],
  ['Transactions', ArrowLeftRight],
  ['Budgets', PieChart],
  ['Debts', DebtsIcon],
  ['Family', Users],
  ['Goals', Target],
  ['Settings', SettingsIcon],
]
function Sidebar({ dark, collapsed, onToggle }) {
  return (
    <aside
      aria-label="Main"
      className={`fixed top-[52px] bottom-3 left-3 z-40 hidden flex-col rounded-3xl border border-zinc-200 bg-white p-3 transition-[width] duration-200 ease-out lg:flex dark:border-zinc-800 dark:bg-zinc-900 ${collapsed ? 'w-[60px] items-center' : 'w-[208px]'}`}
    >
      <div className={`mb-4 flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between pl-2'}`}>
        {collapsed ? (
          <img src={dark ? markDark : markLight} alt="Tallyn" className="size-8" />
        ) : (
          <img src={dark ? lockupDark : lockupLight} alt="Tallyn" className="h-7" />
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          {collapsed ? <ChevronsRight className="size-4" aria-hidden="true" /> : <ChevronsLeft className="size-4" aria-hidden="true" />}
        </button>
      </div>
      <nav className="flex flex-col gap-1">
        {SIDEBAR.map(([label, I]) => (
          <a
            key={label}
            href="#"
            title={collapsed ? label : undefined}
            aria-current={label === 'Home' ? 'page' : undefined}
            className={`flex h-10 items-center gap-3 rounded-xl text-sm font-semibold text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 aria-[current=page]:bg-zinc-100 aria-[current=page]:text-[var(--owe-text)] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:aria-[current=page]:bg-zinc-800 ${collapsed ? 'w-[42px] justify-center' : 'px-3'}`}
          >
            <I className="size-[18px] shrink-0" aria-hidden="true" />
            <span className={collapsed ? 'sr-only' : undefined}>{label}</span>
          </a>
        ))}
      </nav>
      <button
        type="button"
        aria-label="Maya Rivera, owner of The Rivera family. Open profile menu"
        className={`mt-auto flex h-12 items-center gap-2.5 rounded-2xl text-left transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${collapsed ? 'w-[42px] justify-center' : 'px-2'}`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
          M
        </span>
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">Maya Rivera</span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">Owner · The Rivera family</span>
          </span>
        )}
      </button>
    </aside>
  )
}

export default function CalmHome() {
  const q = new URLSearchParams(location.search)
  const [dark, setDark] = useState(q.get('t') === 'dark')
  const [collapsed, setCollapsed] = useState(q.get('nav') === 'collapsed')
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.body.style.background = dark ? '#09090b' : '#fafafa'
  }, [dark])
  return (
    <div
      style={THEME[dark ? 'dark' : 'light']}
      className="min-h-svh bg-zinc-50 font-[family-name:Montserrat] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white/90 px-4 py-2 text-[13px] text-zinc-600 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-400">
        <span>
          <b className="text-zinc-900 dark:text-white">Draft for #182 · calm Home</b> · Kokonut, Bklit and anime.js only · made-up names and amounts
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

      <Sidebar dark={dark} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 lg:hidden dark:border-zinc-800">
        <img src={dark ? lockupDark : lockupLight} alt="Tallyn" className="h-7" />
        <button type="button" aria-label="Menu" className="flex size-10 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700">
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      <main className={`px-4 pt-6 pb-28 transition-[padding] duration-200 ease-out md:px-8 lg:pb-16 lg:pr-8 ${collapsed ? 'lg:pl-[96px]' : 'lg:pl-[244px]'}`}>
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-[family-name:'Space_Grotesk'] text-3xl font-bold tracking-tight">The Rivera family</h1>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                Evening, Maya. <b className="font-semibold text-zinc-900 dark:text-white">{D.finding.strong}</b>
                {D.finding.rest}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={press}
                className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white"
                style={{ background: 'var(--button)' }}
              >
                <Link2 className="size-4" aria-hidden="true" />
                Link a bank
              </button>
              <a
                href="#"
                onClick={press}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-300 px-4 text-sm font-semibold dark:border-zinc-700"
              >
                <Users className="size-4" aria-hidden="true" />
                Family and sharing
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
            <div className="lg:col-span-8">
              <Total />
            </div>
            <div className="lg:col-span-4">
              <OpensOver>
                <ComingUp />
              </OpensOver>
            </div>
            <div className="lg:col-span-8">
              <Spending />
            </div>
            <div className="grid content-start gap-4 lg:col-span-4">
              <Recent />
              <Goals />
            </div>
          </div>
        </div>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
      >
        {[
          ['Home', HomeIcon],
          ['Accounts', Landmark],
          ['Transactions', ArrowLeftRight],
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
