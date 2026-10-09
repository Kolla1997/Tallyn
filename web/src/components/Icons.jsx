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
export const SettingsIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
  </svg>
)
export const PlusIcon = (p) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const InviteIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="8" r="3.2" />
    <path d="M3.8 19c.8-3.2 3.2-4.8 6.2-4.8 1.3 0 2.5.3 3.5.9M18 14v6M15 17h6" />
  </svg>
)
