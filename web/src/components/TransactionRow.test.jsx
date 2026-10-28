import { describe, expect, it } from 'vitest'
import { cleanName } from './TransactionRow.jsx'

describe('cleanName', () => {
  it('tidies bank capitals, keeps names that have lower case', () => {
    expect(cleanName('CREDIT CARD 3333 PAYMENT *//')).toBe('Credit card 3333 payment')
    expect(cleanName('CD DEPOSIT .INITIAL.')).toBe('CD deposit initial')
    expect(cleanName('Uber')).toBe('Uber')
  })
})
