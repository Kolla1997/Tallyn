import { useState } from 'react'
import { IconTile } from './calm/ui.jsx'

// Transaction icons (#42): the merchant's logo from Plaid when there is one,
// otherwise an icon for the spending category. Logos only ever load from
// Plaid's two logo hosts (the server checks this too, see
// 0009_transaction_logos.sql), without a referrer.

const LOGO_RE = /^https:\/\/plaid-(merchant|counterparty)-logos\.plaid\.com\/[A-Za-z0-9._-]+\.png$/

// One stroke path per Plaid category, drawn on a 24px grid.
const CATEGORIES = {
  FOOD_AND_DRINK: { tone: 'clay', d: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7h3' },
  GENERAL_MERCHANDISE: { tone: 'clay', d: 'M6 7h12l-1 13H7L6 7ZM9 7a3 3 0 0 1 6 0' },
  TRANSPORTATION: { tone: 'sage', d: 'M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13.5h.01M16.5 13.5h.01' },
  TRAVEL: { tone: 'sage', d: 'M3 13.5 21 7l-2.5 3.5L12 14l1 6-2.5-1-1.5-4.5L6 15.5z' },
  RENT_AND_UTILITIES: { tone: 'sand', d: 'M4 10.5 12 4l8 6.5V20H4zM10 20v-5h4v5' },
  HOME_IMPROVEMENT: { tone: 'sand', d: 'M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L13 17.2 9.8 20.4a1.6 1.6 0 0 1-2.2-2.2L10.8 15 16.9 8.9' },
  ENTERTAINMENT: { tone: 'clay', d: 'M4 6h16v12H4zM10 9.5v5l4-2.5z' },
  PERSONAL_CARE: { tone: 'sage', d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z' },
  MEDICAL: { tone: 'sage', d: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z' },
  GENERAL_SERVICES: {
    tone: 'sand',
    d: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  },
  GOVERNMENT_AND_NON_PROFIT: { tone: 'sand', d: 'M3 9 12 4l9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18' },
  BANK_FEES: { tone: 'sand', d: 'M3 8h18v10H3zM3 12h18M7 16h3' },
  LOAN_PAYMENTS: { tone: 'sand', d: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  INCOME: { tone: 'sage', d: 'M12 19V5M6 11l6-6 6 6' },
  TRANSFER_IN: { tone: 'sage', d: 'M7 17 17 7M9 7h8v8' },
  TRANSFER_OUT: { tone: 'sand', d: 'M17 7 7 17M15 17H7V9' },
}
const OTHER = { tone: 'sand', d: 'M6 12h.01M12 12h.01M18 12h.01' }

// The stroke path for a category's icon, for other places that draw it.
export const categoryPath = (category) => (CATEGORIES[category] ?? OTHER).d

// A transaction's icon in the calm tile (#187): the merchant's logo when Plaid has one (only from
// its logo hosts, no referrer), otherwise the category's icon.
export default function TxIcon({ tx }) {
  const [failed, setFailed] = useState(false)
  const logo = tx.logo_url && LOGO_RE.test(tx.logo_url) && !failed ? tx.logo_url : null
  if (logo) {
    return (
      <span className="flex size-8 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 dark:ring-zinc-700" aria-hidden="true">
        <img src={logo} alt="" width="32" height="32" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    )
  }
  return (
    <IconTile>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d={categoryPath(tx.category_primary)} />
      </svg>
    </IconTile>
  )
}
