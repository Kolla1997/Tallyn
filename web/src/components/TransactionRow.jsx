// Merchant names (#42), used on Home and the Transactions page. Banks often send names in capitals
// with clutter ("CREDIT CARD 3333 PAYMENT *//"): show them in sentence case without it. Display
// only: the stored name is unchanged. Names that already have lower case ("Uber") are left alone.
const KEEP_CAPS = new Set(['ACH', 'ATM', 'CD', 'HSA', 'IRA', 'IRS', 'LLC', 'UPS', 'USA'])

export function cleanName(name = '') {
  if (/[a-z]/.test(name)) return name
  const words = name
    .replace(/[*/#\\|_]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
  const out = words.map((w) => (KEEP_CAPS.has(w) ? w : w.toLowerCase())).join(' ')
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : name
}
