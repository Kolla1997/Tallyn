import { describe, expect, it } from 'vitest'
import { canAddCardDetails, cardsWithoutDetails, dueState, shortDate } from './cards.js'

// Due dates and "Add APR and due dates" (#51, #27).
describe('dueState', () => {
  const today = '2026-10-12'
  it('flags overdue first, whatever the date', () => {
    expect(dueState('2026-11-01', true, today)).toBe('late')
  })
  it('says soon within 5 days, past when gone by', () => {
    expect(dueState('2026-10-12', false, today)).toBe('soon')
    expect(dueState('2026-10-17', false, today)).toBe('soon')
    expect(dueState('2026-10-18', false, today)).toBe('')
    expect(dueState('2020-05-28', false, today)).toBe('past')
    expect(dueState(null, false, today)).toBe('')
  })
})

describe('shortDate', () => {
  it('adds the year only when it isn’t this year', () => {
    const year = new Date().getFullYear()
    expect(shortDate(`${year}-10-28`)).toBe('Oct 28')
    expect(shortDate('2020-05-28')).toBe('May 28, 2020')
  })
})

describe('card details', () => {
  const bank = (status, card_details, accounts = []) => ({ status, card_details, accounts })
  it('offers Add APR and due dates only when it can help', () => {
    expect(canAddCardDetails(bank('active', null))).toBe(true)
    expect(canAddCardDetails(bank('active', 'consent_needed'))).toBe(true)
    expect(canAddCardDetails(bank('active', 'shared'))).toBe(false)
    expect(canAddCardDetails(bank('active', 'not_offered'))).toBe(false)
    expect(canAddCardDetails(bank('needs_reauth', null))).toBe(false)
  })
  it('counts credit cards without details', () => {
    const b = bank('active', null, [{ type: 'credit', card: null }, { type: 'credit', card: {} }, { type: 'depository' }])
    expect(cardsWithoutDetails(b)).toBe(1)
  })
})
