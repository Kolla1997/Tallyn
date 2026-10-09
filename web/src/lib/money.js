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
    return `${minor} ${currency}` // a code Intl doesn't know (e.g. crypto)
  }
}
