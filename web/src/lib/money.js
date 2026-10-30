// Formats an amount stored in minor units (cents, pence, yen...) with its
// currency symbol and the currency's own decimals: $4,210.00, ¥1,234.
// Display only: amounts are never calculated here.
export function formatMoney(minor, currency) {
  if (minor === null || minor === undefined) return '—'
  try {
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency })
    const digits = f.resolvedOptions().maximumFractionDigits
    return f.format(minor / 10 ** digits)
  } catch {
    // A code Intl doesn't know (e.g. crypto): we can't know its decimals, so
    // show the stored number plainly rather than guess (#154).
    return `${Number(minor).toLocaleString('en-US')} ${currency || ''}`.trim()
  }
}

// Plaid's category codes as words: FOOD_AND_DRINK → "Food and drink".
export function categoryLabel(code) {
  if (!code || code === 'OTHER') return 'Other'
  const words = code.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
