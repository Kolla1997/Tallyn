// Savings goals (#14, Dinesh picked the mix of draft 2): the sums and words
// behind the Goals page. The server sends each goal with its amount and
// month-end history only where the viewer may see them (internal/db/goals.go);
// saved_minor is null when the progress is private.

const monthIndex = (iso) => +iso.slice(0, 4) * 12 + (+iso.slice(5, 7) - 1)
const monthName = (iso, withYear = true) =>
  new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
const addMonths = (iso, n) => {
  const i = monthIndex(iso) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`
}
const lastDay = (today) => new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate()

// Months from this month to the goal's month: Oct → June is 8.
export function monthsLeft(goal, today) {
  return goal.by_month ? monthIndex(goal.by_month) - monthIndex(today) : null
}

// What it takes each month to get there on time, from what's left now.
export function perMonth(goal, today) {
  const months = monthsLeft(goal, today)
  if (goal.saved_minor == null || months == null || months <= 0) return null
  const left = goal.target_minor - goal.saved_minor
  return left > 0 ? Math.ceil(left / months) : 0
}

// The amount at the end of last month, or null if the goal has no history
// from before this month (it's new, so "this month" starts next month).
function lastMonthEnd(goal, today) {
  const before = (goal.history ?? []).filter((h) => monthIndex(h.month) < monthIndex(today))
  return before.length ? before.at(-1).saved_minor : null
}

// This month's set-asides (from H): for each goal with a month and visible
// progress, the share due this month, what's been added since the 1st, and
// whether that's done. Goals reached already, or new this month, are left out.
export function thisMonth(goals, today) {
  return goals
    .filter((g) => g.saved_minor != null && g.by_month && g.saved_minor < g.target_minor)
    .map((g) => {
      const start = lastMonthEnd(g, today)
      if (start == null) return null
      const months = monthIndex(g.by_month) - monthIndex(today)
      const due = months > 0 ? Math.ceil((g.target_minor - start) / months) : g.target_minor - start
      const added = Math.max(0, g.saved_minor - start)
      return { goal: g, due, added, done: added >= due }
    })
    .filter(Boolean)
}

// The answer at the top, in words.
export function summary(list, today, money) {
  const by = `${lastDay(today)} ${monthName(today, false).slice(0, 3)}`
  if (!list.length) return { title: 'Nothing to put aside this month.', detail: '' }
  const done = list.filter((s) => s.done).length
  const title = done === list.length ? 'All set-asides are done this month.' : `${done} of ${list.length} set-asides are done this month.`
  const next = list.find((s) => !s.done)
  const detail = next ? `${next.goal.name} still needs ${money(next.due - next.added, next.goal.currency)} by ${by}.` : ''
  return { title, detail, by }
}

// The forecast (from G): where the pace since the first month on record lands.
// Needs a month on record before this one (with today's amount, that's two
// points); null until then.
export function forecast(goal, today) {
  const h = goal.history ?? []
  if (goal.saved_minor == null || !h.length) return null
  const first = h[0]
  const months = monthIndex(today) - monthIndex(first.month)
  if (months <= 0) return null
  const pace = (goal.saved_minor - first.saved_minor) / months
  if (goal.saved_minor >= goal.target_minor) return { reached: true, pace }
  if (pace <= 0) return { stalled: true, pace }
  const lands = addMonths(today, Math.ceil((goal.target_minor - goal.saved_minor) / pace))
  const vs = goal.by_month ? monthIndex(goal.by_month) - monthIndex(lands) : null // + early, - late
  return { pace: Math.round(pace), lands, landsName: monthName(lands), vs }
}

export function forecastWords(f, goal) {
  if (!f) return 'The forecast shows after this goal’s second month.'
  if (f.reached) return `${goal.name} is there. Well done.`
  if (f.stalled) return `${goal.name} hasn’t grown since it started, so there’s no date to show yet.`
  const when = `At this pace you’ll be there in ${f.landsName}`
  if (f.vs == null) return `${when}.`
  if (f.vs === 0) return `${when}, right on time.`
  const n = Math.abs(f.vs)
  return `${when}, about ${n} ${n === 1 ? 'month' : 'months'} ${f.vs > 0 ? 'early' : 'late'}.`
}

// The next milestone (from F): a quarter, halfway, three quarters, there.
const STOPS = [
  [0.25, 'a quarter'],
  [0.5, 'halfway'],
  [0.75, 'three quarters'],
  [1, 'the goal'],
]
export function nextMilestone(goal) {
  if (goal.saved_minor == null || goal.saved_minor >= goal.target_minor) return null
  const share = goal.saved_minor / goal.target_minor
  const [at, name] = STOPS.find(([s]) => share < s)
  return { name, left: Math.ceil(at * goal.target_minor - goal.saved_minor), at }
}

// Total saved and targeted in the home currency, and how many goals are in
// another one (no conversion, #11).
export function totals(goals, home) {
  const mine = goals.filter((g) => g.saved_minor != null)
  const inHome = mine.filter((g) => g.currency === home)
  return {
    saved: inHome.reduce((t, g) => t + g.saved_minor, 0),
    target: inHome.reduce((t, g) => t + g.target_minor, 0),
    count: inHome.length,
    other: mine.length - inHome.length,
  }
}

export { monthName }
