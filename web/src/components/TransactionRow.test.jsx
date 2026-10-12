import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TransactionRow, { cleanName } from './TransactionRow.jsx'

describe('cleanName', () => {
  it('tidies bank capitals, keeps names that have lower case', () => {
    expect(cleanName('CREDIT CARD 3333 PAYMENT *//')).toBe('Credit card 3333 payment')
    expect(cleanName('CD DEPOSIT .INITIAL.')).toBe('CD deposit initial')
    expect(cleanName('Uber')).toBe('Uber')
  })
})

describe('TransactionRow', () => {
  const tx = {
    id: 't1',
    owner_user_id: 'me',
    amount_minor: 540,
    currency: 'USD',
    date: '2026-10-10',
    merchant: 'Uber',
    category_primary: 'TRANSPORTATION',
    bank_name: 'PNC',
    account_mask: '0000',
  }
  it('shows the bank only when asked (#83)', () => {
    const { rerender } = render(
      <ul>
        <TransactionRow tx={tx} meId="me" people={{}} />
      </ul>,
    )
    expect(screen.queryByText(/PNC/)).not.toBeInTheDocument()
    rerender(
      <ul>
        <TransactionRow tx={tx} meId="me" people={{}} showBank />
      </ul>,
    )
    expect(screen.getAllByText(/PNC ••0000/).length).toBeGreaterThan(0)
  })
  it('shows money out as minus and money in as plus', () => {
    render(
      <ul>
        <TransactionRow tx={tx} meId="me" people={{}} />
      </ul>,
    )
    expect(screen.getByText('−$5.40')).toBeInTheDocument()
  })
})
