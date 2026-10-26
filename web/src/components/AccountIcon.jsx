// Account type icons (#39), on a plain grey tile (calm redesign #187: colour is for money, not icons).
// Picked from Plaid's account type and subtype. Decorative: the account name
// is always next to it.

const PATHS = {
  everyday: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0 1.5-2.4A1 1 0 0 1 6.4 4H16M16 13.5h.01',
  savings: 'M5 12a7 6 0 0 1 12-3h2v3l-1.5 1.5V17h-3v-1.5h-5V17h-3v-2.5A6 6 0 0 1 5 12ZM10 9.5h3',
  investment: 'M4 17l6-6 4 4 6-7M15 8h5v5',
  card: 'M3 6.5h18v11H3zM3 10.5h18M7 15h3',
  home: 'M4 10.5 12 4l8 6.5V20h-5v-5h-6v5H4z',
  student: 'M2 9l10-5 10 5-10 5zM6 11v5c2 2 10 2 12 0v-5',
  auto: 'M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13.5h.01M16.5 13.5h.01',
  loan: 'M3 9 12 4l9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18',
}

const SAVINGS = new Set(['savings', 'money market', 'cd', 'hsa'])

export function accountKind(a) {
  const sub = (a.subtype ?? '').toLowerCase()
  if (a.type === 'investment' || a.type === 'brokerage') return 'investment'
  if (a.type === 'credit') return 'card'
  if (a.type === 'loan') {
    if (sub === 'mortgage' || sub === 'home equity') return 'home'
    if (sub === 'student') return 'student'
    if (sub === 'auto') return 'auto'
    return 'loan'
  }
  return SAVINGS.has(sub) ? 'savings' : 'everyday'
}

export default function AccountIcon({ account }) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
      aria-hidden="true"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d={PATHS[accountKind(account)]} />
      </svg>
    </span>
  )
}
