// Navigation and action icons (#39), drawn to match the comps. Decorative:
// always next to a text label.
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

export const HomeIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </svg>
)
export const AccountsIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 15h3" />
  </svg>
)
// Debts (#27, Dinesh picked A): a bill with a torn edge, "bills I owe".
export const DebtsIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
    <path d="M9 8.5h6M9 12h6M9 15.5h3" />
  </svg>
)
export const MenuIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
export const FamilyIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9.5" r="2.2" />
    <path d="M3.5 19c.7-3 2.9-4.6 5.5-4.6s4.8 1.6 5.5 4.6M15 14.6c2.3 0 4.1 1.3 4.8 3.9" />
  </svg>
)
export const GoalsIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
)
// A gear (#66), so Settings reads as settings, not a sun.
export const SettingsIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M10.3 3.2h3.4l.5 2.4a7 7 0 0 1 1.7 1l2.3-.8 1.7 3-1.8 1.6a7 7 0 0 1 0 2l1.8 1.6-1.7 3-2.3-.8a7 7 0 0 1-1.7 1l-.5 2.4h-3.4l-.5-2.4a7 7 0 0 1-1.7-1l-2.3.8-1.7-3 1.8-1.6a7 7 0 0 1 0-2L3.8 8.8l1.7-3 2.3.8a7 7 0 0 1 1.7-1z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
)
// Two-way arrows (#1, Dinesh picked option 3): money moving in and out.
export const TransactionsIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5M20 16H6M9.5 12.5 6 16l3.5 3.5" />
  </svg>
)
export const PlusIcon = (p) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
// Invites are links, so they share a chain icon (#39).
export const InviteIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </svg>
)
// Sign-in and recovery (#23): notes, and the authenticator list in Settings.
export const LockIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
)
export const PhoneIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 18h2" />
  </svg>
)
