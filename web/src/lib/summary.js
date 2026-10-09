// Totals for the Home and Accounts pages (#39). Display only: all amounts are
// integers in minor units, added as integers, never as floats.
//
// "Have" is money in depository and investment accounts. "Owe" is what's owed
// on credit cards and loans (Plaid reports their current balance as the amount
// owed). Net worth = have - owe. Totals stay per currency until conversion
// (#11) exists.

const OWED_TYPES = new Set(['credit', 'loan'])
const KID_ROLES = new Set(['teen', 'child'])

export function isOwed(account) {
  return OWED_TYPES.has(account.type)
}

// Who each account belongs to, from the viewer's point of view.
export function ownerGroup(ownerId, meId, roles) {
  if (ownerId === meId) return 'yours'
  if (KID_ROLES.has(roles[ownerId])) return 'kids'
  return 'shared'
}

// summarize returns { [currency]: { have, owe, net, yours, shared, kids } },
// the accounts' "have" split by whose they are.
export function summarize(banks, meId, roles) {
  const out = {}
  for (const bank of banks) {
    for (const a of bank.accounts) {
      if (a.current_balance_minor === null || a.current_balance_minor === undefined) continue
      const t = (out[a.currency] ||= { have: 0, owe: 0, net: 0, yours: 0, shared: 0, kids: 0 })
      if (isOwed(a)) {
        t.owe += a.current_balance_minor
      } else {
        t.have += a.current_balance_minor
        t[ownerGroup(bank.owner_user_id, meId, roles)] += a.current_balance_minor
      }
    }
  }
  for (const t of Object.values(out)) t.net = t.have - t.owe
  return out
}

// The household's home currency first, then the rest alphabetically.
export function currencies(totals, home) {
  return Object.keys(totals).sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)))
}
