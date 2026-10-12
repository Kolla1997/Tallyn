// Card details helpers (#51). "Add APR and due dates" only shows when it can
// help: the bank hasn't been asked yet, or it needs the person's permission.
// Once the bank has said it shares card details (or doesn't offer them),
// cards without details just say so.

export const canAddCardDetails = (bank) =>
  bank.status === 'active' && (bank.card_details == null || bank.card_details === 'consent_needed')

// Credit cards at this bank that have no APR or due date yet.
export const cardsWithoutDetails = (bank) => bank.accounts.filter((a) => a.type === 'credit' && !a.card).length
