import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DebtStack from './DebtStack.jsx'

// The cards-and-debts heading (#1): the count badge is for the eye, and
// screen readers hear the count in words, not "debts0".
const card = { id: 'c1', name: 'Fake card', type: 'credit', subtype: 'credit card', currency: 'USD', current_balance_minor: 30000, bankName: 'Fake Bank' }
const loan = { id: 'l1', name: 'Fake loan', type: 'loan', subtype: 'student', currency: 'USD', current_balance_minor: 900000, bankName: 'Fake Bank' }

describe('DebtStack heading', () => {
  it('reads the count in words', () => {
    render(<DebtStack title="Pat's cards and debts" accounts={[card, loan]} home="USD" />)
    expect(screen.getByRole('heading', { name: "Pat's cards and debts (2 cards and loans)" })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: "Pat's cards and debts (2 cards and loans)" })).toBeInTheDocument()
  })

  it('one, and none', () => {
    const { unmount } = render(<DebtStack title="Your cards and debts" accounts={[card]} home="USD" />)
    expect(screen.getByRole('heading', { name: 'Your cards and debts (1 card or loan)' })).toBeInTheDocument()
    unmount()
    render(<DebtStack title="Your cards and debts" accounts={[]} home="USD" />)
    expect(screen.getByRole('heading', { name: 'Your cards and debts (0 cards and loans)' })).toBeInTheDocument()
    expect(screen.getByText('No credit cards or loans.')).toBeInTheDocument()
  })
})
