// Card details helpers (#51). "Add APR and due dates" only shows when it can
// help: the bank hasn't been asked yet, or it needs the person's permission.
// Once the bank has said it shares card details (or doesn't offer them),
// cards without details just say so.

export const canAddCardDetails = (bank) => bank.status === 'active' && (bank.card_details == null || bank.card_details === 'consent_needed')

// Credit cards at this bank that have no APR or due date yet.
export const cardsWithoutDetails = (bank) => bank.accounts.filter((a) => a.type === 'credit' && !a.card).length

// Due dates (#51, #27): "Oct 28" this year, "Jan 3, 2027" in any other.
// A date that has passed and isn't flagged overdue reads "Last due …": the
// bank hasn't sent the next one yet.
export function shortDate(iso) {
  const d = new Date(`${iso}T12:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "soon" within 5 days, "past" if gone by, "late" if the bank says overdue.
export function dueState(due, overdue, today = todayISO()) {
  if (overdue) return 'late'
  if (!due) return ''
  const days = (new Date(`${due}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000
  if (days < 0) return 'past'
  return days <= 5 ? 'soon' : ''
}
